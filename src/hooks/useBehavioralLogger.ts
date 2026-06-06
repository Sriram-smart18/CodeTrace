import { useRef, useCallback } from "react";

export interface BehavioralSummary {
  // Legacy fields
  paste_count: number;
  largest_paste_size: number;
  total_pasted_chars: number;
  total_pasted_lines: number;
  largest_paste_lines: number;
  first_paste_time: string | null;
  last_paste_time: string | null;
  total_typing_time: number;      // seconds
  idle_time: number;              // seconds
  typing_speed_estimate: number;  // chars per minute
  deletion_frequency: number;     // number of deletion events
  submission_duration: number;    // seconds from mount to submit

  // Scored v2.2 exact fields
  typedCharacters: number;
  pastedCharacters: number;
  pasteEvents: number;
  backspaceCount: number;
  editCount: number;
  activeCodingTime: number;
  idleTime: number;
  submitDelayAfterLastPaste: number | null;
  versionSnapshots: { timestamp: string; codeLength: number }[];
  
  // Anti-cheating & Template-Aware Telemetry v2.2
  tabSwitchCount: number;
  windowBlurCount: number;
  totalOutOfFocusTime: number; // in seconds
  largePasteEvents: number;
  largestPasteSize: number;
  snapshotCount: number;
  runCount: number;
  firstRunTime: string | null;
  lastRunTime: string | null;
  template_chars: number;
  effective_pasted_chars: number;
}

/**
 * calculateTemplateChars
 * Excludes common language boilerplate from pasted text lengths.
 */
export function calculateTemplateChars(text: string, language: string): number {
  let templateChars = 0;
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let isTemplate = false;

    if (language === 'python') {
      if (
        trimmed.startsWith('import ') || 
        trimmed.startsWith('from ') || 
        trimmed.includes('if __name__ == "__main__"') || 
        trimmed.includes('if __name__ == \'__main__\'')
      ) {
        isTemplate = true;
      }
    } else if (language === 'java') {
      if (
        trimmed.startsWith('import ') || 
        trimmed.startsWith('public class ') || 
        trimmed.startsWith('class ') || 
        trimmed.includes('Scanner') || 
        trimmed.includes('System.in') || 
        trimmed.includes('public static void main')
      ) {
        isTemplate = true;
      }
    } else if (language === 'c' || language === 'cpp') {
      if (
        trimmed.startsWith('#include') || 
        trimmed.startsWith('using namespace ') || 
        trimmed.includes('int main(') || 
        trimmed.includes('void main(') || 
        trimmed.includes('return 0;')
      ) {
        isTemplate = true;
      }
    } else if (language === 'javascript' || language === 'typescript') {
      if (
        trimmed.startsWith('import ') || 
        trimmed.startsWith('export ') || 
        trimmed.startsWith('function main') || 
        trimmed.includes('module.exports')
      ) {
        isTemplate = true;
      }
    }

    if (isTemplate) {
      templateChars += line.length + 1; // plus newline character
    }
  }

  return Math.min(text.length, templateChars);
}

