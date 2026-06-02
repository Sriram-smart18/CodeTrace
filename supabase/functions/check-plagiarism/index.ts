// @ts-nocheck
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

// AST structural extraction
function getAstStructure(code: string): string {
  if (typeof code !== "string") return "";
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "") // remove block comments
    .replace(/\/\/[^\n]*/g, "")      // remove single line comments
    .replace(/#[^\n]*/g, "")         // python comments
    .replace(/"[^"]*"/g, "")         // remove strings
    .replace(/'[^']*'/g, "")         // remove strings
    .match(/\b(if|else|elif|for|while|def|class|return|try|except|finally)\b|[{}\[\](),;]/g)
    ?.join(" ") || "";
}

// Winnowing fingerprints (k-grams hashing)
function getWinnowingFingerprints(code: string, k = 5, t = 10): Set<number> {
  if (typeof code !== "string") return new Set();
  const normalized = code.replace(/\s+/g, "");
  const hashes: number[] = [];
  
  const simpleHash = (str: string) => {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h * 31 + str.charCodeAt(i)) | 0;
    }
    return h;
  };

  for (let i = 0; i <= normalized.length - k; i++) {
    const gram = normalized.substring(i, i + k);
    hashes.push(simpleHash(gram));
  }

  const w = t - k + 1;
  const fingerprints = new Set<number>();
  if (hashes.length < w) {
    return new Set(hashes);
  }

  for (let i = 0; i <= hashes.length - w; i++) {
    let minVal = hashes[i];
    for (let j = 1; j < w; j++) {
      if (hashes[i + j] < minVal) {
        minVal = hashes[i + j];
      }
    }
    fingerprints.add(minVal);
  }
  return fingerprints;
}

