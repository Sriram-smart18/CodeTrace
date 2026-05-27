import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  callGroqChatCompletion,
  isGroqConfigured,
  JSON_EVALUATOR_SYSTEM_PROMPT,
  parseGroqJsonContent,
} from "../_shared/ai-config.ts";

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

// ─── Configurable threshold ───────────────────────────────────────────────────
// Pairs with local similarity >= this value trigger an AI deep-analysis call
const SIMILARITY_THRESHOLD = 70;

// ─── Similarity utilities (pure Deno, no external deps) ──────────────────────

/**
 * Normalize code for comparison:
 * - Lowercase everything
 * - Strip single-line comments (# and //)
 * - Strip multi-line comments (/* ... * /)
 * - Collapse all whitespace to single spaces
 * - Trim
 */
function normalizeCode(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, " ")   // block comments
    .replace(/\/\/[^\n]*/g, " ")          // JS/C // comments
    .replace(/#[^\n]*/g, " ")             // Python # comments
    .replace(/["'`]([^"'`\n]*)["'`]/g, '"STR"') // string literals → STR
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Identifier normalization:
 * Replace all identifiers (likely variable/function names) with sequential VAR_N tokens.
 * This makes the comparison resistant to simple variable renaming.
 * We preserve language keywords so structural comparison still works.
 */
const KEYWORDS = new Set([
  // Python
  "def", "class", "return", "if", "else", "elif", "for", "while", "in", "not",
  "and", "or", "import", "from", "as", "with", "try", "except", "finally",
  "pass", "break", "continue", "lambda", "yield", "global", "nonlocal", "del",
  "assert", "raise", "none", "true", "false", "self", "print", "range", "len",
  "int", "str", "float", "list", "dict", "set", "tuple", "type",
  // JS/TS
  "function", "const", "let", "var", "new", "this", "typeof", "instanceof",
  "async", "await", "promise", "then", "catch", "throw", "console", "log",
  "arrow", "map", "filter", "reduce", "push", "pop", "shift", "unshift",
  "null", "undefined", "true", "false",
  // C/Java
  "void", "main", "public", "private", "static", "int", "char", "double",
  "float", "boolean", "string", "array", "object",
]);

function normalizeIdentifiers(code: string): string {
  const identifierMap = new Map<string, string>();
  let counter = 0;
  return code.replace(/\b([a-z_][a-z0-9_]{2,})\b/g, (match) => {
    if (KEYWORDS.has(match)) return match;
    if (!identifierMap.has(match)) {
      identifierMap.set(match, `VAR${counter++}`);
    }
    return identifierMap.get(match)!;
  });
}

/**
 * Tokenize code into a set of tokens (for Jaccard similarity)
 */
function tokenize(code: string): Set<string> {
  const tokens = code.match(/\b\w+\b/g) || [];
  return new Set(tokens);
}

/**
 * Jaccard similarity: |A ∩ B| / |A ∪ B|
 * Returns 0–100
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 100;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return Math.round((intersection.size / union.size) * 100);
}

/**
 * Edit distance (Levenshtein) on word arrays (not chars, to keep it manageable).
 * Returns normalized edit distance ratio 0–100 (100 = identical).
 */
function editDistanceRatio(a: string, b: string): number {
  const wordsA = a.split(" ").slice(0, 200); // cap at 200 tokens for performance
  const wordsB = b.split(" ").slice(0, 200);
  const m = wordsA.length;
  const n = wordsB.length;
  if (m === 0 && n === 0) return 100;

  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        wordsA[i - 1] === wordsB[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  const maxLen = Math.max(m, n);
  return Math.round((1 - dp[m][n] / maxLen) * 100);
}

/**
 * Token frequency histogram matching.
 * Count occurrences of structural keywords, compare histograms.
 * Returns 0–100 similarity.
 */
const STRUCTURAL_TOKENS = [
  "if", "else", "for", "while", "def", "function", "class", "return",
  "import", "try", "catch", "except", "print", "console", "var", "let",
  "const", "new", "this", "null", "true", "false",
];

function histogramSimilarity(a: string, b: string): number {
  const countIn = (code: string, token: string) => {
    const re = new RegExp(`\\b${token}\\b`, "g");
    return (code.match(re) || []).length;
  };

  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (const token of STRUCTURAL_TOKENS) {
    const ca = countIn(a, token);
    const cb = countIn(b, token);
    dotProduct += ca * cb;
    magA += ca * ca;
    magB += cb * cb;
  }

  if (magA === 0 || magB === 0) return 0;
  return Math.round((dotProduct / Math.sqrt(magA * magB)) * 100);
}

/**
 * Combined weighted similarity score (0–100)
 */
function combinedSimilarity(
  jaccard: number,
  editRatio: number,
  histogram: number
): number {
  return Math.round(jaccard * 0.4 + editRatio * 0.4 + histogram * 0.2);
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { submission_id, assignment_id, student_id } = await req.json();

    if (!submission_id || !assignment_id || !student_id) {
      return new Response(
        JSON.stringify({ error: "submission_id, assignment_id, and student_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch the target submission
    const { data: target, error: targetErr } = await supabase
      .from("submissions")
      .select("id, code, student_id")
      .eq("id", submission_id)
      .single();

    if (targetErr || !target?.code) {
      console.error("Target submission not found:", targetErr);
      return new Response(JSON.stringify({ error: "Target submission not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch ALL other submissions for the same assignment (excluding this student)
    const { data: peers, error: peersErr } = await supabase
      .from("submissions")
      .select("id, code, student_id")
      .eq("assignment_id", assignment_id)
      .neq("student_id", student_id);

    if (peersErr || !peers || peers.length === 0) {
      // No peers to compare — store empty results and exit gracefully
      await supabase
        .from("ai_evaluations")
        .update({
          peer_similarity_scores: [],
          highest_peer_similarity: 0,
        })
        .eq("submission_id", submission_id);

      return new Response(JSON.stringify({ success: true, message: "No peer submissions found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Local similarity analysis ─────────────────────────────────────────────
    const targetNorm = normalizeCode(target.code);
    const targetNormId = normalizeIdentifiers(targetNorm);
    const targetTokens = tokenize(targetNormId);

    const peerScores: Array<{
      student_id: string;
      submission_id: string;
      similarity_score: number;
      jaccard: number;
      edit_ratio: number;
      histogram: number;
    }> = [];

    for (const peer of peers) {
      if (!peer.code) continue;

      const peerNorm = normalizeCode(peer.code);
      const peerNormId = normalizeIdentifiers(peerNorm);
      const peerTokens = tokenize(peerNormId);

      const jaccard = jaccardSimilarity(targetTokens, peerTokens);
      const editRatio = editDistanceRatio(targetNormId, peerNormId);
      const histogram = histogramSimilarity(targetNorm, peerNorm);
      const score = combinedSimilarity(jaccard, editRatio, histogram);

      peerScores.push({
        student_id: peer.student_id,
        submission_id: peer.id,
        similarity_score: score,
        jaccard,
        edit_ratio: editRatio,
        histogram,
      });
    }

    // Sort by score descending
    peerScores.sort((a, b) => b.similarity_score - a.similarity_score);
    const highestScore = peerScores[0]?.similarity_score ?? 0;

    // Store local results immediately
    await supabase
      .from("ai_evaluations")
      .update({
        peer_similarity_scores: peerScores,
        highest_peer_similarity: highestScore,
      })
      .eq("submission_id", submission_id);

    // ── Groq deep analysis when similarity threshold exceeded ───
    if (highestScore >= SIMILARITY_THRESHOLD && isGroqConfigured()) {
      const topMatch = peerScores[0];

      const { data: peerSub } = await supabase
        .from("submissions")
        .select("code")
        .eq("id", topMatch.submission_id)
        .single();

      if (peerSub?.code) {
        const PLAGIARISM_FALLBACK = {
          is_plagiarism: false,
          confidence: 50,
          verdict: "Automatic evaluation partially completed.",
          evidence: [] as string[],
        };

        console.log("[check-plagiarism] calling Groq (plain JSON)");
        const groqResult = await callGroqChatCompletion({
          messages: [
            { role: "system", content: JSON_EVALUATOR_SYSTEM_PROMPT },
            {
              role: "user",
              content: `Compare two submissions for plagiarism.

Similarity ${topMatch.similarity_score}% (Jaccard ${topMatch.jaccard}%, edit ${topMatch.edit_ratio}%, histogram ${topMatch.histogram}%).

SUBMISSION A:
\`\`\`
${target.code.slice(0, 3000)}
\`\`\`

SUBMISSION B:
\`\`\`
${peerSub.code.slice(0, 3000)}
\`\`\`

Return JSON in exactly this shape:
{
  "is_plagiarism": <boolean>,
  "confidence": <number 0-100>,
  "verdict": "<string>",
  "evidence": ["<string>"]
}`,
            },
          ],
          temperature: 0.2,
        });

        if (groqResult.ok) {
          const verdict = parseGroqJsonContent(
            groqResult.data,
            PLAGIARISM_FALLBACK,
            "[check-plagiarism]"
          );
          const peerAiVerdict = `[Confidence: ${verdict.confidence}%] ${verdict.verdict}`;
          await supabase
            .from("ai_evaluations")
            .update({ peer_ai_verdict: peerAiVerdict })
            .eq("submission_id", submission_id);

          if (verdict.is_plagiarism && Number(verdict.confidence) >= 75) {
            await supabase.from("submissions").update({ status: "flagged" }).eq("id", submission_id);
          }
        } else {
          console.error("[check-plagiarism] Groq failed:", groqResult.error);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        highest_peer_similarity: highestScore,
        peers_compared: peerScores.length,
        ai_triggered: highestScore >= SIMILARITY_THRESHOLD,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("check-plagiarism error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
