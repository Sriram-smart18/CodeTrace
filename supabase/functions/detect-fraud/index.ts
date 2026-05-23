import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { student_id, assignment_id } = await req.json();
    if (!student_id) {
      return new Response(JSON.stringify({ error: "student_id is required" }), {
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

    // Fetch recent activity events for this student (last 30 min)
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
      console.error("Events fetch error:", eventsErr);
      return new Response(JSON.stringify({ error: "Failed to fetch activity events" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ result: "no_data", message: "No recent activity to analyze" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build pattern summary for AI analysis
    const pasteEvents = events.filter((e: any) => e.event_type === "paste");
    const typingEvents = events.filter((e: any) => e.event_type === "typing");
    const runEvents = events.filter((e: any) => e.event_type === "run");
    const submitEvents = events.filter((e: any) => e.event_type === "submit");

    // Detect large code insertions (paste with big snapshot)
    const largePastes = pasteEvents.filter(
      (e: any) => e.code_snapshot && e.code_snapshot.length > 200
    );

    // Calculate typing gaps (abnormal patterns)
    const typingTimestamps = typingEvents.map((e: any) => new Date(e.created_at).getTime());
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
      large_paste_sizes: largePastes.map((e: any) => e.code_snapshot?.length || 0),
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

    // Fetch student profile for context
    const { data: profile } = await supabase
      .from("profiles")
      .select("name, uid")
      .eq("user_id", student_id)
      .single();

    // Call AI for fraud analysis
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
            content: `You are an academic integrity AI for a programming lab. Analyze student activity patterns to detect potential fraud.

Look for these signals:
1. COPY-PASTE behavior: Many paste events, especially with large code blocks
2. SUDDEN LARGE INSERTION: Code snapshots jumping from small to very large in one step
3. AI-GENERATED CODE: Patterns typical of AI output (overly consistent style, perfect structure, generic variable names)
4. ABNORMAL TYPING PATTERNS: Very few typing events relative to code size, long gaps then sudden bursts

Be fair but thorough. Students may legitimately paste their own code from other editors.`,
          },
          {
            role: "user",
            content: `Analyze this student's activity pattern for potential academic integrity issues:

Student: ${profile?.name || "Unknown"} (UID: ${profile?.uid || "N/A"})

Activity Summary (last 30 minutes):
${JSON.stringify(patternSummary, null, 2)}

${patternSummary.latest_code_snapshot ? `Latest code snapshot:\n\`\`\`\n${patternSummary.latest_code_snapshot}\n\`\`\`` : "No code snapshot available."}

Provide your fraud analysis.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_fraud_analysis",
              description: "Submit the fraud analysis results",
              parameters: {
                type: "object",
                properties: {
                  risk_level: {
                    type: "string",
                    enum: ["low", "medium", "high"],
                    description: "Overall risk level for academic integrity violation",
                  },
                  alert_type: {
                    type: "string",
                    enum: [
                      "copy_paste",
                      "large_insertion",
                      "ai_generated",
                      "abnormal_typing",
                      "multiple_flags",
                      "clean",
                    ],
                    description: "Primary type of suspicious behavior detected",
                  },
                  explanation: {
                    type: "string",
                    description:
                      "Detailed explanation of the findings, written for a teacher to understand what was detected and why",
                  },
                  confidence: {
                    type: "integer",
                    description: "Confidence in the assessment 0-100",
                  },
                  indicators: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of specific indicators found",
                  },
                },
                required: ["risk_level", "alert_type", "explanation", "confidence"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "submit_fraud_analysis" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: "AI returned invalid response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const analysis = JSON.parse(toolCall.function.arguments);

    // Only create alert if risk is medium or high
    if (analysis.risk_level !== "low" && analysis.alert_type !== "clean") {
      await supabase.from("fraud_alerts").insert({
        student_id,
        assignment_id: assignment_id || null,
        risk_level: analysis.risk_level,
        alert_type: analysis.alert_type,
        explanation: analysis.explanation,
        event_summary: {
          ...patternSummary,
          latest_code_snapshot: undefined, // don't store full code in alert
          confidence: analysis.confidence,
          indicators: analysis.indicators || [],
        },
      });
    }

    return new Response(JSON.stringify({ success: true, analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("detect-fraud error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
