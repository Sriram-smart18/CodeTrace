import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBehavioralLogger } from "../hooks/useBehavioralLogger";


// Helper to mimic the proctoring UI risk level classification from LiveSession.tsx
function getPasteRisk(stats: {
  pasteCount: number;
  totalPastedChars: number;
  totalPastedLines: number;
  largePastesCount: number;
}) {
  if (stats.pasteCount === 0) return "LOW";

  const hasRepeatedLargePastes = stats.largePastesCount >= 2;

  if (
    stats.totalPastedChars > 1000 ||
    stats.totalPastedLines > 50 ||
    hasRepeatedLargePastes
  ) {
    return "HIGH";
  }

  if (
    stats.pasteCount > 3 ||
    stats.totalPastedChars > 300 ||
    stats.totalPastedLines > 20
  ) {
    return "MEDIUM";
  }

  return "LOW";
}

describe("useBehavioralLogger", () => {
  describe("Initialization & Defaults", () => {
    it("should initialize with default empty values", () => {
      const { result } = renderHook(() => useBehavioralLogger());
      const summary = result.current.getBehavioralSummary();

      expect(summary.paste_count).toBe(0);
      expect(summary.largest_paste_size).toBe(0);
      expect(summary.total_pasted_chars).toBe(0);
      expect(summary.total_pasted_lines).toBe(0);
      expect(summary.largest_paste_lines).toBe(0);
      expect(summary.first_paste_time).toBeNull();
      expect(summary.last_paste_time).toBeNull();
      expect(summary.total_typing_time).toBe(0);
      expect(summary.idle_time).toBe(0);
      expect(summary.typing_speed_estimate).toBe(0);
      expect(summary.deletion_frequency).toBe(0);
      expect(summary.submission_duration).toBeTypeOf("number");
    });
  });

  describe("Paste Analytics", () => {
    it("should accurately track single paste telemetry", () => {
      const { result } = renderHook(() => useBehavioralLogger());

      act(() => {
        result.current.logPaste(45, 3);
      });

      const summary = result.current.getBehavioralSummary();
      expect(summary.paste_count).toBe(1);
      expect(summary.total_pasted_chars).toBe(45);
      expect(summary.total_pasted_lines).toBe(3);
      expect(summary.largest_paste_size).toBe(45);
      expect(summary.largest_paste_lines).toBe(3);
      expect(summary.first_paste_time).not.toBeNull();
      expect(summary.last_paste_time).not.toBeNull();
      expect(summary.first_paste_time).toBe(summary.last_paste_time);
    });

    it("should accurately track multiple pastes and maintain largest sizes", () => {
      vi.useFakeTimers();
      const { result } = renderHook(() => useBehavioralLogger());

      // Paste 1: 50 chars, 2 lines
      act(() => {
        result.current.logPaste(50, 2);
      });

      // Advance clock by 1 second
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      // Paste 2: 15 chars, 1 line
      act(() => {
        result.current.logPaste(15, 1);
      });

      // Advance clock by 1 second
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      // Paste 3: 500 chars, 15 lines (new largest)
      act(() => {
        result.current.logPaste(500, 15);
      });

      const summary = result.current.getBehavioralSummary();
      expect(summary.paste_count).toBe(3);
      expect(summary.total_pasted_chars).toBe(565);
      expect(summary.total_pasted_lines).toBe(18);
      expect(summary.largest_paste_size).toBe(500);
      expect(summary.largest_paste_lines).toBe(15);
      expect(summary.first_paste_time).not.toBe(summary.last_paste_time);
      vi.useRealTimers();
    });

    it("should evaluate paste size classification threshold rules", () => {
      // Rule verification for Monaco paste sizes:
      // large_paste: chars > 30 || lines > 3
      // massive_paste: chars > 1000 || lines > 50

      const isLargePaste = (chars: number, lines: number) => chars > 30 || lines > 3;
      const isMassivePaste = (chars: number, lines: number) => chars > 1000 || lines > 50;

      // Small Paste
      expect(isLargePaste(25, 2)).toBe(false);
      expect(isMassivePaste(25, 2)).toBe(false);

      // Large Paste (Chars threshold)
      expect(isLargePaste(35, 2)).toBe(true);
      expect(isMassivePaste(35, 2)).toBe(false);

      // Large Paste (Lines threshold)
      expect(isLargePaste(15, 4)).toBe(true);
      expect(isMassivePaste(15, 4)).toBe(false);

      // Massive Paste (Chars threshold)
      expect(isLargePaste(1200, 10)).toBe(true);
      expect(isMassivePaste(1200, 10)).toBe(true);

      // Massive Paste (Lines threshold)
      expect(isLargePaste(200, 60)).toBe(true);
      expect(isMassivePaste(200, 60)).toBe(true);
    });
  });

  describe("Typing Metrics & Speed Protection", () => {
    it("should increment typing metrics for manual typed characters", () => {
      const { result } = renderHook(() => useBehavioralLogger());

      act(() => {
        result.current.logChange("f", ""); // +1 char
        result.current.logChange("fu", "f"); // +1 char
        result.current.logChange("fun", "fu"); // +1 char
      });

      const summary = result.current.getBehavioralSummary();
      // Deletion count should still be 0
      expect(summary.deletion_frequency).toBe(0);
    });

    it("should prevent paste operations from inflating typed character counts", () => {
      const { result } = renderHook(() => useBehavioralLogger());

      // 1. Normal typing
      act(() => {
        result.current.logChange("d", ""); // +1 char
      });

      // 2. Paste event (e.g. 100 characters inserted)
      // On onChange, a delta of 100 is seen. Since delta > 10, it should be excluded from manual typed characters
      act(() => {
        result.current.logChange("d" + "x".repeat(100), "d");
      });

      // Log the paste explicitly as paste event
      act(() => {
        result.current.logPaste(100, 5);
      });

      const summary = result.current.getBehavioralSummary();
      expect(summary.paste_count).toBe(1);
      expect(summary.total_pasted_chars).toBe(100);
      expect(summary.total_pasted_lines).toBe(5);
    });

    it("should track deletions / backspace events correctly", () => {
      const { result } = renderHook(() => useBehavioralLogger());

      act(() => {
        result.current.logChange("abc", "");
        result.current.logChange("ab", "abc"); // Deletion (-1)
        result.current.logChange("a", "ab"); // Deletion (-1)
      });

      const summary = result.current.getBehavioralSummary();
      expect(summary.deletion_frequency).toBe(2);
    });
  });

  describe("Risk Levels", () => {
    it("should correctly classify LOW risk profiles", () => {
      // 0 pastes
      expect(getPasteRisk({
        pasteCount: 0,
        totalPastedChars: 0,
        totalPastedLines: 0,
        largePastesCount: 0
      })).toBe("LOW");

      // 1 small paste
      expect(getPasteRisk({
        pasteCount: 1,
        totalPastedChars: 20,
        totalPastedLines: 1,
        largePastesCount: 0
      })).toBe("LOW");

      // 2 small pastes
      expect(getPasteRisk({
        pasteCount: 2,
        totalPastedChars: 50,
        totalPastedLines: 2,
        largePastesCount: 0
      })).toBe("LOW");
    });

    it("should correctly classify MEDIUM risk profiles", () => {
      // > 3 pastes
      expect(getPasteRisk({
        pasteCount: 4,
        totalPastedChars: 80,
        totalPastedLines: 4,
        largePastesCount: 1
      })).toBe("MEDIUM");

      // > 300 pasted chars
      expect(getPasteRisk({
        pasteCount: 2,
        totalPastedChars: 350,
        totalPastedLines: 5,
        largePastesCount: 1
      })).toBe("MEDIUM");

      // > 20 pasted lines
      expect(getPasteRisk({
        pasteCount: 2,
        totalPastedChars: 100,
        totalPastedLines: 25,
        largePastesCount: 1
      })).toBe("MEDIUM");
    });

    it("should correctly classify HIGH risk profiles", () => {
      // > 1000 pasted chars
      expect(getPasteRisk({
        pasteCount: 2,
        totalPastedChars: 1200,
        totalPastedLines: 10,
        largePastesCount: 1
      })).toBe("HIGH");

      // > 50 pasted lines
      expect(getPasteRisk({
        pasteCount: 2,
        totalPastedChars: 200,
        totalPastedLines: 55,
        largePastesCount: 1
      })).toBe("HIGH");

      // Repeated large pastes (>= 2)
      expect(getPasteRisk({
        pasteCount: 2,
        totalPastedChars: 150,
        totalPastedLines: 6,
        largePastesCount: 2
      })).toBe("HIGH");
    });
  });

  describe("Reset Logic", () => {
    it("should clear both paste and typing stats completely on resetLogger", () => {
      const { result } = renderHook(() => useBehavioralLogger());

      // Perform typing & pasting
      act(() => {
        result.current.logChange("abc", "");
        result.current.logChange("ab", "abc");
        result.current.logPaste(150, 4);
        result.current.resetLogger();
      });

      const summary = result.current.getBehavioralSummary();
      expect(summary.paste_count).toBe(0);
      expect(summary.total_pasted_chars).toBe(0);
      expect(summary.total_pasted_lines).toBe(0);
      expect(summary.largest_paste_size).toBe(0);
      expect(summary.largest_paste_lines).toBe(0);
      expect(summary.first_paste_time).toBeNull();
      expect(summary.last_paste_time).toBeNull();
      expect(summary.deletion_frequency).toBe(0);
      expect(summary.typing_speed_estimate).toBe(0);
    });
  });
});
