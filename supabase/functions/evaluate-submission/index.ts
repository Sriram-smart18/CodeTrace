// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  aiNotConfiguredMessage,
  callOpenRouterChatCompletion,
  FRONTEND_AI_ERROR,
  isOpenRouterConfigured,
  JSON_EVALUATOR_SYSTEM_PROMPT,
  parseOpenRouterJsonContent,
} from "../_shared/lib/ai/openrouter.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { calculateAcademicIntegrity } from "../_shared/lib/integrityEngine.ts";

type EvaluationJson = {
  quality: {
    readability: number;
    naming: number;
    modularity: number;
    complexity: number;
  };
  feedback: string;
  strengths: string[];
  improvements: string[];
};

interface SubmissionTestResult {
  passed: boolean;
  test_cases: {
    is_hidden: boolean;
  } | null;
}

const EVALUATION_FALLBACK: EvaluationJson = {
  quality: {
    readability: 60,
    naming: 60,
    modularity: 60,
    complexity: 60,
  },
  feedback: "Automatic quality evaluation partially completed.",
  strengths: [],
  improvements: [],
};

serve(async (req: Request) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    console.log("[evaluate-submission] request received", req.method);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const isServiceCall = token === SUPABASE_SERVICE_ROLE_KEY;
    let userRole = "service";
    let userId = "";

    if (!isServiceCall) {
      const userSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } }
      });
      const { data: { user }, error: userErr } = await userSupabase.auth.getUser();
      if (userErr || !user) {
        return jsonResponse({ error: "Unauthorized: Invalid token" }, 401);
      }
      userId = user.id;

      const { data: profile } = await userSupabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      if (!profile || (profile.role !== "teacher" && profile.role !== "admin")) {
        return jsonResponse({ error: "Forbidden: Teacher or Admin role required" }, 403);
      }
      userRole = profile.role;
    }

    const body = await req.json();
    const submission_id = body?.submission_id as string | undefined;
    console.log("[evaluate-submission] parsed body", { submission_id });

    if (!submission_id) {
      return jsonResponse({ error: "submission_id is required" }, 400);
    }

    if (!isOpenRouterConfigured()) {
      console.error("[evaluate-submission] OPENROUTER_API_KEY missing");
      return jsonResponse({ error: aiNotConfiguredMessage() }, 500);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: submission, error: subErr } = await supabase
      .from("submissions")
      .select("*, assignments(*)")
      .eq("id", submission_id)
      .single();

    if (subErr || !submission) {
      console.error("[evaluate-submission] submission fetch failed", subErr);
      return jsonResponse({ error: "Submission not found" }, 404);
    }

    // Verify teacher owns the assignment (if not admin/service)
    if (userRole !== "admin" && userRole !== "service") {
      const createdBy = submission.assignments?.created_by;
      if (createdBy !== userId) {
        return jsonResponse({ error: "Forbidden: You do not own this assignment" }, 403);
      }
    }

    console.log("[evaluate-submission] submission loaded", {
      assignment_id: submission.assignment_id,
      student_id: submission.student_id,
    });

    const assignment = submission.assignments;
    const totalMarks = assignment?.total_marks || 100;
    const code = submission.code || "";
    const difficulty = assignment?.difficulty || "Medium";
    const expectedSkillLevel = assignment?.expected_skill_level || "Beginner";
    const behavioralLog = submission.behavioral_log;

    // 1. Correctness Score (hidden vs visible tests)
    const { data: testResults, error: trErr } = await supabase
      .from("submission_test_results")
      .select("*, test_cases(*)")
      .eq("submission_id", submission_id);

    let correctnessScore = 100;
    let visiblePassed = 0;
    let visibleTotal = 0;
    let hiddenPassed = 0;
    let hiddenTotal = 0;

    if (!trErr && testResults && testResults.length > 0) {
      (testResults as unknown as SubmissionTestResult[]).forEach((tr) => {
        const isHidden = tr.test_cases?.is_hidden || false;
        if (isHidden) {
          hiddenTotal++;
          if (tr.passed) hiddenPassed++;
        } else {
          visibleTotal++;
          if (tr.passed) visiblePassed++;
        }
      });

      const visibleScore = visibleTotal > 0 ? (visiblePassed / visibleTotal) * 100 : 100;
      const hiddenScore = hiddenTotal > 0 ? (hiddenPassed / hiddenTotal) * 100 : 100;

      if (visibleTotal > 0 && hiddenTotal > 0) {
        correctnessScore = Math.round((visibleScore + hiddenScore) / 2);
      } else if (visibleTotal > 0) {
        correctnessScore = Math.round(visibleScore);
      } else if (hiddenTotal > 0) {
        correctnessScore = Math.round(hiddenScore);
      }
    }

    // 2. Plagiarism Score (AST similarity, Winnowing, Levenshtein, token similarity)
    let plagiarismSimilarity = 0;
    let plagiarismDetails = {
      ast_similarity: 0,
      winnowing_similarity: 0,
      levenshtein_distance: 0,
      token_similarity: 0,
      matched_submission_ids: [] as string[],
      matched_student_ids: [] as string[],
      similarity_percentage: 0,
      matched_student_count: 0,
      plagiarism_explanation: "No matches found.",
    };

    try {
      const plagRes = await fetch(`${SUPABASE_URL}/functions/v1/check-plagiarism`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          submission_id,
          assignment_id: submission.assignment_id,
          student_id: submission.student_id,
        }),
      });

      if (plagRes.ok) {
        const plagData = await plagRes.json();
        plagiarismSimilarity = plagData.highest_peer_similarity || 0;
        
        plagiarismDetails = {
          ast_similarity: plagData.details?.ast_similarity || 0,
          winnowing_similarity: plagData.details?.winnowing_similarity || 0,
          levenshtein_distance: plagData.details?.levenshtein_distance || 0,
          token_similarity: plagData.details?.token_similarity || 0,
          structural_similarity: plagData.plagiarism_details?.structural_similarity || 0,
          matched_submission_ids: plagData.plagiarism_details?.matched_submission_ids || [],
          matched_student_ids: plagData.plagiarism_details?.matched_student_ids || [],
          similarity_percentage: plagData.plagiarism_details?.similarity_percentage || 0,
          matched_student_count: plagData.plagiarism_details?.matched_student_count || 0,
          plagiarism_explanation: plagData.plagiarism_details?.plagiarism_explanation || "No matches found.",
          score_breakdown: plagData.plagiarism_details?.score_breakdown || null,
          match_metadata: plagData.plagiarism_details?.match_metadata || null,
          behavioral_indicators: plagData.plagiarism_details?.behavioral_indicators || [],
          style_inconsistency_detected: plagData.plagiarism_details?.style_inconsistency_detected || false
        };
      }
    } catch (plagErr) {
      console.error("[evaluate-submission] plagiarism call failed:", plagErr);
    }

    let plagiarismScore = 100 - plagiarismSimilarity; // Integrity score

    // 3. Quality Score via LLM
    const behavioralContext = behavioralLog
      ? `Behavioral Summary:
  - Paste Count: ${behavioralLog.paste_count ?? "N/A"}
  - Largest Paste: ${behavioralLog.largest_paste_size ?? "N/A"} chars
  - Typing Time: ${behavioralLog.total_typing_time ?? "N/A"}s
  - Idle Time: ${behavioralLog.idle_time ?? "N/A"}s
  - Typing Speed: ${behavioralLog.typing_speed_estimate ?? "N/A"} chars/min
  - Deletions: ${behavioralLog.deletion_frequency ?? "N/A"}
  - Session Duration: ${behavioralLog.submission_duration ?? "N/A"}s`
      : "Behavioral Summary: Not available";

    const jsonSchemaPrompt = `Return JSON in exactly this shape:
{
  "quality": {
    "readability": <number 0-100>,
    "naming": <number 0-100>,
    "modularity": <number 0-100>,
    "complexity": <number 0-100>
  },
  "feedback": "<string>",
  "strengths": ["<string>"],
  "improvements": ["<string>"]
}`;

    const userPrompt = `Evaluate this programming submission.

ASSIGNMENT:
- Title: ${assignment?.title || "Unknown"}
- Description: ${assignment?.description || "N/A"}
- Difficulty: ${difficulty}
- Expected Skill: ${expectedSkillLevel}
- Max Marks: ${totalMarks}

${behavioralContext}

STUDENT CODE:
\`\`\`
${code}
\`\`\`

${jsonSchemaPrompt}`;

    console.log("[evaluate-submission] calling OpenRouter (plain JSON)");
    const aiResult = await callOpenRouterChatCompletion({
      messages: [
        { role: "system", content: JSON_EVALUATOR_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
    });

    let rawJson: EvaluationJson;
    if (aiResult.ok) {
      rawJson = parseOpenRouterJsonContent<EvaluationJson>(
        aiResult.data,
        EVALUATION_FALLBACK,
        "[evaluate-submission]"
      );
    } else {
      console.error("[evaluate-submission] OpenRouter failed", aiResult.status);
      rawJson = EVALUATION_FALLBACK;
    }

    const readability = Math.min(Math.max(Number(rawJson.quality?.readability) || 60, 0), 100);
    const naming = Math.min(Math.max(Number(rawJson.quality?.naming) || 60, 0), 100);
    const modularity = Math.min(Math.max(Number(rawJson.quality?.modularity) || 60, 0), 100);
    const complexity = Math.min(Math.max(Number(rawJson.quality?.complexity) || 60, 0), 100);
    const qualityScore = Math.round((readability + naming + modularity + complexity) / 4);

    // 4. Combined Scoring & Behavioral Integrity Engine v3.2 (Final Version)
    const telemetry = { ...submission.behavioral_log };
    
    // Calculate submitDelayAfterLastPaste (seconds) if missing
    if (telemetry.submitDelayAfterLastPaste === undefined || telemetry.submitDelayAfterLastPaste === null) {
      if (telemetry.last_paste_time && submission.submitted_at) {
        const lastPasteMs = new Date(telemetry.last_paste_time).getTime();
        const submitMs = new Date(submission.submitted_at).getTime();
        telemetry.submitDelayAfterLastPaste = Math.max(0, Math.round((submitMs - lastPasteMs) / 1000));
      } else {
        telemetry.submitDelayAfterLastPaste = null;
      }
    }

    const aiReviewScore = plagiarismDetails.score_breakdown?.ai_score || 0;
    const finalCodeLength = code.length || (Number(telemetry.typedCharacters || 0) + Number(telemetry.effective_pasted_chars || 0));

    const integrityResult = calculateAcademicIntegrity(
      telemetry,
      plagiarismSimilarity,
      aiReviewScore,
      correctnessScore,
      qualityScore,
      finalCodeLength
    );

    const {
      academicIntegrityScore,
      codeOwnershipScore,
      behavioralTrust,
      similarityScore,
      processScore,
      focusScore,
      fraudIndicatorCount,
      riskLevel,
      integrityVerdict,
      overallScoreBeforeCaps,
      overallScoreAfterCaps,
      penaltiesApplied,
      evidence
    } = integrityResult;

    const overallScore = overallScoreAfterCaps;
    plagiarismScore = academicIntegrityScore;

    // Telemetry display/metadata calculations
    const typedCharacters = Number(telemetry.typedCharacters || 0);
    const effectivePastedChars = Number(telemetry.effective_pasted_chars || 0);
    const pasteRatio = finalCodeLength > 0 ? Math.min(1, effectivePastedChars / finalCodeLength) : 0;
    const activeCodingTime = Number(telemetry.activeCodingTime || 0);
    const typingMinutes = activeCodingTime / 60;
    const typingSpeed = typingMinutes > 0 ? Math.round(typedCharacters / typingMinutes) : 0;
    const snapshotCount = Number(telemetry.snapshotCount || 0);
    const runCount = Number(telemetry.runCount || 0);
    const tabSwitchCount = Number(telemetry.tabSwitchCount || 0);
    const totalOutOfFocusTime = Number(telemetry.totalOutOfFocusTime || 0);

    // Save all to plagiarismDetails.behavioral_integrity
    plagiarismDetails = {
      ...plagiarismDetails,
      behavioral_integrity: {
        academic_integrity_score: academicIntegrityScore,
        code_ownership_score: codeOwnershipScore,
        behavioral_trust: behavioralTrust,
        similarity_percentage: plagiarismSimilarity,
        fraud_indicator_count: fraudIndicatorCount,
        integrity_verdict: integrityVerdict,
        risk_level: riskLevel,
        final_score_before_caps: overallScoreBeforeCaps,
        final_score_after_caps: overallScoreAfterCaps,
        trust_score: behavioralTrust,
        paste_ratio: Number(pasteRatio.toFixed(3)),
        typing_speed: typingSpeed,
        snapshot_count: snapshotCount,
        run_count: runCount,
        tab_switches: tabSwitchCount,
        focus_loss_seconds: totalOutOfFocusTime,
        penalties_applied: penaltiesApplied,
        process_score: processScore,
        focus_score: focusScore,
        similarity_score: similarityScore,
        evidence: {
          possible_ai_generation: evidence.possible_ai_generation,
          possible_external_solution: evidence.possible_external_solution,
          quick_submit_after_paste: evidence.quick_submit_after_paste,
          minimal_editing: evidence.minimal_editing,
          minimal_debugging: evidence.minimal_debugging,
          suspicious_input_pattern: evidence.suspicious_input_pattern
        }
      }
    };

    console.log("[evaluate-submission] evaluation calculated", {
      correctnessScore,
      qualityScore,
      plagiarismScore,
      trustScore: behavioralTrust,
      codingProgressScore: processScore,
      overallScore,
      riskLevel
    });

    // 5. Save to assessment_results
    const { error: assessErr } = await supabase.from("assessment_results").upsert(
      {
        submission_id,
        assignment_id: submission.assignment_id,
        student_id: submission.student_id,
        overall_score: overallScore,
        correctness_score: correctnessScore,
        quality_score: qualityScore,
        plagiarism_score: plagiarismScore,
        risk_level: riskLevel,
        correctness_details: {
          visible_passed: visiblePassed,
          visible_total: visibleTotal,
          hidden_passed: hiddenPassed,
          hidden_total: hiddenTotal,
        },
        quality_details: {
          readability,
          naming,
          modularity,
          complexity,
        },
        plagiarism_details: plagiarismDetails,
        created_at: new Date().toISOString(),
      },
      { onConflict: "submission_id" }
    );

    if (assessErr) {
      console.error("[evaluate-submission] failed to insert assessment_results:", assessErr);
    }

    // Save to legacy ai_evaluations to avoid breaking legacy code
    const aiProb = riskLevel === "CRITICAL" ? 95 : riskLevel === "HIGH" ? 75 : riskLevel === "MEDIUM" ? 45 : 15;
    const { error: aiEvalErr } = await supabase.from("ai_evaluations").upsert(
      {
        submission_id,
        assignment_id: submission.assignment_id,
        student_id: submission.student_id,
        correctness_score: correctnessScore,
        code_quality_score: qualityScore,
        plagiarism_score: plagiarismScore,
        ai_probability_score: aiProb,
        total_score: overallScore,
        feedback: rawJson.feedback || EVALUATION_FALLBACK.feedback,
        detailed_report: {
          strengths: rawJson.strengths || [],
          improvements: rawJson.improvements || [],
        },
        risk_level: riskLevel.toLowerCase(),
        evaluated_at: new Date().toISOString(),
        plagiarism_indicators: plagiarismDetails,
        integrity_verdict: integrityVerdict,
      },
      { onConflict: "submission_id" }
    );

    if (aiEvalErr) {
      console.error("[evaluate-submission] failed to insert ai_evaluations:", aiEvalErr);
    }

    // Update submissions table
    const submissionStatus = (riskLevel === "HIGH" || riskLevel === "CRITICAL") ? "flagged" : "evaluated";
    await supabase
      .from("submissions")
      .update({ status: submissionStatus, score: overallScore })
      .eq("id", submission_id);

    try {
      await fetch(`${SUPABASE_URL}/functions/v1/detect-fraud`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          student_id: submission.student_id,
          assignment_id: submission.assignment_id,
        }),
      });
    } catch (fraudErr) {
      console.error("[evaluate-submission] fraud trigger failed:", fraudErr);
    }

    return jsonResponse({ success: true, evaluation: rawJson });
  } catch (e) {
    console.error("[evaluate-submission] unhandled error:", e);
    return jsonResponse({ error: FRONTEND_AI_ERROR }, 500);
  }
});
