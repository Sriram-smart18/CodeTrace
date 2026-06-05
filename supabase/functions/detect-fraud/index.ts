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

type FraudAnalysisJson = {
  risk_level: string;
  alert_type: string;
  explanation: string;
  confidence: number;
  indicators: string[];
};

const FRAUD_FALLBACK: FraudAnalysisJson = {
  risk_level: "low",
  alert_type: "clean",
  explanation: "Automatic evaluation partially completed.",
  confidence: 50,
  indicators: [],
};

serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    console.log("[detect-fraud] request received");

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
    const { student_id, assignment_id } = body;
    if (!student_id) {
      return jsonResponse({ error: "student_id is required" }, 400);
    }

    if (!isOpenRouterConfigured()) {
      console.error("[detect-fraud] OPENROUTER_API_KEY missing");
      return jsonResponse({ error: aiNotConfiguredMessage() }, 500);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify teacher owns the assignment (if not admin/service)
    if (userRole !== "admin" && userRole !== "service" && assignment_id) {
      const { data: assignment } = await supabase
        .from("assignments")
        .select("created_by")
        .eq("id", assignment_id)
        .single();

      if (!assignment || assignment.created_by !== userId) {
        return jsonResponse({ error: "Forbidden: You do not own this assignment" }, 403);
      }
    }

    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    let query = supabase
      .from("activity_events")
      .select("*")
      .eq("student_id", student_id)
      .gte("created_at", thirtyMinAgo)
      .order("created_at", { ascending: true });

    if (assignment_id) {
      query = query.eq("assignment_id", assignment_id);
    }

    const { data: events, error: eventsErr } = await query;

    if (eventsErr) {
      console.error("[detect-fraud] events fetch error:", eventsErr);
      return jsonResponse({ error: "Failed to fetch activity events" }, 500);
    }

    if (!events || events.length === 0) {
      return jsonResponse({ result: "no_data", message: "No recent activity to analyze" });
    }

    const pasteEvents = events.filter((e: { event_type: string }) => e.event_type === "paste");
    const typingEvents = events.filter((e: { event_type: string }) => e.event_type === "typing");
    const runEvents = events.filter((e: { event_type: string }) => e.event_type === "run");
    const submitEvents = events.filter((e: { event_type: string }) => e.event_type === "submit");

    const largePastes = pasteEvents.filter(
      (e: { code_snapshot?: string }) => e.code_snapshot && e.code_snapshot.length > 200
    );

    const typingTimestamps = typingEvents.map((e: { created_at: string }) => new Date(e.created_at).getTime());
    const typingGaps: number[] = [];
    for (let i = 1; i < typingTimestamps.length; i++) {
      typingGaps.push(typingTimestamps[i] - typingTimestamps[i - 1]);
    }

    const patternSummary = {
      total_events: events.length,
      paste_count: pasteEvents.length,
      typing_count: typingEvents.length,
      run_count: runEvents.length,
      submit_count: submitEvents.length,
      large_paste_count: largePastes.length,
      large_paste_sizes: largePastes.map((e: { code_snapshot?: string }) => e.code_snapshot?.length || 0),
      avg_typing_gap_ms: typingGaps.length > 0
        ? Math.round(typingGaps.reduce((a, b) => a + b, 0) / typingGaps.length)
        : null,
      max_typing_gap_ms: typingGaps.length > 0 ? Math.max(...typingGaps) : null,
      time_window_minutes: 30,
      latest_code_snapshot: submitEvents.length > 0
        ? submitEvents[submitEvents.length - 1].code_snapshot?.slice(0, 1500)
        : pasteEvents.length > 0
        ? pasteEvents[pasteEvents.length - 1].code_snapshot?.slice(0, 1500)
        : typingEvents.length > 0
        ? typingEvents[typingEvents.length - 1].code_snapshot?.slice(0, 1500)
        : null,
    };

    const { data: profile } = await supabase
      .from("profiles")
      .select("name, uid")
      .eq("user_id", student_id)
      .single();

    const jsonSchemaPrompt = `Return JSON in exactly this shape:
{
  "risk_level": "low" | "medium" | "high",
  "alert_type": "copy_paste" | "large_insertion" | "ai_generated" | "abnormal_typing" | "multiple_flags" | "clean",
  "explanation": "<string>",
  "confidence": <number 0-100>,
  "indicators": ["<string>"]
}`;

    console.log("[detect-fraud] calling OpenRouter (plain JSON)");
    const aiResult = await callOpenRouterChatCompletion({
      messages: [
        { role: "system", content: JSON_EVALUATOR_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Analyze student activity for fraud signals.

Student: ${profile?.name || "Unknown"} (UID: ${profile?.uid || "N/A"})

Activity Summary:
${JSON.stringify(patternSummary, null, 2)}

${patternSummary.latest_code_snapshot ? `Latest code:\n\`\`\`\n${patternSummary.latest_code_snapshot}\n\`\`\`` : "No code snapshot."}

${jsonSchemaPrompt}`,
        },
      ],
      temperature: 0.2,
    });

    if (!aiResult.ok) {
      return jsonResponse({ error: aiResult.error }, 500);
    }

    const analysis = parseOpenRouterJsonContent<FraudAnalysisJson>(
      aiResult.data,
      FRAUD_FALLBACK,
      "[detect-fraud]"
    );

    if (analysis.risk_level !== "low" && analysis.alert_type !== "clean") {
      await supabase.from("fraud_alerts").insert({
        student_id,
        assignment_id: assignment_id || null,
        risk_level: analysis.risk_level,
        alert_type: analysis.alert_type,
        explanation: analysis.explanation,
        event_summary: {
          ...patternSummary,
          latest_code_snapshot: undefined,
          confidence: analysis.confidence,
          indicators: analysis.indicators || [],
        },
      });
    }

    return jsonResponse({ success: true, analysis });
  } catch (e) {
    console.error("[detect-fraud] error:", e);
    return jsonResponse({ error: FRONTEND_AI_ERROR }, 500);
  }
});
