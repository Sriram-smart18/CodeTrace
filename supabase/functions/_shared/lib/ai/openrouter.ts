/**
 * OpenRouter AI provider — OpenAI compatible chat completions.
 */

export const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
export const FRONTEND_AI_ERROR = "AI evaluation temporarily unavailable.";

export const MODEL_FALLBACK_CHAIN = [
  "openai/gpt-oss-20b:free",
  "qwen/qwen3-32b:free",
  "deepseek/deepseek-r1:free"
];

export const JSON_EVALUATOR_SYSTEM_PROMPT = `You are an AI code evaluator.
Return ONLY valid JSON.
Do not include markdown.`;

const MAX_RETRIES_PER_MODEL = 2;
const REQUEST_TIMEOUT_MS = 30_000; // 30-second timeout

export type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type OpenRouterChatRequest = {
  messages: OpenRouterMessage[];
  temperature?: number;
};

export function getOpenRouterApiKey(): string | null {
  const key = Deno.env.get("OPENROUTER_API_KEY");
  return key && key.trim().length > 0 ? key.trim() : null;
}

export function isOpenRouterConfigured(): boolean {
  return getOpenRouterApiKey() !== null;
}

export function aiNotConfiguredMessage(): string {
  return FRONTEND_AI_ERROR;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(status: number): boolean {
  // Retry on rate limit (429) or transient server errors (502, 503, 504)
  return status === 429 || status === 502 || status === 503 || status === 504 || status >= 500;
}

/**
 * POST https://openrouter.ai/api/v1/chat/completions
 * Implements model fallback chain, retry logic, and timeouts.
 */
export async function callOpenRouterChatCompletion(
  request: OpenRouterChatRequest
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string; status?: number }> {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    console.error("[openrouter] OPENROUTER_API_KEY not set");
    return { ok: false, error: FRONTEND_AI_ERROR };
  }

  // Determine the sequence of models to try
  const configuredModel = Deno.env.get("OPENROUTER_MODEL");
  const modelsToTry = configuredModel && configuredModel.trim().length > 0
    ? [configuredModel.trim(), ...MODEL_FALLBACK_CHAIN.filter(m => m !== configuredModel.trim())]
    : MODEL_FALLBACK_CHAIN;

  let lastError = FRONTEND_AI_ERROR;
  let lastStatus = 500;

  for (const model of modelsToTry) {
    console.log(`[openrouter] Attempting chat completion using model: ${model}`);

    for (let attempt = 0; attempt <= MAX_RETRIES_PER_MODEL; attempt++) {
      if (attempt > 0) {
        const backoffMs = 1000 * Math.pow(2, attempt - 1);
        console.log(`[openrouter] retry ${attempt}/${MAX_RETRIES_PER_MODEL} for model ${model} in ${backoffMs}ms`);
        await sleep(backoffMs);
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        const payload = {
          model,
          temperature: request.temperature ?? 0.2,
          messages: request.messages,
        };

        const response = await fetch(OPENROUTER_CHAT_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://codetrace.io",
            "X-Title": "CodeTrace",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const responseText = await response.text();

        if (!response.ok) {
          console.error(`[openrouter] Error response from model ${model} (status ${response.status}):`, responseText);
          lastStatus = response.status;
          lastError = `API returned error status: ${response.status}`;
          
          if (shouldRetry(response.status) && attempt < MAX_RETRIES_PER_MODEL) {
            continue;
          }
          // Break attempt loop to move to the next model
          break;
        }

        try {
          const data = JSON.parse(responseText) as Record<string, unknown>;
          // Ensure choices structure is present and valid
          if (data && Array.isArray(data.choices) && data.choices.length > 0) {
            console.log(`[openrouter] Success with model: ${model}`);
            return { ok: true, data };
          } else {
            console.error(`[openrouter] Response from ${model} lacks valid choices structure:`, responseText);
            lastError = "Response envelope lacks choices";
            break; // Try next model
          }
        } catch (parseErr) {
          console.error(`[openrouter] Malformed JSON response envelope from model ${model}:`, parseErr);
          lastError = "Malformed response JSON";
          break; // Try next model
        }
      } catch (err) {
        const isTimeout = err instanceof Error && err.name === "AbortError";
        console.error(`[openrouter] Request to model ${model} failed:`, isTimeout ? "timeout (30s)" : err);
        lastError = isTimeout ? "Request timeout" : "Network error";
        
        if (attempt < MAX_RETRIES_PER_MODEL) {
          continue;
        }
        break; // Try next model
      }
    }
  }

  return { ok: false, error: lastError, status: lastStatus };
}

/** Extract choices[0].message.content from response. */
export function extractOpenRouterMessageContent(data: Record<string, unknown>): string | null {
  const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
  const content = choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : null;
}

/** Remove markdown code fences around JSON. */
export function stripMarkdownJson(content: string): string {
  let s = content.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/m, "").trim();
  }
  return s;
}

/**
 * Parse JSON from choices[0].message.content with logging and fallback.
 */
export function parseOpenRouterJsonContent<T>(
  data: Record<string, unknown>,
  fallback: T,
  logPrefix = "[openrouter]"
): T {
  console.log(`${logPrefix} raw OpenRouter response:`, JSON.stringify(data).slice(0, 3000));

  const content = extractOpenRouterMessageContent(data);
  if (!content) {
    console.error(`${logPrefix} no message.content in choices[0]`);
    return fallback;
  }

  console.log(`${logPrefix} message content:`, content.slice(0, 2000));

  try {
    const parsed = JSON.parse(stripMarkdownJson(content)) as T;
    console.log(`${logPrefix} JSON parse success`);
    return parsed;
  } catch (e) {
    console.error(`${logPrefix} JSON parse error:`, e);
    return fallback;
  }
}