export function useBehavioralLogger() {
  const mountTime = useRef<number>(Date.now());
  const prevCodeLen = useRef<number>(0);
  const prevChangeTime = useRef<number>(Date.now());

  // Accumulators
  const pasteCount = useRef<number>(0);
  const largestPasteSizeRef = useRef<number>(0);
  const totalPastedChars = useRef<number>(0);
  const totalPastedLines = useRef<number>(0);
  const largestPasteLines = useRef<number>(0);
  const firstPasteTime = useRef<string | null>(null);
  const lastPasteTime = useRef<string | null>(null);

  const totalTypingMs = useRef<number>(0);
  const totalIdleMs = useRef<number>(0);
  const deletionCount = useRef<number>(0);
  const totalCharsTyped = useRef<number>(0);
  
  // Scored v2.2 specific accumulators
  const editCountRef = useRef<number>(0);
  const tabSwitchCountRef = useRef<number>(0);
  const windowBlurCountRef = useRef<number>(0);
  const totalOutOfFocusTimeMs = useRef<number>(0);
  const lastFocusLossTime = useRef<number | null>(null);
  const largePasteEventsRef = useRef<number>(0);
  const runCountRef = useRef<number>(0);
  const firstRunTimeRef = useRef<string | null>(null);
  const lastRunTimeRef = useRef<string | null>(null);
  const totalTemplateCharsRef = useRef<number>(0);
  
  const versionSnapshots = useRef<{ timestamp: string; codeLength: number }[]>([]);
  const lastSnapshotTime = useRef<number>(0);

  const IDLE_THRESHOLD_MS = 10_000; // 10 seconds

  const logChange = useCallback((newCode: string, prevCode: string) => {
    const now = Date.now();
    const delta = newCode.length - prevCode.length;
    const gapMs = now - prevChangeTime.current;

    editCountRef.current += 1;

    // Idle vs active time accounting
    if (gapMs > IDLE_THRESHOLD_MS) {
      totalIdleMs.current += gapMs;
    } else {
      totalTypingMs.current += gapMs;
    }

    prevChangeTime.current = now;

    if (delta > 0) {
      if (delta <= 10) {
        totalCharsTyped.current += delta;
      }
    } else if (delta < 0) {
      deletionCount.current += 1;
    }

    // Capture snapshots every 15 seconds only when code changes.
    const lastSnapshot = versionSnapshots.current[versionSnapshots.current.length - 1];
    const isDifferent = !lastSnapshot || lastSnapshot.codeLength !== newCode.length;
    if (isDifferent && (versionSnapshots.current.length === 0 || now - lastSnapshotTime.current >= 15000)) {
      versionSnapshots.current.push({
        timestamp: new Date().toISOString(),
        codeLength: newCode.length
      });
      lastSnapshotTime.current = now;
    }

    prevCodeLen.current = newCode.length;
  }, []);

  const logPaste = useCallback((chars: number, lines: number, templateChars: number = 0) => {
    const nowStr = new Date().toISOString();
    
    pasteCount.current += 1;
    totalPastedChars.current += chars;
    totalPastedLines.current += lines;
    totalTemplateCharsRef.current += templateChars;
    editCountRef.current += 1;
    
    if (chars > largestPasteSizeRef.current) {
      largestPasteSizeRef.current = chars;
    }
    if (lines > largestPasteLines.current) {
      largestPasteLines.current = lines;
    }
    
    // Large paste detection (v2.1 threshold: single paste > 300 chars OR > 20 lines)
    if (chars > 300 || lines > 20) {
      largePasteEventsRef.current += 1;
    }
    
    if (!firstPasteTime.current) {
      firstPasteTime.current = nowStr;
    }
    lastPasteTime.current = nowStr;
  }, []);

  const logFocusLoss = useCallback(() => {
    if (lastFocusLossTime.current === null) {
      lastFocusLossTime.current = Date.now();
    }
  }, []);

  const logFocusGain = useCallback(() => {
    if (lastFocusLossTime.current !== null) {
      totalOutOfFocusTimeMs.current += Date.now() - lastFocusLossTime.current;
      lastFocusLossTime.current = null;
    }
  }, []);

  const logTabSwitch = useCallback(() => {
    tabSwitchCountRef.current += 1;
    logFocusLoss();
  }, [logFocusLoss]);

  const logWindowBlur = useCallback(() => {
    windowBlurCountRef.current += 1;
    logFocusLoss();
  }, [logFocusLoss]);

  const logWindowFocus = useCallback(() => {
    logFocusGain();
  }, [logFocusGain]);

  const logRun = useCallback(() => {
    const nowStr = new Date().toISOString();
    runCountRef.current += 1;
    if (!firstRunTimeRef.current) {
      firstRunTimeRef.current = nowStr;
    }
    lastRunTimeRef.current = nowStr;
  }, []);

  const getBehavioralSummary = useCallback((): BehavioralSummary => {
    const submissionDurationMs = Date.now() - mountTime.current;
    const typingTimeSec = Math.round(totalTypingMs.current / 1000);
    const idleTimeSec = Math.round(totalIdleMs.current / 1000);
    const submissionDurationSec = Math.round(submissionDurationMs / 1000);

    const typingMinutes = totalTypingMs.current / 60_000;
    const typingSpeedEstimate =
      typingMinutes > 0
        ? Math.round(totalCharsTyped.current / typingMinutes)
        : 0;

    const lastPasteTimeMs = lastPasteTime.current ? new Date(lastPasteTime.current).getTime() : 0;
    const submitDelay = lastPasteTime.current ? Math.max(0, Math.round((Date.now() - lastPasteTimeMs) / 1000)) : null;

    // Flush focus loss duration if currently unfocused
    let outOfFocusDurationSec = Math.round(totalOutOfFocusTimeMs.current / 1000);
    if (lastFocusLossTime.current !== null) {
      outOfFocusDurationSec += Math.round((Date.now() - lastFocusLossTime.current) / 1000);
    }

    // Ensure there is a final state snapshot
    if (versionSnapshots.current.length === 0 || versionSnapshots.current[versionSnapshots.current.length - 1].codeLength !== prevCodeLen.current) {
      versionSnapshots.current.push({
        timestamp: new Date().toISOString(),
        codeLength: prevCodeLen.current
      });
    }

    const effectivePastedChars = Math.max(0, totalPastedChars.current - totalTemplateCharsRef.current);

    return {
      // Legacy fields
      paste_count: pasteCount.current,
      largest_paste_size: largestPasteSizeRef.current,
      total_pasted_chars: totalPastedChars.current,
      total_pasted_lines: totalPastedLines.current,
      largest_paste_lines: largestPasteLines.current,
      first_paste_time: firstPasteTime.current,
      last_paste_time: lastPasteTime.current,
      total_typing_time: typingTimeSec,
      idle_time: idleTimeSec,
      typing_speed_estimate: typingSpeedEstimate,
      deletion_frequency: deletionCount.current,
      submission_duration: submissionDurationSec,

      // Scored v2.2 exact fields
      typedCharacters: totalCharsTyped.current,
      pastedCharacters: totalPastedChars.current,
      pasteEvents: pasteCount.current,
      backspaceCount: deletionCount.current,
      editCount: editCountRef.current,
      activeCodingTime: typingTimeSec,
      idleTime: idleTimeSec,
      submitDelayAfterLastPaste: submitDelay,
      versionSnapshots: versionSnapshots.current,

      // Anti-cheating & Template-Aware Telemetry v2.2
      tabSwitchCount: tabSwitchCountRef.current,
      windowBlurCount: windowBlurCountRef.current,
      totalOutOfFocusTime: outOfFocusDurationSec,
      largePasteEvents: largePasteEventsRef.current,
      largestPasteSize: largestPasteSizeRef.current,
      snapshotCount: versionSnapshots.current.length,
      runCount: runCountRef.current,
      firstRunTime: firstRunTimeRef.current,
      lastRunTime: lastRunTimeRef.current,
      template_chars: totalTemplateCharsRef.current,
      effective_pasted_chars: effectivePastedChars
    };
  }, []);

  const resetLogger = useCallback(() => {
    mountTime.current = Date.now();
    prevChangeTime.current = Date.now();
    prevCodeLen.current = 0;
    
    pasteCount.current = 0;
    largestPasteSizeRef.current = 0;
    totalPastedChars.current = 0;
    totalPastedLines.current = 0;
    largestPasteLines.current = 0;
    firstPasteTime.current = null;
    lastPasteTime.current = null;
    
    totalTypingMs.current = 0;
    totalIdleMs.current = 0;
    deletionCount.current = 0;
    totalCharsTyped.current = 0;
    
    editCountRef.current = 0;
    tabSwitchCountRef.current = 0;
    windowBlurCountRef.current = 0;
    totalOutOfFocusTimeMs.current = 0;
    lastFocusLossTime.current = null;
    largePasteEventsRef.current = 0;
    runCountRef.current = 0;
    firstRunTimeRef.current = null;
    lastRunTimeRef.current = null;
    totalTemplateCharsRef.current = 0;
    
    versionSnapshots.current = [];
    lastSnapshotTime.current = 0;
  }, []);

  return { 
    logChange, 
    logPaste, 
    logTabSwitch, 
    logWindowBlur, 
    logWindowFocus, 
    logRun, 
    getBehavioralSummary, 
    resetLogger 
  };
}
