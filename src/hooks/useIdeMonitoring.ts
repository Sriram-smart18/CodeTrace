import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface IdeMonitoringOptions {
  studentId: string | undefined;
  classroomId: string | null | undefined;
  assignmentId: string | undefined;
  language: string;
}

export function useIdeMonitoring({
  studentId,
  classroomId,
  assignmentId,
  language,
}: IdeMonitoringOptions) {
  const editorFocusRef = useRef<boolean>(true);
  const tabSwitchCountRef = useRef<number>(0);
  const copyPasteCountRef = useRef<number>(0);
  const typingSpikesRef = useRef<number>(0);
  const currentFileRef = useRef<string | null>(null);

  const lastTypingCount = useRef<number>(0);
  const typingCheckInterval = useRef<any>(null);
  const syncInterval = useRef<any>(null);

  // Store telemetry options in a ref to avoid tearing down and re-registering visibility and keyboard listeners
  const optionsRef = useRef({ studentId, classroomId, assignmentId, language });
  
  useEffect(() => {
    optionsRef.current = { studentId, classroomId, assignmentId, language };
  }, [studentId, classroomId, assignmentId, language]);

  // Sync state to Supabase monitoring_sessions
  const syncTelemetry = useCallback(async () => {
    const { studentId: sId, classroomId: cId, assignmentId: aId, language: lang } = optionsRef.current;
    if (!sId || !aId) return;

    // Detect idle vs abnormal based on stats
    let status: "active" | "idle" | "abnormal" = "active";
    if (!editorFocusRef.current) {
      status = "idle";
    }
    if (copyPasteCountRef.current > 6 || tabSwitchCountRef.current > 12) {
      status = "abnormal";
    }

    try {
      await supabase.from("monitoring_sessions").upsert(
        {
          user_id: sId,
          classroom_id: cId || null,
          assignment_id: aId,
          status,
          current_file: currentFileRef.current,
          language: lang || null,
          editor_focus: editorFocusRef.current,
          tab_switch_count: tabSwitchCountRef.current,
          copy_paste_count: copyPasteCountRef.current,
          abnormal_typing_spikes: typingSpikesRef.current,
          last_heartbeat: new Date().toISOString(),
        },
        { onConflict: "user_id,assignment_id" }
      );
    } catch (err) {
      // Silently swallow session telemetry database failures
    }
  }, []);

  // Track page tab switching using Page Visibility API
  const handleVisibilityChange = useCallback(() => {
    if (document.hidden) {
      editorFocusRef.current = false;
      tabSwitchCountRef.current += 1;
    } else {
      editorFocusRef.current = true;
    }
    syncTelemetry();
  }, [syncTelemetry]);

  // Track Copy / Pastes
  const handleCopyPaste = useCallback(() => {
    copyPasteCountRef.current += 1;
    syncTelemetry();
  }, [syncTelemetry]);

  // Focus and Blur triggers
  const trackFocus = useCallback(() => {
    editorFocusRef.current = true;
    syncTelemetry();
  }, [syncTelemetry]);

  const trackBlur = useCallback(() => {
    editorFocusRef.current = false;
    syncTelemetry();
  }, [syncTelemetry]);

  const trackFileChange = useCallback((fileName: string) => {
    currentFileRef.current = fileName;
  }, []);

  const registerKeystroke = useCallback(() => {
    lastTypingCount.current += 1;
  }, []);

  useEffect(() => {
    const { studentId: sId, assignmentId: aId } = optionsRef.current;
    if (!sId || !aId) return;

    // Connect visibility API and DOM listeners
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", trackFocus);
    window.addEventListener("blur", trackBlur);
    document.addEventListener("copy", handleCopyPaste);
    document.addEventListener("paste", handleCopyPaste);
    document.addEventListener("keydown", registerKeystroke);

    // Typing spike monitoring: if typing characters > 240 per minute (4 chars per sec), flag spike
    typingCheckInterval.current = setInterval(() => {
      const typingSpeed = lastTypingCount.current * 12; // project to per-minute
      if (typingSpeed > 240) {
        typingSpikesRef.current += 1;
      }
      lastTypingCount.current = 0;
    }, 5000);

    // Telemetry Sync Interval (every 30 seconds)
    syncInterval.current = setInterval(() => {
      syncTelemetry();
    }, 30000);

    // Initial heartbeat
    syncTelemetry();

    // Memory cleanup: safely dispose of all listeners & timers
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", trackFocus);
      window.removeEventListener("blur", trackBlur);
      document.removeEventListener("copy", handleCopyPaste);
      document.removeEventListener("paste", handleCopyPaste);
      document.removeEventListener("keydown", registerKeystroke);
      
      if (typingCheckInterval.current) clearInterval(typingCheckInterval.current);
      if (syncInterval.current) clearInterval(syncInterval.current);
    };
  }, [handleVisibilityChange, syncTelemetry, trackFocus, trackBlur, handleCopyPaste, registerKeystroke]);

  return {
    trackFocus,
    trackBlur,
    handleCopyPaste,
    trackFileChange,
    registerKeystroke,
  };
}
