import { useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ActivityTrackerOptions {
  studentId: string | undefined;
  assignmentId: string | undefined;
  language: string;
}

export function useActivityTracker({ studentId, assignmentId, language }: ActivityTrackerOptions) {
  const lastTypingRef = useRef<number>(0);
  const TYPING_THROTTLE_MS = 3000; // send at most one typing event per 3s

  const sendEvent = useCallback(
    async (eventType: string, codeSnapshot?: string) => {
      if (!studentId) return;
      try {
        await supabase.from("activity_events").insert({
          student_id: studentId,
          assignment_id: assignmentId || null,
          event_type: eventType,
          code_snapshot: codeSnapshot?.slice(0, 2000) || null,
          language,
        });
      } catch {
        // silently fail – don't disrupt student workflow
      }
    },
    [studentId, assignmentId, language]
  );

  const trackTyping = useCallback(
    (code: string) => {
      const now = Date.now();
      if (now - lastTypingRef.current < TYPING_THROTTLE_MS) return;
      lastTypingRef.current = now;
      sendEvent("typing", code);
    },
    [sendEvent]
  );

  const trackRun = useCallback(
    (code: string) => sendEvent("run", code),
    [sendEvent]
  );

  const trackSubmit = useCallback(
    (code: string) => sendEvent("submit", code),
    [sendEvent]
  );

  const trackPaste = useCallback(
    (code: string) => sendEvent("paste", code),
    [sendEvent]
  );

  const trackFocus = useCallback(() => sendEvent("focus"), [sendEvent]);
  const trackBlur = useCallback(() => sendEvent("blur"), [sendEvent]);

  return { trackTyping, trackRun, trackSubmit, trackPaste, trackFocus, trackBlur };
}
