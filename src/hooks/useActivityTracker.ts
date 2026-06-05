import { useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Socket } from "socket.io-client";

interface ActivityTrackerOptions {
  studentId: string | undefined;
  assignmentId: string | undefined;
  language: string;
  socketRef?: React.MutableRefObject<Socket | null>;
}

export function useActivityTracker({ studentId, assignmentId, language, socketRef }: ActivityTrackerOptions) {
  const sendEvent = useCallback(
    async (eventType: string, codeSnapshot?: string, metadata?: unknown) => {
      if (!studentId || !assignmentId) return;

      const payload = {
        eventType,
        studentId,
        assignmentId,
        codeSnapshot: codeSnapshot?.slice(0, 2000) || null,
        language,
        timestamp: new Date().toISOString(),
        pasteStats: metadata || null,
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
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error("[DB ERROR] Exception while storing event:", errorMessage);
      }
    },
    [studentId, assignmentId, language, socketRef]
  );

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  const trackTyping = useCallback(
    (code: string) => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        sendEvent("typing", code);
      }, 500); // 500ms debounce
    },
    [sendEvent]
  );

  const trackRun = useCallback(
    (code: string, metadata?: unknown) => sendEvent("run", code, metadata),
    [sendEvent]
  );

  const trackSubmit = useCallback(
    (code: string, metadata?: unknown) => sendEvent("submit", code, metadata),
    [sendEvent]
  );

  const trackSave = useCallback(
    (code: string) => sendEvent("save", code),
    [sendEvent]
  );

  const trackPaste = useCallback(
    (code: string, eventType: string = "paste", metadata?: unknown) => sendEvent(eventType, code, metadata),
    [sendEvent]
  );

  const trackFocus = useCallback(() => sendEvent("focus"), [sendEvent]);
  const trackBlur = useCallback(() => sendEvent("blur"), [sendEvent]);

  return { trackTyping, trackRun, trackSubmit, trackSave, trackPaste, trackFocus, trackBlur };
}
