import { useRef, useCallback } from "react";

export interface BehavioralSummary {
  paste_count: number;
  largest_paste_size: number;
  total_typing_time: number;      // seconds
  idle_time: number;              // seconds
  typing_speed_estimate: number;  // chars per minute
  deletion_frequency: number;     // number of deletion events
  submission_duration: number;    // seconds from mount to submit
}

/**
 * useBehavioralLogger
 *
 * Lightweight in-memory behavioral tracker for the code editor.
 * Tracks summary metrics only — no raw keystroke buffers, no PII.
 * Zero DB writes during typing; snapshots at submit time via getBehavioralSummary().
 *
 * Separation of concerns:
 *   - useActivityTracker  → live DB events for teacher monitoring feed (existing)
 *   - useBehavioralLogger → in-memory integrity summary sent at evaluation time (this hook)
 */
export function useBehavioralLogger() {
  const mountTime = useRef<number>(Date.now());
  const prevCodeLen = useRef<number>(0);
  const prevChangeTime = useRef<number>(Date.now());

  // Accumulators
  const pasteCount = useRef<number>(0);
  const largestPasteSize = useRef<number>(0);
  const totalTypingMs = useRef<number>(0);
  const totalIdleMs = useRef<number>(0);
  const deletionCount = useRef<number>(0);
  const totalCharsTyped = useRef<number>(0);

  // Idle detection: if gap between edits > IDLE_THRESHOLD, count as idle
  const IDLE_THRESHOLD_MS = 10_000; // 10 seconds
  // Paste detection: if single delta > PASTE_THRESHOLD chars, treat as paste
  const PASTE_THRESHOLD = 50;

  const logChange = useCallback((newCode: string, prevCode: string) => {
    const now = Date.now();
    const delta = newCode.length - prevCode.length;
    const gapMs = now - prevChangeTime.current;

    // Idle vs active time accounting
    if (gapMs > IDLE_THRESHOLD_MS) {
      totalIdleMs.current += gapMs;
    } else {
      totalTypingMs.current += gapMs;
    }

    prevChangeTime.current = now;

    if (delta > 0) {
      // Insertion
      if (delta > PASTE_THRESHOLD) {
        pasteCount.current += 1;
        if (delta > largestPasteSize.current) {
          largestPasteSize.current = delta;
        }
      } else {
        totalCharsTyped.current += delta;
      }
    } else if (delta < 0) {
      // Deletion
      deletionCount.current += 1;
    }

    prevCodeLen.current = newCode.length;
  }, []);

  const getBehavioralSummary = useCallback((): BehavioralSummary => {
    const submissionDurationMs = Date.now() - mountTime.current;
    const typingTimeSec = Math.round(totalTypingMs.current / 1000);
    const idleTimeSec = Math.round(totalIdleMs.current / 1000);
    const submissionDurationSec = Math.round(submissionDurationMs / 1000);

    // chars typed ÷ active typing minutes
    const typingMinutes = totalTypingMs.current / 60_000;
    const typingSpeedEstimate =
      typingMinutes > 0
        ? Math.round(totalCharsTyped.current / typingMinutes)
        : 0;

    return {
      paste_count: pasteCount.current,
      largest_paste_size: largestPasteSize.current,
      total_typing_time: typingTimeSec,
      idle_time: idleTimeSec,
      typing_speed_estimate: typingSpeedEstimate,
      deletion_frequency: deletionCount.current,
      submission_duration: submissionDurationSec,
    };
  }, []);

  /** Call when the assignment loads / editor mounts to reset the clock */
  const resetLogger = useCallback(() => {
    mountTime.current = Date.now();
    prevChangeTime.current = Date.now();
    prevCodeLen.current = 0;
    pasteCount.current = 0;
    largestPasteSize.current = 0;
    totalTypingMs.current = 0;
    totalIdleMs.current = 0;
    deletionCount.current = 0;
    totalCharsTyped.current = 0;
  }, []);

  return { logChange, getBehavioralSummary, resetLogger };
}
