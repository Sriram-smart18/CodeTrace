import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  aiNotConfiguredMessage,
  callGroqChatCompletion,
  FRONTEND_AI_ERROR,
  isGroqConfigured,
  JSON_EVALUATOR_SYSTEM_PROMPT,
  parseGroqJsonContent,
} from "../_shared/ai-config.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";

type EvaluationJson = {
  total_score: number;
  risk_level: string;
  feedback: string;
  strengths: string[];
  improvements: string[];
};

const EVALUATION_FALLBACK: EvaluationJson = {
  total_score: 50,
  risk_level: "medium",
  feedback: "Automatic evaluation partially completed.",
  strengths: [],
  improvements: [],
};

function toDbEvaluation(raw: EvaluationJson, totalMarks: number) {
  const risk = String(raw.risk_level ?? "medium").toLowerCase();
  const total = Math.min(Math.max(Number(raw.total_score) || 50, 0), totalMarks);
  const aiProb = risk === "high" ? 75 : risk === "medium" ? 45 : 15;

  return {
    correctness_score: total,
    code_quality_score: total,
    plagiarism_score: 20,
    ai_probability_score: aiProb,
    total_score: total,
    feedback: raw.feedback || EVALUATION_FALLBACK.feedback,
    strengths: Array.isArray(raw.strengths) ? raw.strengths : [],
    improvements: Array.isArray(raw.improvements) ? raw.improvements : [],
    risk_level: risk,
    integrity_verdict: raw.feedback || EVALUATION_FALLBACK.feedback,
    suspicious_segments: [] as unknown[],
    ai_indicators: [] as string[],
    plagiarism_indicators: [] as string[],
    faculty_review_recommended: risk === "high",
    style_inconsistency_detected: false,
    paste_suspected: false,
    complexity_jump_detected: false,
  };
}

serve(async (req: Request) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    console.log("[evaluate-submission] request received", req.method);

    const body = await req.json();
    const submission_id = body?.submission_id as string | undefined;
    console.log("[evaluate-submission] parsed body", { submission_id });

    if (!submission_id) {
      return jsonResponse({ error: "submission_id is required" }, 400);
    }

    if (!isGroqConfigured()) {
      console.error("[evaluate-submission] GROQ_API_KEY missing");
      return jsonResponse({ error: aiNotConfiguredMessage() }, 500);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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
  "total_score": <number 0-${totalMarks}>,
  "risk_level": "low" | "medium" | "high",
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

    console.log("[evaluate-submission] calling Groq (plain JSON)");
    const groqResult = await callGroqChatCompletion({
      messages: [
        { role: "system", content: JSON_EVALUATOR_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
    });

    if (!groqResult.ok) {
      console.error("[evaluate-submission] Groq failed", groqResult.status);
      return jsonResponse({ error: groqResult.error }, groqResult.status === 429 ? 429 : 500);
    }

    const rawJson = parseGroqJsonContent<EvaluationJson>(
      groqResult.data,
      EVALUATION_FALLBACK,
      "[evaluate-submission]"
    );
    const evaluation = toDbEvaluation(rawJson, totalMarks);

    console.log("[evaluate-submission] evaluation ready", {
      total_score: evaluation.total_score,
      risk_level: evaluation.risk_level,
      usedFallback: rawJson === EVALUATION_FALLBACK,
    });

    const { error: evalErr } = await supabase.from("ai_evaluations").upsert(
      {
        submission_id,
        assignment_id: submission.assignment_id,
        student_id: submission.student_id,
        correctness_score: evaluation.correctness_score,
        code_quality_score: evaluation.code_quality_score,
        plagiarism_score: evaluation.plagiarism_score,
        ai_probability_score: evaluation.ai_probability_score,
        total_score: evaluation.total_score,
        feedback: evaluation.feedback,
        detailed_report: {
          strengths: evaluation.strengths,
          improvements: evaluation.improvements,
        },
        risk_level: evaluation.risk_level,
        integrity_verdict: evaluation.integrity_verdict,
        suspicious_segments: evaluation.suspicious_segments,
        ai_indicators: evaluation.ai_indicators,
        plagiarism_indicators: evaluation.plagiarism_indicators,
        faculty_review_recommended: evaluation.faculty_review_recommended,
        style_inconsistency_detected: evaluation.style_inconsistency_detected,
        paste_suspected: evaluation.paste_suspected,
        complexity_jump_detected: evaluation.complexity_jump_detected,
        behavioral_log: behavioralLog || null,
        evaluated_at: new Date().toISOString(),
      },
      { onConflict: "submission_id" }
    );

    if (evalErr) {
      console.error("[evaluate-submission] DB upsert error:", evalErr);
      return jsonResponse({ error: "Failed to store evaluation" }, 500);
    }

    console.log("[evaluate-submission] evaluation stored", submission_id);

    const newStatus = evaluation.faculty_review_recommended ? "flagged" : "evaluated";
    await supabase
      .from("submissions")
      .update({ status: newStatus, score: evaluation.total_score })
      .eq("id", submission_id);

    try {
      await fetch(`${SUPABASE_URL}/functions/v1/check-plagiarism`, {
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
    } catch (plagErr) {
      console.error("[evaluate-submission] plagiarism trigger failed:", plagErr);
    }

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
