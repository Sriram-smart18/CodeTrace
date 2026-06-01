import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleOptions, jsonResponse } from "../_shared/cors.ts";

// Piston API fallback configuration
const PISTON_LANGUAGE_MAP: Record<string, { language: string; version: string }> = {
  python: { language: "python", version: "3.10.0" },
  java: { language: "java", version: "15.0.2" },
  cpp: { language: "c++", version: "10.2.0" },
  c: { language: "c", version: "10.2.0" },
  javascript: { language: "javascript", version: "18.15.0" },
};

function getPistonFilename(language: string): string {
  if (language === "python") return "main.py";
  if (language === "java") return "Main.java";
  if (language === "cpp") return "main.cpp";
  if (language === "c") return "main.c";
  if (language === "javascript") return "main.js";
  return "main.txt";
}

// Phase 3: Output Comparison Engine normalizer
// Rules: Trim trailing spaces of each line, normalize CRLF to LF, delete trailing blank lines, do NOT collapse internal spaces.
function normalizeOutput(str: string): string {
  if (typeof str !== "string") return "";
  const lines = str.replace(/\r\n/g, "\n").split("\n").map(line => line.trimEnd());
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.join("\n").trimEnd();
}

serve(async (req: Request) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const { assignment_id, student_id, code, language, started_at, submission_id, rejudge = false } = await req.json();

    if (!assignment_id || !student_id || !code || !language) {
      return jsonResponse({ error: "Missing required fields (assignment_id, student_id, code, language)" }, 400);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch assignment rules
    const { data: assignment, error: asgErr } = await supabase
      .from("assignments")
      .select("*")
      .eq("id", assignment_id)
      .single();

    if (asgErr || !assignment) {
      return jsonResponse({ error: "Assignment not found" }, 404);
    }

    const totalMarks = assignment.total_marks || 100;

    // 2. Fetch problem configuration
    const { data: problem } = await supabase
      .from("problems")
      .select("*")
      .eq("assignment_id", assignment_id)
      .maybeSingle();

    const timeLimit = problem?.time_limit || 5; // default 5s
    const memoryLimit = problem?.memory_limit || 256; // default 256MB

    // 3. Check language support (Phase 7)
    if (assignment.supported_languages && assignment.supported_languages.length > 0) {
      if (!assignment.supported_languages.includes(language)) {
        return jsonResponse({ error: `Language ${language} is not allowed for this assignment.` }, 400);
      }
    }

    // 4. Validate submission count limit (Phase 8) - skipped if rejudging
    if (!rejudge && assignment.max_submissions !== null && assignment.max_submissions !== undefined) {
      const { count, error: countErr } = await supabase
        .from("submissions")
        .select("*", { count: "exact", head: true })
        .eq("assignment_id", assignment_id)
        .eq("student_id", student_id);

      if (!countErr && count !== null && count >= assignment.max_submissions) {
        return jsonResponse({ error: `Submission limit reached! You have used all ${assignment.max_submissions} attempts.` }, 400);
      }
    }

    // 5. Fetch all test cases (hidden test security guarantees this is only done inside edge function)
    const { data: testCases, error: tcErr } = await supabase
      .from("test_cases")
      .select("*")
      .eq("assignment_id", assignment_id);

    if (tcErr || !testCases || testCases.length === 0) {
      return jsonResponse({ error: "No test cases configured for this assignment" }, 400);
    }

    // 6. Execution configurations
    const execServerUrl = Deno.env.get("EXECUTION_SERVER_URL") || "http://host.docker.internal:3001";
    console.log(`[evaluate-submission-tests] Testing code against ${testCases.length} cases.`);

    const results: Array<{
      test_case_id: string;
      input: string | null;
      expected_output: string;
      is_hidden: boolean;
      passed: boolean;
      verdict: string;
      output: string;
      execution_time: number;
      memory_used: number;
    }> = [];

    let passedCount = 0;
    let maxTimeMs = 0;
    let maxMemoryKb = 0;
    let finalVerdict = "Accepted";

    // Precedence rule: Compile Error > Time Limit > Memory Limit > Runtime Error > Wrong Answer
    const getVerdictPrecedence = (v: string) => {
      if (v === "Compilation Error") return 5;
      if (v === "Time Limit Exceeded") return 4;
      if (v === "Memory Limit Exceeded") return 3;
      if (v === "Runtime Error") return 2;
      if (v === "Wrong Answer") return 1;
      return 0; // Accepted
    };

    // 7. Iterate through test cases
    for (const tc of testCases) {
      let runOutput = "";
      let hasError = false;
      let exitCode = 0;
      let runTimeMs = 0;
      let peakMemoryKb = 0;
      let compileError = "";
      let isFallbackUsed = false;
      let localVerdict = "Accepted";

      try {
        // Try local Sandbox Execution Server POST
        const res = await fetch(`${execServerUrl}/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            language,
            code,
            input: tc.input || "",
            timeLimit,
            memoryLimit
          })
        });

        if (!res.ok) {
          throw new Error(`Execution server responded with status: ${res.status}`);
        }

        const data = await res.json();
        runOutput = data.output || "";
        hasError = data.hasError || false;
        exitCode = data.exitCode || 0;
        compileError = data.compileError || "";
        runTimeMs = data.runTimeMs || 0;
        peakMemoryKb = data.peakMemoryKb || 0;
        if (data.verdict) {
          localVerdict = data.verdict; // 'Time Limit Exceeded' or 'Memory Limit Exceeded'
        }
      } catch (err) {
        console.warn(`[evaluate-submission-tests] Local sandbox failed: ${err.message}. Falling back to Piston.`);
        isFallbackUsed = true;
        
        // Piston Emergency Fallback
        const langConfig = PISTON_LANGUAGE_MAP[language];
        if (!langConfig) {
          runOutput = `[Environment Error: Fallback does not support language ${language}]`;
          hasError = true;
        } else {
          try {
            const pistonResponse = await fetch("https://emkc.org/api/v2/piston/execute", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                language: langConfig.language,
                version: langConfig.version,
                files: [{ name: getPistonFilename(language), content: code }],
                stdin: tc.input || "",
                compile_timeout: 10000,
                run_timeout: timeLimit * 1000,
              }),
            });

            if (pistonResponse.ok) {
              const result = await pistonResponse.json();
              if (result.compile && result.compile.stderr) {
                compileError = result.compile.stderr;
                runOutput = compileError;
                hasError = true;
              } else if (result.run) {
                runOutput = (result.run.stdout || "") + (result.run.stderr || "");
                hasError = !!result.run.stderr;
                runTimeMs = result.run.time || 0;
                peakMemoryKb = Math.round((result.run.memory || 0) / 1024);
                if (result.run.signal === "SIGKILL") {
                  localVerdict = "Time Limit Exceeded";
                }
              }
            } else {
              throw new Error("Piston API unavailable");
            }
          } catch (pistonErr) {
            runOutput = `[Execution Server Error: Local sandbox and Piston fallback both failed]\n${pistonErr.message}`;
            hasError = true;
          }
        }
      }

      // 8. Output normalization & Verdict assessment
      let tcVerdict = "Accepted";
      if (compileError) {
        tcVerdict = "Compilation Error";
      } else if (localVerdict === "Time Limit Exceeded") {
        tcVerdict = "Time Limit Exceeded";
      } else if (localVerdict === "Memory Limit Exceeded") {
        tcVerdict = "Memory Limit Exceeded";
      } else if (hasError && tcVerdict === "Accepted") {
        tcVerdict = "Runtime Error";
      } else {
        const studentNorm = normalizeOutput(runOutput);
        const expectedNorm = normalizeOutput(tc.expected_output);
        if (studentNorm !== expectedNorm) {
          tcVerdict = "Wrong Answer";
        }
      }

      const passed = tcVerdict === "Accepted";
      if (passed) passedCount++;

      // Track peak metrics
      if (runTimeMs > maxTimeMs) maxTimeMs = runTimeMs;
      if (peakMemoryKb > maxMemoryKb) maxMemoryKb = peakMemoryKb;

      // Update final verdict based on priority
      if (getVerdictPrecedence(tcVerdict) > getVerdictPrecedence(finalVerdict)) {
        finalVerdict = tcVerdict;
      }

      results.push({
        test_case_id: tc.id,
        input: tc.is_hidden ? null : tc.input, // Hidden test case security
        expected_output: tc.is_hidden ? "[HIDDEN]" : tc.expected_output,
        is_hidden: tc.is_hidden,
        passed,
        verdict: tcVerdict,
        output: tc.is_hidden ? "[HIDDEN]" : runOutput,
        execution_time: runTimeMs,
        memory_used: peakMemoryKb
      });
    }

    // 9. Score calculation scaled to total_marks
    const finalScore = Math.round((passedCount / testCases.length) * totalMarks);

    // 10. Commit results to database
    let submissionRecord: any;

    if (rejudge && submission_id) {
      // Rejudging existing submission
      const { data, error: updateErr } = await supabase
        .from("submissions")
        .update({
          score: finalScore,
          verdict: finalVerdict,
          status: finalVerdict === "Compilation Error" ? "flagged" : "evaluated",
          execution_time: maxTimeMs,
          memory_used: maxMemoryKb,
          updated_at: new Date().toISOString()
        })
        .eq("id", submission_id)
        .select()
        .single();

      if (updateErr) throw updateErr;
      submissionRecord = data;

      // Wipe old snapshots
      await supabase
        .from("submission_test_results")
        .delete()
        .eq("submission_id", submission_id);
    } else {
      // Insert new submission
      const { data, error: insertErr } = await supabase
        .from("submissions")
        .insert({
          id: submission_id || undefined, // support custom UUID from client
          assignment_id: assignment_id,
          student_id: student_id,
          code: code,
          language: language,
          score: finalScore,
          verdict: finalVerdict,
          status: finalVerdict === "Compilation Error" ? "flagged" : "evaluated",
          execution_time: maxTimeMs,
          memory_used: maxMemoryKb,
          started_at: started_at || new Date().toISOString(),
          submitted_at: new Date().toISOString()
        })
        .select()
        .single();

      if (insertErr) throw insertErr;
      submissionRecord = data;
    }

    // Insert new snapshots
    const snapshotsPayload = results.map(r => ({
      submission_id: submissionRecord.id,
      test_case_id: r.test_case_id,
      passed: r.passed,
      execution_time: r.execution_time,
      memory_used: r.memory_used
    }));

    const { error: snapErr } = await supabase
      .from("submission_test_results")
      .insert(snapshotsPayload);

    if (snapErr) {
      console.error("[evaluate-submission-tests] Failed to save snapshots:", snapErr);
    }

    // 11. Trigger Asynchronous Background reviews (AI review and Plagiarism check)
    // Never block submission results! (Phase 10)
    const functionBaseUrl = `${SUPABASE_URL}/functions/v1`;
    
    // AI correctness evaluation (Groq async attach later)
    fetch(`${functionBaseUrl}/evaluate-submission`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ submission_id: submissionRecord.id }),
    }).catch(err => console.error("[evaluate-submission-tests] Background AI evaluation trigger failed:", err));

    // Plagiarism scan (async matching)
    fetch(`${functionBaseUrl}/check-plagiarism`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        submission_id: submissionRecord.id,
        assignment_id: assignment_id,
        student_id: student_id
      }),
    }).catch(err => console.error("[evaluate-submission-tests] Background Plagiarism scan trigger failed:", err));

    // 12. Return secure details to student client (guarantees hidden inputs are never exposed)
    return jsonResponse({
      success: true,
      submission_id: submissionRecord.id,
      score: finalScore,
      verdict: finalVerdict,
      passed_count: passedCount,
      total_count: testCases.length,
      execution_time: maxTimeMs,
      memory_used: maxMemoryKb,
      test_cases_results: results.map(r => ({
        test_case_id: r.test_case_id,
        input: r.input, // null for hidden
        expected_output: r.expected_output, // '[HIDDEN]' for hidden
        is_hidden: r.is_hidden,
        passed: r.passed,
        verdict: r.verdict,
        output: r.output, // '[HIDDEN]' for hidden
        execution_time: r.execution_time,
        memory_used: r.memory_used
      }))
    });

  } catch (e) {
    console.error("[evaluate-submission-tests] Unhandled evaluation error:", e);
    return jsonResponse({ error: e.message || "Execution sandbox error" }, 500);
  }
});
