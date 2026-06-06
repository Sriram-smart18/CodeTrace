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

    const plagiarismScore = 100 - plagiarismSimilarity; // Integrity score

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

    // 4. Combined Scoring & Behavioral Integrity Engine v2.2
    const telemetry = submission.behavioral_log || {};
    
    // Telemetry fields extraction
    const typedCharacters = Number(telemetry.typedCharacters || 0);
    const pastedCharacters = Number(telemetry.pastedCharacters || 0);
    const pasteEvents = Number(telemetry.pasteEvents || 0);
    const backspaceCount = Number(telemetry.backspaceCount || 0);
    const editCount = Number(telemetry.editCount || 0);
    const activeCodingTime = Number(telemetry.activeCodingTime || 0); // seconds
    const idleTime = Number(telemetry.idleTime || 0); // seconds
    
    const tabSwitchCount = Number(telemetry.tabSwitchCount || 0);
    const windowBlurCount = Number(telemetry.windowBlurCount || 0);
    const totalOutOfFocusTime = Number(telemetry.totalOutOfFocusTime || 0); // seconds
    const largePasteEvents = Number(telemetry.largePasteEvents || 0);
    const largestPasteSize = Number(telemetry.largestPasteSize || 0);
    const snapshotCount = Number(telemetry.snapshotCount || 0);
    const runCount = Number(telemetry.runCount || 0);
    const templateChars = Number(telemetry.template_chars || 0);
    const effectivePastedChars = Number(telemetry.effective_pasted_chars || 0);
    
    // Calculate submitDelayAfterLastPaste (seconds)
    let submitDelay = telemetry.submitDelayAfterLastPaste;
    if (submitDelay === undefined || submitDelay === null) {
      if (telemetry.last_paste_time && submission.submitted_at) {
        const lastPasteMs = new Date(telemetry.last_paste_time).getTime();
        const submitMs = new Date(submission.submitted_at).getTime();
        submitDelay = Math.max(0, Math.round((submitMs - lastPasteMs) / 1000));
      } else {
        submitDelay = null;
      }
    }

    // 1. Typing Speed & Protection (Human speed = 100-400 CPM)
    const typingMinutes = activeCodingTime / 60;
    const typingSpeed = typingMinutes > 0 ? Math.round(typedCharacters / typingMinutes) : 0;
    
    let typingConsistency = 100;
    if (typingSpeed > 400) {
      const pasteRatioTemp = (typedCharacters + effectivePastedChars) > 0 
        ? (effectivePastedChars / (typedCharacters + effectivePastedChars)) 
        : 0;
      const isCheatingSuspected = pasteRatioTemp > 0.50 || plagiarismSimilarity > 70;
      if (isCheatingSuspected) {
        // Fast Typist Penalty (combined with paste ratio or similarity)
        typingConsistency = Math.max(0, 100 - ((typingSpeed - 400) / 5));
      } else {
        // Genuine fast typist -> Do NOT penalize!
        typingConsistency = 100;
      }
    }

    // Calculate Paste Ratio (effective_pasted_chars / finalCodeLength)
    const finalCodeLength = code.length || (typedCharacters + effectivePastedChars);
    const pasteRatio = finalCodeLength > 0 ? Math.min(1, effectivePastedChars / finalCodeLength) : 0;

    // Component Scores (0-100)
    // 1. Typing Activity (30% weight)
    let typingScore = 100;
    if (typedCharacters < 300) {
      typingScore = (typedCharacters / 300) * 100;
    }
    typingScore = typingScore * (typingConsistency / 100);

    // 2. Edit Activity (20% weight)
    const editScore = Math.min(100, Math.round(
      (editCount > 30 ? 70 : (editCount / 30) * 70) + 
      (backspaceCount > 5 ? 30 : (backspaceCount / 5) * 30)
    ));

    // 3. Version Growth (15% weight)
    const versionScore = Math.min(100, snapshotCount * 15);

    // 4. Paste Behavior (15% weight)
    const pasteScore = Math.max(0, 100 - (pasteRatio * 80) - (pasteEvents * 5) - (largePasteEvents * 20));

    // 5. Focus Behavior (10% weight)
    const totalSessionTime = activeCodingTime + idleTime || 1;
    const outOfFocusRatio = totalOutOfFocusTime / totalSessionTime;
    const focusScore = Math.max(0, 100 - (tabSwitchCount * 3) - (windowBlurCount * 3) - (outOfFocusRatio * 150));

    // 6. Similarity Resistance (10% weight)
    const similarityScore = 100 - plagiarismSimilarity;

    // Weighted Trust Base (Total = 100%)
    let trustScore = Math.round(
      (typingScore * 0.30) +
      (editScore * 0.20) +
      (versionScore * 0.15) +
      (pasteScore * 0.15) +
      (focusScore * 0.10) +
      (similarityScore * 0.10)
    );

    // Run Activity Telemetry Scoring
    if (runCount === 0) {
      trustScore -= 10;
    } else if (runCount >= 3) {
      trustScore += 10;
    }

    // Minimum Human Coding Time Caps
    if (activeCodingTime < 30) {
      trustScore = Math.min(trustScore, 20);
    } else if (activeCodingTime < 60) {
      trustScore = Math.min(trustScore, 40);
    }

    // Hard Penalties
    const penaltiesApplied: string[] = [];
    if (pasteRatio > 0.80) {
      trustScore -= 40;
      penaltiesApplied.push("PASTE_RATIO_OVER_80");
    }
    if (largePasteEvents > 0 && submitDelay !== null && submitDelay < 60) {
      trustScore -= 30;
      penaltiesApplied.push("QUICK_SUBMIT_AFTER_LARGE_PASTE");
    }
    if (plagiarismSimilarity > 85) {
      trustScore -= 30;
      penaltiesApplied.push("HIGH_SIMILARITY");
    }
    if (snapshotCount <= 1) {
      trustScore -= 20;
      penaltiesApplied.push("ONLY_ONE_SNAPSHOT");
    }
    if (outOfFocusRatio > 0.30) {
      trustScore -= 15;
      penaltiesApplied.push("OUT_OF_FOCUS_OVER_30_PERCENT");
    }
    if (runCount === 0) {
      penaltiesApplied.push("NO_RUNS_BEFORE_SUBMIT");
    }

    // Clamp Trust
    trustScore = Math.min(100, Math.max(0, Math.round(trustScore)));

    // Evidence Flags
    const possible_external_solution = largePasteEvents > 0 || pastedCharacters > 300 || largestPasteSize > 300;
    const quick_submit_after_paste = largePasteEvents > 0 && submitDelay !== null && submitDelay < 60;
    const high_similarity_detected = plagiarismSimilarity > 70;

    // Process Score (Problem Solving Process)
    const codingProgressScore = Math.min(100, Math.round(
      (Math.min(5, snapshotCount) * 15) + 
      (activeCodingTime > 120 ? 25 : (activeCodingTime / 120) * 25) + 
      (editCount > 20 ? 30 : (editCount / 20) * 30)
    ));

    // Final Overall Score (50% Correctness, 20% Trust, 10% Process, 10% Code Quality, 10% Integrity)
    let overallScore = Math.round(
      (correctnessScore * 0.50) +
      (trustScore * 0.20) +
      (codingProgressScore * 0.10) +
      (qualityScore * 0.10) +
      (plagiarismScore * 0.10)
    );

    // Risk Classification v2.2
    let riskLevel = "LOW";
    if (plagiarismSimilarity >= 85 && trustScore < 35) {
      riskLevel = "CRITICAL";
    } else if (plagiarismSimilarity >= 70 || trustScore < 50) {
      riskLevel = "HIGH";
    } else if (plagiarismSimilarity >= 40 || trustScore < 60) {
      riskLevel = "MEDIUM";
    }

    // Automatic Score Cap
    if (plagiarismSimilarity >= 85 && pasteRatio >= 0.70 && trustScore < 35) {
      riskLevel = "CRITICAL";
      overallScore = Math.min(overallScore, 30);
    }

    // Save behavioral integrity JSON to plagiarismDetails
    plagiarismDetails = {
      ...plagiarismDetails,
      behavioral_integrity: {
        trust_score: trustScore,
        risk_level: riskLevel,
        paste_ratio: Number(pasteRatio.toFixed(3)),
        typing_speed: typingSpeed,
        snapshot_count: snapshotCount,
        run_count: runCount,
        tab_switches: tabSwitchCount,
        focus_loss_seconds: totalOutOfFocusTime,
        penalties_applied: penaltiesApplied,
        process_score: codingProgressScore,
        evidence: {
          possible_external_solution,
          quick_submit_after_paste,
          high_similarity_detected
        }
      }
    };

    console.log("[evaluate-submission] evaluation calculated", {
      correctnessScore,
      qualityScore,
      plagiarismScore,
      trustScore,
      codingProgressScore,
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
