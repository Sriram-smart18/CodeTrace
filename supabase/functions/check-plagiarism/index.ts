// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  callOpenRouterChatCompletion,
  isOpenRouterConfigured,
  JSON_EVALUATOR_SYSTEM_PROMPT,
  parseOpenRouterJsonContent,
} from "../_shared/lib/ai/openrouter.ts";
import { corsHeaders, handleOptions, jsonResponse } from "../_shared/cors.ts";

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

// ─── Configurable threshold ───────────────────────────────────────────────────
// Pairs with local similarity >= this value trigger an AI deep-analysis call
const SIMILARITY_THRESHOLD = 50;

// ─── Similarity utilities (pure Deno, no external deps) ──────────────────────

/**
 * Normalize code for comparison:
 * - Strip comments
 * - Normalize and sort imports/includes to ignore order changes
 * - Replace string literals with a placeholder
 * - Normalize casing to lowercase
 * - Collapse multiple whitespaces and newlines
 */
export function normalizeCode(code: string): string {
  if (typeof code !== "string") return "";
  
  // 1. Strip comments
  let cleanCode = code
    .replace(/\/\*[\s\S]*?\*\//g, " ")   // block comments
    .replace(/\/\/[^\n]*/g, " ")          // JS/Java/C++ single line comments
    .replace(/#[^\n]*/g, " ");             // Python comments

  // 2. Identify and normalize imports
  const lines = cleanCode.split(/\r?\n/);
  const importLines: string[] = [];
  const bodyLines: string[] = [];

  const importRegex = /^\s*(import\s+|from\s+\S+\s+import\s+|#include\s+|(const|let|var)\s+\S+\s*=\s*require\s*\(|import\s*\(|using\s+namespace\s+)/;

  for (const line of lines) {
    if (importRegex.test(line)) {
      importLines.push(line.trim());
    } else {
      bodyLines.push(line);
    }
  }

  // Sort imports alphabetically to ignore order changes
  importLines.sort();

  // Reconstruct code with sorted imports followed by body
  cleanCode = [...importLines, ...bodyLines].join("\n");

  // 3. String literals -> STR
  cleanCode = cleanCode.replace(/["'`]([^"'`\n]*)["'`]/g, '"STR"');

  // 4. Case-insensitivity (lowercase)
  cleanCode = cleanCode.toLowerCase();

  // 5. Ignore blank lines, normalize whitespace
  return cleanCode.replace(/\s+/g, " ").trim();
}

/**
 * Keywords list across Python, JS, TS, C++, Java
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
  "null", "undefined", "super", "extends", "export", "default", "switch", "case", "delete", "do",
  // C/Java
  "void", "main", "public", "private", "static", "double", "boolean", "string", "array", "object",
  "protected", "final", "abstract", "synchronized", "volatile", "transient", "native", "strictfp",
  "throws", "package", "implements", "interface", "enum", "byte", "short", "long",
  // C++
  "alignas", "alignof", "and_eq", "asm", "atomic_cancel", "atomic_commit", "atomic_noexcept", "auto",
  "bitand", "bitor", "bool", "compl", "concept", "consteval", "constexpr", "constinit", "const_cast",
  "co_await", "co_return", "co_yield", "decltype", "dynamic_cast", "explicit", "extern", "friend",
  "inline", "mutable", "namespace", "noexcept", "not_eq", "nullptr", "operator", "or_eq", "reflexpr",
  "register", "reinterpret_cast", "requires", "signed", "sizeof", "static_assert", "static_cast",
  "struct", "template", "thread_local", "typedef", "typeid", "typename", "union", "unsigned",
  "using", "virtual", "wchar_t", "xor", "xor_eq", "std", "cout", "cin", "endl", "vector"
]);

/**
 * Identifier normalization:
 * Replace all variable, function, and class names with sequential placeholders var_0, var_1, etc.
 */
export function normalizeIdentifiers(code: string): string {
  const identifierMap = new Map<string, string>();
  let counter = 0;
  return code.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (match) => {
    const lowerMatch = match.toLowerCase();
    if (KEYWORDS.has(lowerMatch)) return match;
    if (!identifierMap.has(lowerMatch)) {
      identifierMap.set(lowerMatch, `var_${counter++}`);
    }
    return identifierMap.get(lowerMatch)!;
  });
}

/**
 * Tokenize code into a set of words
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
 * Edit distance (Levenshtein) on word arrays.
 * Returns ratio 0–100 (100 = identical).
 */
function editDistanceRatio(a: string, b: string): number {
  const wordsA = a.split(" ").slice(0, 300); // capped at 300 tokens
  const wordsB = b.split(" ").slice(0, 300);
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
 * Token frequency histogram matching
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
 * Existing regex-based AST structure extractor (preserved for AST score layer)
 */
function getAstStructure(code: string): string {
  if (typeof code !== "string") return "";
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "") // remove block comments
    .replace(/\/\/[^\n]*/g, "")      // remove single line comments
    .replace(/#[^\n]*/g, "")         // python comments
    .replace(/"[^"]*"/g, "")         // remove strings
    .replace(/'[^']*'/g, "")         // remove strings
    .match(/\b(if|else|elif|for|while|def|class|return|try|except|finally)\b|[{}[\](),;]/g)
    ?.join(" ") || "";
}

/**
 * Python indentation to brace-style converter for unified structural parsing
 */
function pythonToBraces(code: string): string {
  const lines = code.split(/\r?\n/);
  const result: string[] = [];
  const indentStack: number[] = [0];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = line.match(/^([ \t]*)/);
    const indent = match ? match[0].replace(/\t/g, "    ").length : 0;

    if (indent > indentStack[indentStack.length - 1]) {
      indentStack.push(indent);
      result.push("{");
    } else {
      while (indentStack.length > 1 && indent < indentStack[indentStack.length - 1]) {
        indentStack.pop();
        result.push("}");
      }
    }

    result.push(trimmed);
  }

  while (indentStack.length > 1) {
    indentStack.pop();
    result.push("}");
  }

  return result.join("\n");
}

function tokenizeStructural(code: string): string[] {
  return code.match(/\b\w+\b|[{}(),;]|=>/g) || [];
}

interface Block {
  type: 'function' | 'loop' | 'conditional' | 'try' | 'class' | 'unknown';
  name: string;
  calls: string[];
  hasRecursion: boolean;
  children: Block[];
}

function buildBlockTree(tokens: string[]): Block {
  const root: Block = { type: 'unknown', name: 'root', calls: [], hasRecursion: false, children: [] };
  const stack: Block[] = [root];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token === "{") {
      let type: Block['type'] = 'unknown';
      let name = '';
      
      let j = i - 1;
      let parenDepth = 0;
      while (j >= 0) {
        if (tokens[j] === ":") {
          // skip colon
        } else if (tokens[j] === ")") {
          parenDepth++;
        } else if (tokens[j] === "(") {
          parenDepth--;
        } else if (parenDepth === 0) {
          break;
        }
        j--;
      }
      
      let startIdx = j;
      let depth = 0;
      while (startIdx > 0) {
        const prevToken = tokens[startIdx - 1];
        if (prevToken === ")") depth++;
        else if (prevToken === "(") depth--;
        
        if (depth === 0 && (prevToken === "{" || prevToken === "}" || prevToken === ";")) {
          break;
        }
        startIdx--;
        if (j - startIdx > 20) break;
      }

      const headerTokens: string[] = [];
      for (let k = startIdx; k <= j; k++) {
        if (tokens[k] && tokens[k] !== "}" && tokens[k] !== "{") {
          headerTokens.push(tokens[k]);
        }
      }

      const headerStr = headerTokens.join(" ");

      if (headerTokens.includes("if") || headerTokens.includes("elif") || headerTokens.includes("else")) {
        type = 'conditional';
      } else if (headerTokens.includes("for") || headerTokens.includes("while")) {
        type = 'loop';
      } else if (headerTokens.includes("try") || headerTokens.includes("catch") || headerTokens.includes("finally")) {
        type = 'try';
      } else if (headerTokens.includes("class")) {
        type = 'class';
        name = headerTokens[headerTokens.indexOf("class") + 1] || '';
      } else if (headerTokens.includes("def") || headerTokens.includes("function") || headerStr.includes("=>")) {
        type = 'function';
        if (headerTokens.includes("def")) {
          name = headerTokens[headerTokens.indexOf("def") + 1] || '';
        } else if (headerTokens.includes("function")) {
          name = headerTokens[headerTokens.indexOf("function") + 1] || '';
        } else {
          name = headerTokens[0] || '';
        }
      } else if (headerTokens.length > 0) {
        const lastToken = headerTokens[headerTokens.length - 1];
        const keywords = new Set(["public", "private", "protected", "static", "final", "void", "int", "double", "float", "char", "boolean", "string"]);
        if (lastToken && !keywords.has(lastToken)) {
          type = 'function';
          name = lastToken;
        }
      }

      const newBlock: Block = { type, name, calls: [], hasRecursion: false, children: [] };
      stack[stack.length - 1].children.push(newBlock);
      stack.push(newBlock);
    } else if (token === "}") {
      if (stack.length > 1) {
        stack.pop();
      }
    } else if (token === "(") {
      const prev = tokens[i - 1];
      const keywords = new Set(["if", "for", "while", "switch", "catch", "elif"]);
      if (prev && !keywords.has(prev) && isNaN(Number(prev))) {
        const currentBlock = stack[stack.length - 1];
        if (currentBlock) {
          currentBlock.calls.push(prev);
        }
      }
    }
  }

  return root;
}

function checkRecursion(block: Block, currentFunctionName?: string) {
  const funcName = block.type === 'function' ? block.name : currentFunctionName;
  
  if (funcName) {
    if (block.calls.includes(funcName)) {
      block.hasRecursion = true;
    }
  }

  for (const child of block.children) {
    checkRecursion(child, funcName);
    if (funcName && child.hasRecursion) {
      block.hasRecursion = true;
    }
  }
}

function collectFunctionNames(block: Block, names: string[] = []): string[] {
  if (block.type === 'function' && block.name) {
    names.push(block.name);
  }
  for (const child of block.children) {
    collectFunctionNames(child, names);
  }
  return names;
}

function serializeBlockTree(block: Block, functionMap: Map<string, string>): string[] {
  const stream: string[] = [];

  if (block.type === 'function') {
    const placeholder = functionMap.get(block.name) || 'F_UNKNOWN';
    stream.push(`FUNC_START:${placeholder}`);
    if (block.hasRecursion) {
      stream.push('RECURSION');
    }
  } else if (block.type === 'loop') {
    stream.push('LOOP_START');
  } else if (block.type === 'conditional') {
    stream.push('COND_START');
  } else if (block.type === 'try') {
    stream.push('TRY_START');
  } else if (block.type === 'class') {
    stream.push(`CLASS_START`);
  }

  for (const call of block.calls) {
    if (functionMap.has(call)) {
      stream.push(`CALL:${functionMap.get(call)}`);
    } else {
      stream.push(`CALL_EXT`);
    }
  }

  for (const child of block.children) {
    stream.push(...serializeBlockTree(child, functionMap));
  }

  if (block.type === 'function') {
    stream.push('FUNC_END');
  } else if (block.type === 'loop') {
    stream.push('LOOP_END');
  } else if (block.type === 'conditional') {
    stream.push('COND_END');
  } else if (block.type === 'try') {
    stream.push('TRY_END');
  } else if (block.type === 'class') {
    stream.push('CLASS_END');
  }

  return stream;
}

export function getLanguageAgnosticIR(code: string, language: string): string {
  let braceCode = code;
  if (language && language.toLowerCase() === 'python') {
    braceCode = pythonToBraces(code);
  }
  
  const tokens = tokenizeStructural(braceCode);
  const blockTree = buildBlockTree(tokens);
  checkRecursion(blockTree);

  const functionNames = collectFunctionNames(blockTree);
  const functionMap = new Map<string, string>();
  functionNames.forEach((name, idx) => {
    functionMap.set(name, `F${idx}`);
  });

  const serialized = serializeBlockTree(blockTree, functionMap);
  return serialized.join(" ");
}

export function compareStructuralIR(irA: string, irB: string): number {
  return editDistanceRatio(irA, irB);
}

interface StyleMetrics {
  avgFunctionLength: number;
  namingStyle: 'camel' | 'snake' | 'other';
  maxNestingDepth: number;
  controlFlowComplexity: number;
}

function extractStyleMetrics(code: string, language: string): StyleMetrics {
  let braceCode = code;
  if (language && language.toLowerCase() === 'python') {
    braceCode = pythonToBraces(code);
  }
  
  const tokens = tokenizeStructural(braceCode);
  const root = buildBlockTree(tokens);
  
  const getDepth = (block: Block): number => {
    if (block.children.length === 0) return 1;
    return 1 + Math.max(...block.children.map(getDepth));
  };
  const maxNestingDepth = root.children.length > 0 ? Math.max(...root.children.map(getDepth)) : 1;

  let loops = 0;
  let conditionals = 0;
  const countBlocks = (block: Block) => {
    if (block.type === 'loop') loops++;
    if (block.type === 'conditional') conditionals++;
    for (const child of block.children) {
      countBlocks(child);
    }
  };
  countBlocks(root);
  const controlFlowComplexity = loops + conditionals;

  let totalFuncTokens = 0;
  let funcCount = 0;
  
  const measureFunctions = (block: Block) => {
    if (block.type === 'function') {
      funcCount++;
      const functionTokens = serializeBlockTree(block, new Map());
      totalFuncTokens += functionTokens.length;
    }
    for (const child of block.children) {
      measureFunctions(child);
    }
  };
  measureFunctions(root);
  const avgFunctionLength = funcCount > 0 ? Math.round(totalFuncTokens / funcCount) : 0;

  const rawIdentifiers = code.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
  let camelCount = 0;
  let snakeCount = 0;
  let totalIdentifiers = 0;

  for (const id of rawIdentifiers) {
    if (KEYWORDS.has(id.toLowerCase())) continue;
    totalIdentifiers++;
    if (id.includes('_')) {
      snakeCount++;
    } else if (/[a-z]+[A-Z]/.test(id)) {
      camelCount++;
    }
  }

  let namingStyle: StyleMetrics['namingStyle'] = 'other';
  if (totalIdentifiers > 0) {
    if (snakeCount > camelCount && snakeCount > totalIdentifiers * 0.3) {
      namingStyle = 'snake';
    } else if (camelCount > snakeCount && camelCount > totalIdentifiers * 0.3) {
      namingStyle = 'camel';
    }
  }

  return {
    avgFunctionLength,
    namingStyle,
    maxNestingDepth,
    controlFlowComplexity
  };
}

function checkStyleDeviation(current: StyleMetrics, historical: StyleMetrics[]): boolean {
  if (historical.length < 2) return false;

  const avgFuncLen = historical.reduce((acc, h) => acc + h.avgFunctionLength, 0) / historical.length;
  const avgNesting = historical.reduce((acc, h) => acc + h.maxNestingDepth, 0) / historical.length;
  const avgComplexity = historical.reduce((acc, h) => acc + h.controlFlowComplexity, 0) / historical.length;
  
  const pastNamingStyles = historical.map(h => h.namingStyle);
  const dominantPastStyle = pastNamingStyles.filter(s => s !== 'other')[0] || 'other';

  const funcLenDeviates = current.avgFunctionLength > avgFuncLen * 2.0 || current.avgFunctionLength < avgFuncLen * 0.3;
  const nestingDeviates = Math.abs(current.maxNestingDepth - avgNesting) >= 3;
  const complexityDeviates = current.controlFlowComplexity > avgComplexity * 2.0 || current.controlFlowComplexity < avgComplexity * 0.3;
  const namingStyleChanged = current.namingStyle !== 'other' && dominantPastStyle !== 'other' && current.namingStyle !== dominantPastStyle;

  return (funcLenDeviates ? 1 : 0) + (nestingDeviates ? 1 : 0) + (complexityDeviates ? 1 : 0) + (namingStyleChanged ? 1 : 0) >= 2;
}

// Winnowing fingerprints (k-grams hashing)
export function getWinnowingFingerprints(code: string, k = 5, t = 10): Set<number> {
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

export function winnowingSimilarity(a: Set<number>, b: Set<number>): number {
  if (a.size === 0 && b.size === 0) return 100;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return Math.round((intersection.size / union.size) * 100);
}

export function computePlagiarismRiskLevel(
  finalScore: number,
  astScore: number,
  winnowingScore: number,
  structuralScore: number
): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (finalScore >= 85) {
    const enginesAbove80 = 
      (astScore >= 80 ? 1 : 0) + 
      (winnowingScore >= 80 ? 1 : 0) + 
      (structuralScore >= 80 ? 1 : 0);
      
    if (enginesAbove80 >= 2) {
      return "CRITICAL";
    } else {
      return "HIGH";
    }
  } else if (finalScore >= 70) {
    return "HIGH";
  } else if (finalScore >= 40) {
    return "MEDIUM";
  }
  return "LOW";
}

export function shouldTriggerAI(
  astSimilarity: number,
  winnowingSimilarity: number,
  structuralSimilarity: number
): boolean {
  return astSimilarity > 50 || winnowingSimilarity > 50 || structuralSimilarity > 50;
}

export function classifyMatchSource(
  match: { student_id: string; assignment_id: string },
  assignment_id: string,
  student_id: string,
  targetClassroomId?: string,
  assignmentClassroomMap?: Map<string, string>
): 'same_assignment' | 'previous_assignment' | 'historical_submission' | 'cross_classroom' {
  if (match.student_id === 'teacher') {
    return 'same_assignment';
  } else if (match.student_id === student_id) {
    return 'historical_submission';
  } else if (match.assignment_id === assignment_id) {
    return 'same_assignment';
  } else if (assignmentClassroomMap && targetClassroomId && assignmentClassroomMap.get(match.assignment_id) === targetClassroomId) {
    return 'previous_assignment';
  } else {
    return 'cross_classroom';
  }
}


// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
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

    const { submission_id, assignment_id, student_id } = await req.json();

    if (!submission_id || !assignment_id || !student_id) {
      return jsonResponse({ error: "submission_id, assignment_id, and student_id are required" }, 400);
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

    // 1. Fetch the target submission (including language, behavioral_log, submitted_at)
    const { data: target, error: targetErr } = await supabase
      .from("submissions")
      .select("id, code, student_id, language, behavioral_log, submitted_at")
      .eq("id", submission_id)
      .single();

    if (targetErr || !target?.code) {
      console.error("Target submission not found:", targetErr);
      return jsonResponse({ error: "Target submission not found" }, 404);
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
      .select("id, code, student_id, assignment_id, language")
      .eq("assignment_id", assignment_id)
      .neq("student_id", student_id);

    // 4. Fetch Historical Submissions (Other assignments, excluding this student)
    const { data: historical } = await supabase
      .from("submissions")
      .select("id, code, student_id, assignment_id, language")
      .neq("assignment_id", assignment_id)
      .neq("student_id", student_id)
      .order("submitted_at", { ascending: false })
      .limit(100);

    // 5. Fetch Student's own historical submissions (Other assignments, same student)
    const { data: ownHistorical } = await supabase
      .from("submissions")
      .select("id, code, student_id, assignment_id, language, behavioral_log, submitted_at")
      .eq("student_id", student_id)
      .neq("id", submission_id)
      .order("submitted_at", { ascending: false })
      .limit(20);

    // Map of assignments to classroom_ids to classify match sources
    const { data: assignmentsList } = await supabase
      .from("assignments")
      .select("id, classroom_id");
    const assignmentClassroomMap = new Map<string, string>();
    assignmentsList?.forEach((a: { id: string; classroom_id: string }) => {
      assignmentClassroomMap.set(a.id, a.classroom_id);
    });
    const targetClassroomId = assignmentClassroomMap.get(assignment_id);

    // ── Student Style Deviation Analysis ─────────────────────────────────────
    const currentStyle = extractStyleMetrics(target.code, target.language || "python");
    const ownHistoricalMetrics = (ownHistorical || [])
      .filter(h => h.code)
      .map(h => extractStyleMetrics(h.code, h.language || "python"));
    const styleInconsistency = checkStyleDeviation(currentStyle, ownHistoricalMetrics);

    // ── Telemetry & Behavioral Correlation ────────────────────────────────────
    const behavioralLog = target.behavioral_log || {};
    const pasteCount = behavioralLog.paste_count || 0;
    const totalPastedChars = behavioralLog.total_pasted_chars || 0;
    const largestPasteSize = behavioralLog.largest_paste_size || 0;
    let submitAfterPasteSeconds = -1;
    if (behavioralLog.last_paste_time && target.submitted_at) {
      submitAfterPasteSeconds = (new Date(target.submitted_at).getTime() - new Date(behavioralLog.last_paste_time).getTime()) / 1000;
    }

    const isLargePaste = largestPasteSize > 150 || totalPastedChars > 300 || (behavioralLog.total_pasted_lines || 0) > 15;
    const isImmediateSubmit = submitAfterPasteSeconds >= 0 && submitAfterPasteSeconds <= 20;

    const isImmediateSubAfterPaste = isLargePaste && isImmediateSubmit;
    const isMassivePaste = totalPastedChars > 1000 || largestPasteSize > 600 || (behavioralLog.total_pasted_lines || 0) > 40;

    // ── Comparison Logic ───────────────────────────────────────────────────────
    const targetCode = target.code;
    const comparisonResults: Array<{
      id: string;
      student_id: string;
      assignment_id: string;
      type: 'peer' | 'historical' | 'reference';
      similarity_source: 'same_assignment' | 'previous_assignment' | 'historical_submission' | 'cross_classroom';
      similarity_score: number;
      ast_similarity: number;
      winnowing_similarity: number;
      levenshtein_distance: number;
      token_similarity: number;
      structural_similarity: number;
      ai_similarity: number;
    }> = [];

    const compareCodes = (codeA: string, codeB: string, langA: string, langB: string) => {
      // 1. AST (preserved)
      const astA = getAstStructure(codeA);
      const astB = getAstStructure(codeB);
      const astTokensA = tokenize(astA);
      const astTokensB = tokenize(astB);
      const astSim = jaccardSimilarity(astTokensA, astTokensB);

      // 2. Winnowing
      const winnowingA = getWinnowingFingerprints(codeA);
      const winnowingB = getWinnowingFingerprints(codeB);
      const winnowingSim = winnowingSimilarity(winnowingA, winnowingB);

      // 3. Normalization (formatting/whitespace/comments stripped)
      const normA = normalizeCode(codeA);
      const normB = normalizeCode(codeB);

      // 4. Identifier Normalization (Variables/functions/classes renaming resistance)
      const normAId = normalizeIdentifiers(normA);
      const normBId = normalizeIdentifiers(normB);
      const tokensA = tokenize(normAId);
      const tokensB = tokenize(normBId);

      const tokenSim = jaccardSimilarity(tokensA, tokensB);
      const editRatio = editDistanceRatio(normAId, normBId);

      // 5. Structural Similarity (language-agnostic IR comparison)
      const irA = getLanguageAgnosticIR(codeA, langA);
      const irB = getLanguageAgnosticIR(codeB, langB);
      const structuralSim = compareStructuralIR(irA, irB);

      // Local score calculation (weighted sum of 5 local components, out of 95%)
      // AST: 35%, Winnowing: 25%, Token: 15%, Levenshtein: 10%, Structural: 10%
      const localWeightedScore = (
        0.35 * astSim +
        0.25 * winnowingSim +
        0.15 * tokenSim +
        0.10 * editRatio +
        0.10 * structuralSim
      );

      return {
        localWeightedScore,
        ast_similarity: astSim,
        winnowing_similarity: winnowingSim,
        token_similarity: tokenSim,
        levenshtein_distance: editRatio,
        structural_similarity: structuralSim,
      };
    };

    const runMatchCandidate = (match: { id: string; code: string; student_id: string; assignment_id: string; language?: string }, type: 'peer' | 'historical' | 'reference') => {
      if (!match.code) return;
      const res = compareCodes(targetCode, match.code, target.language || "python", match.language || target.language || "python");

      // Classify match source
      const similaritySource = classifyMatchSource(match, assignment_id, student_id, targetClassroomId, assignmentClassroomMap);


      // Local similarity normalized to 0-100%
      const localSimilarityNormalized = Math.round(res.localWeightedScore / 0.95);

      // Applied behavioral boosts
      let matchBoost = 0;
      if (isImmediateSubAfterPaste) {
        matchBoost += 15;
      }
      if (isMassivePaste && localSimilarityNormalized >= 60) {
        matchBoost += 20;
      }

      // Combine local score and boost, capped at 95 (leaving 5% for AI Review)
      let similarityScore = res.localWeightedScore + matchBoost;
      if (similarityScore > 95) similarityScore = 95;

      comparisonResults.push({
        id: match.id,
        student_id: match.student_id,
        assignment_id: match.assignment_id,
        type,
        similarity_source: similaritySource,
        similarity_score: Math.round(similarityScore), // round for initial sorting
        ast_similarity: res.ast_similarity,
        winnowing_similarity: res.winnowing_similarity,
        levenshtein_distance: res.levenshtein_distance,
        token_similarity: res.token_similarity,
        structural_similarity: res.structural_similarity,
        ai_similarity: 0 // initially 0, populated later for topMatch
      });
    };

    // Run comparison against peers
    if (peers) {
      for (const peer of peers) {
        runMatchCandidate(peer, 'peer');
      }
    }

    // Run comparison against historical
    if (historical) {
      for (const hist of historical) {
        runMatchCandidate(hist, 'historical');
      }
    }

    // Run comparison against student's own historical
    if (ownHistorical) {
      for (const own of ownHistorical) {
        runMatchCandidate({ ...own, assignment_id: own.assignment_id || assignment_id }, 'historical');
      }
    }

    // Run comparison against Teacher Reference Solution
    if (asgn && asgn.reference_solution) {
      runMatchCandidate({
        id: 'reference',
        code: asgn.reference_solution,
        student_id: 'teacher',
        assignment_id: assignment_id,
        language: target.language
      }, 'reference');
    }

    // Sort by combined score descending
    comparisonResults.sort((a, b) => b.similarity_score - a.similarity_score);
    const topMatch = comparisonResults[0];

    // Explainable score details
    let details = {
      ast_similarity: topMatch?.ast_similarity ?? 0,
      winnowing_similarity: topMatch?.winnowing_similarity ?? 0,
      levenshtein_distance: topMatch?.levenshtein_distance ?? 0,
      token_similarity: topMatch?.token_similarity ?? 0,
      structural_similarity: topMatch?.structural_similarity ?? 0,
      ai_similarity: 0
    };

    let explanation = "Low plagiarism risk. Code patterns appear original.";
    const behavioralIndicators: string[] = [];
    if (isImmediateSubAfterPaste) {
      behavioralIndicators.push(`Suspicious paste telemetry: student pasted a large block of code (${largestPasteSize} chars) and submitted immediately (${Math.round(submitAfterPasteSeconds)}s later).`);
    }

    // ── OpenRouter deep analysis cost optimization ──────────────────────────
    let triggerAI = false;
    if (topMatch) {
      triggerAI = shouldTriggerAI(topMatch.ast_similarity, topMatch.winnowing_similarity, topMatch.structural_similarity);
    }


    let aiScore = 0;
    let aiVerdict = "AI review skipped for clean submissions.";

    if (triggerAI && topMatch && isOpenRouterConfigured()) {
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

        console.log("[check-plagiarism] calling OpenRouter (plain JSON) for semantic review");
        
        const userPrompt = `Compare two submissions for plagiarism, focusing on:
1. Algorithm equivalence: Do both use the same algorithm or approach (e.g., recursive vs iterative, DFS vs BFS)?
2. Logic equivalence: Is the logical flow, branch structure, and state changes equivalent?
3. Refactoring attempts: Has the code been refactored (e.g., extracting helper functions, inlining variables, folding loops)?
4. Variable renaming attempts: Has there been variable, function, or class renaming?

SUBMISSION A (Target):
\`\`\`
${target.code.slice(0, 3000)}
\`\`\`

SUBMISSION B (Matched Candidate):
\`\`\`
${matchCode.slice(0, 3000)}
\`\`\`

Return JSON in exactly this shape:
{
  "is_plagiarism": <boolean>,
  "confidence": <number 0-100>,
  "verdict": "<string AI reasoning summary>",
  "evidence": ["<string suspicious matched code region or details>"]
}`;

        const aiResult = await callOpenRouterChatCompletion({
          messages: [
            { role: "system", content: JSON_EVALUATOR_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.2,
        });

        if (aiResult.ok) {
          const verdict = parseOpenRouterJsonContent(
            aiResult.data,
            PLAGIARISM_FALLBACK,
            "[check-plagiarism]"
          );
          
          aiScore = Number(verdict.confidence) || 0;
          aiVerdict = verdict.verdict;
          
          if (verdict.evidence && verdict.evidence.length > 0) {
            behavioralIndicators.push(...verdict.evidence.map(e => `AI Semantic Evidence: ${e}`));
          }

          if (isMassivePaste && (topMatch.similarity_score / 0.95) >= 60) {
            behavioralIndicators.push(`Suspicious paste telemetry: student pasted a massive block of code (${totalPastedChars} chars) which has high similarity to another submission.`);
          }
        } else {
          // Fallback to local similarity if OpenRouter fails
          aiScore = Math.round(topMatch.similarity_score / 0.95);
          aiVerdict = "OpenRouter connection failed; fallback to local similarity.";
        }
      }
    } else if (topMatch) {
      // If AI is not triggered, default to local similarity fraction
      aiScore = 0;
      aiVerdict = "AI review not triggered (below local similarity threshold).";
    }

    // Update topMatch with the final AI score and calculate final similarity score
    if (topMatch) {
      topMatch.ai_similarity = aiScore;
      // Final Score = local score + AI review score (5%) + behavioral boost
      let finalWeightedScore = topMatch.similarity_score + (aiScore * 0.05);
      if (finalWeightedScore > 100) finalWeightedScore = 100;
      topMatch.similarity_score = Math.round(finalWeightedScore);
      details.ai_similarity = aiScore;
    }

    const highestScore = topMatch?.similarity_score ?? 0;

    // Formulate final explanation
    if (topMatch) {
      const typeText = topMatch.type === 'reference' ? "Teacher Reference Solution" : topMatch.type === 'historical' ? "a historical submission" : "a peer submission";
      const sourceText = topMatch.similarity_source === 'same_assignment' ? "same assignment" : topMatch.similarity_source === 'previous_assignment' ? "previous assignment" : topMatch.similarity_source === 'historical_submission' ? "historical submission" : "cross classroom";
      
      if (highestScore >= 70) {
        explanation = `High plagiarism risk detected (${highestScore}% similarity) from a ${typeText} (${sourceText}). ID: ${topMatch.id.slice(-8)}.`;
      } else if (highestScore >= 30) {
        explanation = `Moderate plagiarism risk detected (${highestScore}% similarity) from a ${typeText} (${sourceText}). ID: ${topMatch.id.slice(-8)}.`;
      }
      if (aiVerdict && aiVerdict !== "AI review skipped for clean submissions.") {
        explanation += ` AI Review: ${aiVerdict}`;
      }
    }

    // ── Update database legacy tables ────────────────────────────────────────
    await supabase
      .from("ai_evaluations")
      .update({
        peer_similarity_scores: comparisonResults,
        highest_peer_similarity: highestScore,
        peer_ai_verdict: explanation,
        style_inconsistency_detected: styleInconsistency,
        paste_suspected: isImmediateSubAfterPaste || isMassivePaste
      })
      .eq("submission_id", submission_id);

    // Calculate metadata for matches with similarity >= 30%
    const thresholdScore = 30;
    const matchedItems = comparisonResults.filter(r => r.similarity_score >= thresholdScore);
    const matchedIds = matchedItems.map(m => m.id);
    const matchedStudentIds = [...new Set(matchedItems.filter(m => m.student_id !== 'teacher').map(m => m.student_id))];
    const matchedStudentCount = matchedStudentIds.length;

    // Explainable score breakdown (for the top match)
    const scoreBreakdown = topMatch ? {
      ast_score: topMatch.ast_similarity,
      winnowing_score: topMatch.winnowing_similarity,
      token_score: topMatch.token_similarity,
      levenshtein_score: topMatch.levenshtein_distance,
      structural_score: topMatch.structural_similarity,
      ai_score: topMatch.ai_similarity,
      final_score: topMatch.similarity_score
    } : null;

    // Match source metadata
    const matchMetadata = topMatch ? {
      matched_student_id: topMatch.student_id,
      matched_submission_id: topMatch.id,
      matched_assignment_id: topMatch.assignment_id,
      similarity_source: topMatch.similarity_source
    } : null;

    const plagiarismDetails = {
      matched_submission_ids: matchedIds,
      matched_student_ids: matchedStudentIds,
      similarity_percentage: highestScore,
      matched_student_count: matchedStudentCount,
      plagiarism_explanation: explanation,
      structural_similarity: topMatch?.structural_similarity ?? 0,
      score_breakdown: scoreBreakdown,
      match_metadata: matchMetadata,
      behavioral_indicators: behavioralIndicators,
      style_inconsistency_detected: styleInconsistency
    };

    return jsonResponse({
      success: true,
      highest_peer_similarity: highestScore,
      peers_compared: comparisonResults.length,
      ai_triggered: triggerAI,
      details,
      plagiarism_details: plagiarismDetails,
    });
  } catch (e) {
    console.error("check-plagiarism error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
