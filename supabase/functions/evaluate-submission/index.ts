import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { submission_id } = await req.json();
    if (!submission_id) {
      return new Response(JSON.stringify({ error: "submission_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch submission with assignment (including new integrity fields)
    const { data: submission, error: subErr } = await supabase
      .from("submissions")
      .select("*, assignments(*)")
      .eq("id", submission_id)
      .single();

    if (subErr || !submission) {
      return new Response(JSON.stringify({ error: "Submission not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const assignment = submission.assignments;
    const totalMarks = assignment?.total_marks || 100;
    const code = submission.code || "";
    const difficulty = assignment?.difficulty || "Medium";
    const expectedSkillLevel = assignment?.expected_skill_level || "Beginner";
    const behavioralLog = submission.behavioral_log;

    // Build behavioral context string for prompt
    const behavioralContext = behavioralLog
      ? `Behavioral Summary (captured from editor session):
  - Paste Count: ${behavioralLog.paste_count ?? "N/A"} (pastes of >50 chars each)
  - Largest Single Paste: ${behavioralLog.largest_paste_size ?? "N/A"} characters
  - Total Active Typing Time: ${behavioralLog.total_typing_time ?? "N/A"} seconds
  - Total Idle Time: ${behavioralLog.idle_time ?? "N/A"} seconds
  - Estimated Typing Speed: ${behavioralLog.typing_speed_estimate ?? "N/A"} chars/min
  - Deletion Events: ${behavioralLog.deletion_frequency ?? "N/A"} (low deletions = possible AI/paste)
  - Session Duration (open to submit): ${behavioralLog.submission_duration ?? "N/A"} seconds`
      : "Behavioral Summary: Not available (student may have submitted without opening editor)";

    // Call AI for full 20-factor academic integrity evaluation
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are an advanced academic integrity evaluator for a coding assessment platform.
Analyze student code submissions for AI-generation, plagiarism, and suspicious patterns.
You must always respond using the submit_integrity_evaluation tool call.`,
          },
          {
            role: "user",
            content: `Evaluate this code submission for academic integrity.

ASSIGNMENT CONTEXT:
- Title: ${assignment?.title || "Unknown"}
- Description: ${assignment?.description || "No description provided."}
- Assignment Difficulty: ${difficulty}
- Expected Student Skill Level: ${expectedSkillLevel}
- Total Marks: ${totalMarks}

${behavioralContext}

STUDENT CODE:
\`\`\`
${code}
\`\`\`

Perform a comprehensive academic integrity analysis using ALL of the following factors:

1. Code Structure: Does the overall structure match what a ${expectedSkillLevel} student writing ${difficulty}-level code would produce?
2. Variable Naming: Generic names (result, temp, arr, val) are AI patterns. Personal names or task-specific names suggest human authorship.
3. Comment Style: AI comments explain everything systematically. Human comments are sparse, contextual, or even incorrect.
4. Logic Originality: Textbook-perfect implementations are suspicious. Human code often has roundabout or imperfect logic.
5. Complexity Jump: Is this code far more advanced than a ${expectedSkillLevel} student would write for a ${difficulty} task?
6. Over-Optimization: Unnecessarily efficient solutions (list comprehensions, one-liners, O(n log n) where O(n²) is expected) for simple problems.
7. AI-Like Patterns: Docstrings on every function, complete error handling everywhere, type hints on all parameters, perfectly consistent indentation.
8. Formatting Consistency: Perfectly uniform code with no human mistakes is suspicious.
9. Unnatural Perfection: Zero off-by-one errors, zero debug prints, zero commented-out lines.
10. Repetitive Templates: Boilerplate that appears copy-paste from AI responses (e.g., "Here's the implementation...", standard main() patterns).
11. Paste Suspicion: paste_count=${behavioralLog?.paste_count ?? 0}, largest_paste=${behavioralLog?.largest_paste_size ?? 0} chars. High paste count with low typing time = strong AI indicator.
12. Typing Behavior: typing_speed=${behavioralLog?.typing_speed_estimate ?? "unknown"} chars/min, deletion_frequency=${behavioralLog?.deletion_frequency ?? "unknown"}. AI-generated code has very low deletions.
13. Session Duration Mismatch: ${behavioralLog?.submission_duration ?? "unknown"}s to submit. Complex code submitted in <5 minutes is suspicious.
14. ChatGPT Signatures: Triple-quoted docstrings, "# Solution:", "# Time complexity: O(...)", always-present if __name__ == "__main__" blocks.
15. GitHub Copilot Signatures: Function stubs completed with exact parameter types, perfect JSDoc comments.
16. Style Inconsistency: Does coding style change partway through? (human + AI hybrid)
17. Modularization: Unnecessary helper functions for trivial tasks = AI pattern.
18. Generic AI Explanation Comments: "# This function takes X and returns Y" = AI-generated.
19. Beginner-Expert Mismatch: ${expectedSkillLevel} student using decorators, generators, metaclasses, or design patterns is very suspicious.
20. Correctness vs Skill Mismatch: Perfect correctness + ${expectedSkillLevel} profile = suspicious.

Based on this analysis, provide scores and a complete integrity report.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_integrity_evaluation",
              description: "Submit complete code integrity evaluation results",
              parameters: {
                type: "object",
                properties: {
                  // Original scores
                  correctness_score: { type: "integer", description: "Correctness score 0-100" },
                  code_quality_score: { type: "integer", description: "Code quality score 0-100" },
                  plagiarism_score: { type: "integer", description: "Plagiarism likelihood 0-100 (0=original)" },
                  ai_probability_score: { type: "integer", description: "AI-generated probability 0-100 (0=human)" },
                  total_score: { type: "integer", description: `Total score out of ${totalMarks}` },
                  feedback: { type: "string", description: "Detailed feedback for the student" },
                  strengths: { type: "array", items: { type: "string" }, description: "Code strengths" },
                  improvements: { type: "array", items: { type: "string" }, description: "Suggested improvements" },
                  // New integrity fields
                  risk_level: {
                    type: "string",
                    enum: ["Low", "Medium", "High", "Critical"],
                    description: "Overall academic integrity risk level",
                  },
                  integrity_verdict: {
                    type: "string",
                    description: "Final written integrity verdict (2-3 sentences explaining the decision)",
                  },
                  suspicious_segments: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        code: { type: "string", description: "The suspicious code segment" },
                        reason: { type: "string", description: "Why this segment is suspicious" },
                      },
                      required: ["code", "reason"],
                    },
                    description: "List of suspicious code segments with reasons",
                  },
                  ai_indicators: {
                    type: "array",
                    items: { type: "string" },
                    description: "Specific signals that suggest AI generation",
                  },
                  plagiarism_indicators: {
                    type: "array",
                    items: { type: "string" },
                    description: "Specific signals that suggest copied logic",
                  },
                  faculty_review_recommended: {
                    type: "boolean",
                    description: "Whether manual faculty review is strongly recommended",
                  },
                  style_inconsistency_detected: {
                    type: "boolean",
                    description: "Whether coding style changes noticeably mid-submission",
                  },
                  paste_suspected: {
                    type: "boolean",
                    description: "Whether the code appears to have been pasted all at once",
                  },
                  complexity_jump_detected: {
                    type: "boolean",
                    description: `Whether the code complexity is unexpectedly high for a ${expectedSkillLevel} student`,
                  },
                },
                required: [
                  "correctness_score", "code_quality_score", "plagiarism_score",
                  "ai_probability_score", "total_score", "feedback",
                  "risk_level", "integrity_verdict", "suspicious_segments",
                  "ai_indicators", "plagiarism_indicators",
                  "faculty_review_recommended", "style_inconsistency_detected",
                  "paste_suspected", "complexity_jump_detected",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "submit_integrity_evaluation" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      const errorText = await aiResponse.text();
      console.error("AI gateway error:", status, errorText);
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited. Please try again later." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: "AI evaluation failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: "AI returned invalid response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const evaluation = JSON.parse(toolCall.function.arguments);

    // Upsert evaluation with all new integrity fields
    const { error: evalErr } = await supabase.from("ai_evaluations").upsert(
      {
        submission_id,
        assignment_id: submission.assignment_id,
        student_id: submission.student_id,
        // Original scores
        correctness_score: evaluation.correctness_score,
        code_quality_score: evaluation.code_quality_score,
        plagiarism_score: evaluation.plagiarism_score,
        ai_probability_score: evaluation.ai_probability_score,
        total_score: evaluation.total_score,
        feedback: evaluation.feedback,
        detailed_report: {
          strengths: evaluation.strengths || [],
          improvements: evaluation.improvements || [],
        },
        // New integrity fields
        risk_level: evaluation.risk_level?.toLowerCase() || "low",
        integrity_verdict: evaluation.integrity_verdict,
        suspicious_segments: evaluation.suspicious_segments || [],
        ai_indicators: evaluation.ai_indicators || [],
        plagiarism_indicators: evaluation.plagiarism_indicators || [],
        faculty_review_recommended: evaluation.faculty_review_recommended ?? false,
        style_inconsistency_detected: evaluation.style_inconsistency_detected ?? false,
        paste_suspected: evaluation.paste_suspected ?? false,
        complexity_jump_detected: evaluation.complexity_jump_detected ?? false,
        behavioral_log: behavioralLog || null,
        evaluated_at: new Date().toISOString(),
      },
      { onConflict: "submission_id" }
    );

    if (evalErr) {
      console.error("DB insert error:", evalErr);
      return new Response(JSON.stringify({ error: "Failed to store evaluation" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update submission status and score
    const newStatus = evaluation.faculty_review_recommended ? "flagged" : "evaluated";
    await supabase
      .from("submissions")
      .update({ status: newStatus, score: evaluation.total_score })
      .eq("id", submission_id);

    // Fire-and-forget: cross-submission plagiarism check
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
      console.error("Plagiarism check trigger failed:", plagErr);
      // Non-blocking — evaluation still succeeds
    }

    // Fire-and-forget: existing fraud detection
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
      console.error("Fraud detection trigger failed:", fraudErr);
    }

    return new Response(JSON.stringify({ success: true, evaluation }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("evaluate-submission error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
