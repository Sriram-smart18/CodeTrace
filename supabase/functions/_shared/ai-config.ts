/**
 * Groq AI provider — plain chat completions + JSON message parsing (no tool calls).
 */

export const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
export const GROQ_MODEL = "llama-3.1-8b-instant";
export const FRONTEND_AI_ERROR = "AI evaluation temporarily unavailable.";

export const JSON_EVALUATOR_SYSTEM_PROMPT = `You are an AI code evaluator.
Return ONLY valid JSON.
Do not include markdown.`;

const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 60_000;

export type GroqMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type GroqChatRequest = {
  messages: GroqMessage[];
  temperature?: number;
};

export function getGroqApiKey(): string | null {
  const key = Deno.env.get("GROQ_API_KEY");
  return key && key.trim().length > 0 ? key.trim() : null;
}

export function isGroqConfigured(): boolean {
  return getGroqApiKey() !== null;
}

export function aiNotConfiguredMessage(): string {
  return FRONTEND_AI_ERROR;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * POST https://api.groq.com/openai/v1/chat/completions (messages only, no tools).
 */
export async function callGroqChatCompletion(
  request: GroqChatRequest
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string; status?: number }> {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    console.error("[groq] GROQ_API_KEY not set");
    return { ok: false, error: FRONTEND_AI_ERROR };
  }

  const payload = {
    model: Deno.env.get("GROQ_MODEL") || GROQ_MODEL,
    temperature: request.temperature ?? 0.2,
    response_format: { type: "json_object" },
    messages: request.messages,
  };

  let lastError = FRONTEND_AI_ERROR;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoffMs = 500 * Math.pow(2, attempt - 1);
      console.log(`[groq] retry ${attempt + 1}/${MAX_RETRIES} in ${backoffMs}ms`);
      await sleep(backoffMs);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(GROQ_CHAT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const responseText = await response.text();

      if (!response.ok) {
        console.error("[groq]", response.status, responseText);
        lastError = FRONTEND_AI_ERROR;
        if (shouldRetry(response.status) && attempt < MAX_RETRIES - 1) continue;
        return { ok: false, error: lastError, status: response.status };
      }

      try {
        const data = JSON.parse(responseText) as Record<string, unknown>;
        return { ok: true, data };
      } catch (parseErr) {
        console.error("[groq] malformed API response envelope:", parseErr);
        lastError = FRONTEND_AI_ERROR;
        if (attempt < MAX_RETRIES - 1) continue;
        return { ok: false, error: lastError };
      }
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "AbortError";
      console.error("[groq] request failed:", isTimeout ? "timeout" : err);
      lastError = FRONTEND_AI_ERROR;
      if (attempt < MAX_RETRIES - 1) continue;
      return { ok: false, error: lastError };
    }
  }

  return { ok: false, error: lastError };
}

/** Extract choices[0].message.content from a Groq chat completion response. */
export function extractGroqMessageContent(data: Record<string, unknown>): string | null {
  const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
  const content = choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : null;
}

/** Remove optional markdown code fences around JSON. */
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
export function parseGroqJsonContent<T>(
  data: Record<string, unknown>,
  fallback: T,
  logPrefix = "[groq]"
): T {
  console.log(`${logPrefix} raw Groq response:`, JSON.stringify(data).slice(0, 3000));

  const content = extractGroqMessageContent(data);
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
