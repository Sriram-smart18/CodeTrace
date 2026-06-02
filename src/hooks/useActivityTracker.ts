import { useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ActivityTrackerOptions {
  studentId: string | undefined;
  assignmentId: string | undefined;
  language: string;
  socketRef?: React.MutableRefObject<any>;
}

export function useActivityTracker({ studentId, assignmentId, language, socketRef }: ActivityTrackerOptions) {
  const lastTypingRef = useRef<number>(0);
  const TYPING_THROTTLE_MS = 3000; // send at most one typing event per 3s

  const sendEvent = useCallback(
    async (eventType: string, codeSnapshot?: string) => {
      if (!studentId || !assignmentId) return;

      const payload = {
        eventType,
        studentId,
        assignmentId,
        codeSnapshot: codeSnapshot?.slice(0, 2000) || null,
        language,
        timestamp: new Date().toISOString(),
      };

      // 1. Emit via Socket.IO (Socket.IO OR Supabase Realtime - we emit to both for maximum robustness)
      if (socketRef && socketRef.current && socketRef.current.connected) {
        console.log(`[STUDENT_EVENT_SENT] Sent activity event: ${eventType}`);
        socketRef.current.emit("student_activity", payload);
      } else {
        console.warn(`[SOCKET] Socket not connected for activity event: ${eventType}`);
      }

      // 2. Write to Supabase DB (except 'save' which violates DB check constraint - map to 'typing')
      const dbEventType = eventType === "save" ? "typing" : eventType;

      try {
        const { error } = await supabase.from("activity_events").insert({
          student_id: studentId,
          assignment_id: assignmentId,
          event_type: dbEventType,
          code_snapshot: codeSnapshot?.slice(0, 2000) || null,
          language,
        });

        if (!error) {
          console.log(`[DB_EVENT_STORED] Event stored in database: ${eventType}`);
        } else {
          console.error("[DB ERROR] Failed to store event:", error.message);
        }
      } catch (err: any) {
        console.error("[DB ERROR] Exception while storing event:", err.message);
      }
    },
    [studentId, assignmentId, language, socketRef]
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

  const trackSave = useCallback(
    (code: string) => sendEvent("save", code),
    [sendEvent]
  );

  const trackPaste = useCallback(
    (code: string) => sendEvent("paste", code),
    [sendEvent]
  );

  const trackFocus = useCallback(() => sendEvent("focus"), [sendEvent]);
  const trackBlur = useCallback(() => sendEvent("blur"), [sendEvent]);

  return { trackTyping, trackRun, trackSubmit, trackSave, trackPaste, trackFocus, trackBlur };
}