function winnowingSimilarity(a: Set<number>, b: Set<number>): number {
  if (a.size === 0 && b.size === 0) return 100;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return Math.round((intersection.size / union.size) * 100);
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

    // 1. Fetch the target submission
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

    // 2. Fetch Teacher Reference Solution
    const { data: asgn } = await supabase
      .from("assignments")
      .select("reference_solution")
      .eq("id", assignment_id)
      .maybeSingle();

    // 3. Fetch Peer Submissions (Same assignment, excluding this student)
    const { data: peers } = await supabase
      .from("submissions")
      .select("id, code, student_id")
      .eq("assignment_id", assignment_id)
      .neq("student_id", student_id);

    // 4. Fetch Historical Submissions (Other assignments, excluding this student)
    const { data: historical } = await supabase
      .from("submissions")
      .select("id, code, student_id, assignment_id")
      .neq("assignment_id", assignment_id)
      .neq("student_id", student_id)
      .order("submitted_at", { ascending: false })
      .limit(100);

    // ── Comparison Logic ───────────────────────────────────────────────────────
    const targetCode = target.code;
    const comparisonResults: Array<{
      id: string;
      student_id: string;
      assignment_id: string;
      type: 'peer' | 'historical' | 'reference';
      similarity_score: number;
      ast_similarity: number;
      winnowing_similarity: number;
      levenshtein_distance: number;
      token_similarity: number;
    }> = [];

    const compareCodes = (codeA: string, codeB: string) => {
      const astA = getAstStructure(codeA);
      const astTokensA = tokenize(astA);
      const winnowingA = getWinnowingFingerprints(codeA);
      const normA = normalizeCode(codeA);
      const normAId = normalizeIdentifiers(normA);
      const tokensA = tokenize(normAId);

      const astB = getAstStructure(codeB);
      const astTokensB = tokenize(astB);
      const winnowingB = getWinnowingFingerprints(codeB);
      const normB = normalizeCode(codeB);
      const normBId = normalizeIdentifiers(normB);
      const tokensB = tokenize(normBId);

      const astSim = jaccardSimilarity(astTokensA, astTokensB);
      const winnowingSim = winnowingSimilarity(winnowingA, winnowingB);
      const editRatio = editDistanceRatio(normAId, normBId);
      const tokenSim = jaccardSimilarity(tokensA, tokensB);

      const score = Math.round((astSim + winnowingSim + editRatio + tokenSim) / 4);

      return {
        score,
        ast_similarity: astSim,
        winnowing_similarity: winnowingSim,
        levenshtein_distance: editRatio,
        token_similarity: tokenSim,
      };
    };

    // Run comparison against peers
    if (peers) {
      for (const peer of peers) {
        if (!peer.code) continue;
        const res = compareCodes(targetCode, peer.code);
        comparisonResults.push({
          id: peer.id,
          student_id: peer.student_id,
          assignment_id: assignment_id,
          type: 'peer',
          similarity_score: res.score,
          ast_similarity: res.ast_similarity,
          winnowing_similarity: res.winnowing_similarity,
          levenshtein_distance: res.levenshtein_distance,
          token_similarity: res.token_similarity,
        });
      }
    }

    // Run comparison against historical
    if (historical) {
      for (const hist of historical) {
        if (!hist.code) continue;
        const res = compareCodes(targetCode, hist.code);
        comparisonResults.push({
          id: hist.id,
          student_id: hist.student_id,
          assignment_id: hist.assignment_id || assignment_id,
          type: 'historical',
          similarity_score: res.score,
          ast_similarity: res.ast_similarity,
          winnowing_similarity: res.winnowing_similarity,
          levenshtein_distance: res.levenshtein_distance,
          token_similarity: res.token_similarity,
        });
      }
    }

    // Run comparison against Teacher Reference Solution
    if (asgn && asgn.reference_solution) {
      const res = compareCodes(targetCode, asgn.reference_solution);
      comparisonResults.push({
        id: 'reference',
        student_id: 'teacher',
        assignment_id: assignment_id,
        type: 'reference',
        similarity_score: res.score,
        ast_similarity: res.ast_similarity,
        winnowing_similarity: res.winnowing_similarity,
        levenshtein_distance: res.levenshtein_distance,
        token_similarity: res.token_similarity,
      });
    }

    // Sort by combined score descending
    comparisonResults.sort((a, b) => b.similarity_score - a.similarity_score);
    const highestScore = comparisonResults[0]?.similarity_score ?? 0;
    const topMatch = comparisonResults[0];

    const details = topMatch
      ? {
          ast_similarity: topMatch.ast_similarity,
          winnowing_similarity: topMatch.winnowing_similarity,
          levenshtein_distance: topMatch.levenshtein_distance,
          token_similarity: topMatch.token_similarity,
        }
      : {
          ast_similarity: 0,
          winnowing_similarity: 0,
          levenshtein_distance: 0,
          token_similarity: 0,
        };

    // Calculate metadata for matches with similarity >= 30%
    const thresholdScore = 30;
    const matchedItems = comparisonResults.filter(r => r.similarity_score >= thresholdScore);
    const matchedIds = matchedItems.map(m => m.id);
    const matchedStudentIds = [...new Set(matchedItems.filter(m => m.student_id !== 'teacher').map(m => m.student_id))];
    const matchedStudentCount = matchedStudentIds.length;

    let explanation = "Low plagiarism risk. Code patterns appear original.";
    if (highestScore >= 70) {
      const typeText = topMatch.type === 'reference' ? "Teacher Reference Solution" : topMatch.type === 'historical' ? "a historical submission" : "a peer submission";
      explanation = `High plagiarism risk detected (${highestScore}% similarity). Code is extremely similar to ${typeText} (ID: ${topMatch.id.slice(-8)}).`;
    } else if (highestScore >= 30) {
      const typeText = topMatch.type === 'reference' ? "Teacher Reference Solution" : topMatch.type === 'historical' ? "a historical submission" : "a peer submission";
      explanation = `Moderate plagiarism risk detected (${highestScore}% similarity). Code shares significant structural patterns with ${typeText} (ID: ${topMatch.id.slice(-8)}).`;
    }

    // Store legacy results in ai_evaluations
    await supabase
      .from("ai_evaluations")
      .update({
        peer_similarity_scores: comparisonResults,
        highest_peer_similarity: highestScore,
        peer_ai_verdict: explanation,
      })
      .eq("submission_id", submission_id);

    // ── Groq deep analysis when similarity threshold exceeded and Groq configured ───
    if (highestScore >= SIMILARITY_THRESHOLD && isGroqConfigured()) {
      let matchCode = "";
      if (topMatch.type === 'reference' && asgn) {
        matchCode = asgn.reference_solution || "";
      } else {
        const { data: peerSub } = await supabase
          .from("submissions")
          .select("code")
          .eq("id", topMatch.id)
          .single();
        matchCode = peerSub?.code || "";
      }

      if (matchCode) {
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

Similarity ${topMatch.similarity_score}% (AST ${topMatch.ast_similarity}%, winnowing ${topMatch.winnowing_similarity}%, edit ${topMatch.levenshtein_distance}%, token ${topMatch.token_similarity}%).

SUBMISSION A:
\`\`\`
${target.code.slice(0, 3000)}
\`\`\`

SUBMISSION B:
\`\`\`
${matchCode.slice(0, 3000)}
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
          explanation = `[Confidence: ${verdict.confidence}%] ${verdict.verdict}`;
          await supabase
            .from("ai_evaluations")
            .update({ peer_ai_verdict: explanation })
            .eq("submission_id", submission_id);

          if (verdict.is_plagiarism && Number(verdict.confidence) >= 75) {
            await supabase.from("submissions").update({ status: "flagged" }).eq("id", submission_id);
          }
        }
      }
    }

    const plagiarismDetails = {
      matched_submission_ids: matchedIds,
      matched_student_ids: matchedStudentIds,
      similarity_percentage: highestScore,
      matched_student_count: matchedStudentCount,
      plagiarism_explanation: explanation,
    };

    return new Response(
      JSON.stringify({
        success: true,
        highest_peer_similarity: highestScore,
        peers_compared: comparisonResults.length,
        ai_triggered: highestScore >= SIMILARITY_THRESHOLD,
        details,
        plagiarism_details: plagiarismDetails,
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
