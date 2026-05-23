import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Piston API language mappings
const LANGUAGE_MAP: Record<string, { language: string; version: string }> = {
  python: { language: "python", version: "3.10.0" },
  java: { language: "java", version: "15.0.2" },
  cpp: { language: "c++", version: "10.2.0" },
  c: { language: "c", version: "10.2.0" },
  javascript: { language: "javascript", version: "18.15.0" },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { language, code, input = "" } = await req.json();

    if (!language || !code) {
      return new Response(
        JSON.stringify({ error: "Language and code are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const langConfig = LANGUAGE_MAP[language];
    if (!langConfig) {
      return new Response(
        JSON.stringify({ error: `Unsupported language: ${language}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine filename based on language
    let filename = "main";
    if (language === "python") filename = "main.py";
    else if (language === "java") filename = "Main.java";
    else if (language === "cpp") filename = "main.cpp";
    else if (language === "c") filename = "main.c";
    else if (language === "javascript") filename = "main.js";

    const pistonPayload = {
      language: langConfig.language,
      version: langConfig.version,
      files: [{ name: filename, content: code }],
      stdin: input,
      args: [],
      compile_timeout: 10000,
      run_timeout: 5000,
      compile_memory_limit: -1,
      run_memory_limit: -1,
    };

    const pistonResponse = await fetch("https://emkc.org/api/v2/piston/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pistonPayload),
    });

    if (!pistonResponse.ok) {
      const errorText = await pistonResponse.text();
      console.error("Piston API error:", errorText);
      return new Response(
        JSON.stringify({ error: "Code execution service unavailable. Please try again." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await pistonResponse.json();

    // Build output from compile + run stages
    let output = "";
    let hasError = false;

    if (result.compile && result.compile.stderr) {
      output += `Compilation Error:\n${result.compile.stderr}\n`;
      hasError = true;
    }

    if (result.run) {
      if (result.run.stderr) {
        output += result.run.stderr;
        hasError = true;
      }
      if (result.run.stdout) {
        output += result.run.stdout;
      }
      if (result.run.signal === "SIGKILL") {
        output += "\n[Process killed - exceeded time/memory limit]";
        hasError = true;
      }
    }

    if (!output.trim()) {
      output = "Program executed successfully (no output).";
    }

    return new Response(
      JSON.stringify({ output: output.trim(), hasError }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Execute code error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
