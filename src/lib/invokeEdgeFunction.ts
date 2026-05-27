import { supabase } from "@/integrations/supabase/client";

const isDev = import.meta.env.DEV;

export type EdgeInvokeResult<T> = {
  data: T | null;
  error: Error | null;
};

type InvokeError = {
  message: string;
  context?: Response;
};

async function parseInvokeError(error: InvokeError): Promise<string> {
  let message = error.message;

  if (error.context) {
    const status = error.context.status;
    try {
      const payload = await error.context.json();
      if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
        message = payload.error;
      }
    } catch {
      // ignore JSON parse failure
    }

    if (status === 404) {
      message = message.includes("not deployed")
        ? message
        : "Edge function not found. Deploy functions to your Supabase project.";
    }
  }

  if (message.includes("Failed to send a request to the Edge Function")) {
    message =
      "Cannot reach the Edge Function. Ensure it is deployed to your active Supabase project and restart the dev server.";
  }

  return message;
}

/**
 * Invoke a Supabase Edge Function with session auth and readable errors.
 */
export async function invokeEdgeFunction<T = Record<string, unknown>>(
  functionName: string,
  body: Record<string, unknown>
): Promise<EdgeInvokeResult<T>> {
  if (isDev) {
    console.log(`[edge] invoke start: ${functionName}`, body);
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    const err = new Error("Not signed in. Please log in again.");
    if (isDev) console.error("[edge] no session", err);
    return { data: null, error: err };
  }

  const { data, error } = await supabase.functions.invoke(functionName, { body });

  if (isDev) {
    console.log(`[edge] invoke response: ${functionName}`, { data, error });
  }

  if (error) {
    const message = await parseInvokeError(error as InvokeError);
    const wrapped = new Error(message);
    if (isDev) console.error(`[edge] invoke error: ${functionName}`, wrapped);
    return { data: null, error: wrapped };
  }

  const record = data as Record<string, unknown> | null;
  if (record?.error && typeof record.error === "string") {
    const err = new Error(record.error);
    if (isDev) console.error(`[edge] function returned error: ${functionName}`, err);
    return { data: null, error: err };
  }

  return { data: data as T, error: null };
}
