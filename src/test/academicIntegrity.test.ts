import { describe, it, expect } from "vitest";
import { calculateAcademicIntegrity } from "../../supabase/functions/_shared/lib/integrityEngine.ts";

describe("Academic Integrity Engine v3.2 Tests", () => {
  // Scenario A: Genuine Typed Solution
  it("Scenario A: Genuine Typed Solution should have high integrity, high ownership, and LOW risk", () => {
    const telemetry = {
      typedCharacters: 800,
      pastedCharacters: 0,
      pasteEvents: 0,
      backspaceCount: 20,
      editCount: 50,
      activeCodingTime: 300,
      idleTime: 50,
      tabSwitchCount: 1,
      windowBlurCount: 1,
      totalOutOfFocusTime: 10,
      largePasteEvents: 0,
      largestPasteSize: 0,
      snapshotCount: 15,
      runCount: 5,
      effective_pasted_chars: 0,
      submitDelayAfterLastPaste: null
    };

    const res = calculateAcademicIntegrity(
      telemetry,
      0, // plagiarismSimilarity
      10, // aiReviewScore
      100, // correctnessScore
      90, // qualityScore
      800 // finalCodeLength
    );

    expect(res.academicIntegrityScore).toBeGreaterThan(90);
    expect(res.codeOwnershipScore).toBeGreaterThan(90);
    expect(res.riskLevel).toBe("LOW");
    expect(res.integrityVerdict).toBe("🟢 Genuine Work");
  });

  // Scenario B: Mixed Typing
  it("Scenario B: Mixed Typing should fall into Mostly Genuine range", () => {
    const telemetry = {
      typedCharacters: 400,
      pastedCharacters: 100,
      pasteEvents: 1,
      backspaceCount: 10,
      editCount: 25,
      activeCodingTime: 180,
      idleTime: 30,
      tabSwitchCount: 2,
      windowBlurCount: 2,
      totalOutOfFocusTime: 15,
      largePasteEvents: 0,
      largestPasteSize: 100,
      snapshotCount: 8,
      runCount: 3,
      effective_pasted_chars: 100,
      submitDelayAfterLastPaste: 120
    };

    const res = calculateAcademicIntegrity(
      telemetry,
      15, // plagiarismSimilarity
      20, // aiReviewScore
      90, // correctnessScore
      80, // qualityScore
      500 // finalCodeLength
    );

    expect(res.academicIntegrityScore).toBeGreaterThanOrEqual(70);
    expect(res.academicIntegrityScore).toBeLessThanOrEqual(89);
    expect(res.integrityVerdict).toBe("🟡 Mostly Genuine");
  });

  // Scenario C: Large Paste
  it("Scenario C: Large Paste should be Suspicious and cap the final score", () => {
    const telemetry = {
      typedCharacters: 105,
      pastedCharacters: 450,
      pasteEvents: 2,
      backspaceCount: 2,
      editCount: 5,
      activeCodingTime: 45,
      idleTime: 10,
      tabSwitchCount: 5,
      windowBlurCount: 4,
      totalOutOfFocusTime: 40,
      largePasteEvents: 1,
      largestPasteSize: 350,
      snapshotCount: 2,
      runCount: 1,
      effective_pasted_chars: 450,
      submitDelayAfterLastPaste: 10
    };

    const res = calculateAcademicIntegrity(
      telemetry,
      30, // plagiarismSimilarity
      60, // aiReviewScore
      100, // correctnessScore
      80, // qualityScore
      555 // finalCodeLength (pasteRatio = 450/555 = 81.1%)
    );

    expect(res.integrityVerdict).toBe("🔴 Suspicious");
    // Under L30-49 Cap, overall score must be <= 50
    expect(res.overallScoreAfterCaps).toBeLessThanOrEqual(50);
  });

  // Scenario D: AI Generated Paste
  it("Scenario D: AI Generated Paste should trigger CRITICAL risk and cap the score <= 30", () => {
    const telemetry = {
      typedCharacters: 20,
      pastedCharacters: 480,
      pasteEvents: 1,
      backspaceCount: 0,
      editCount: 1,
      activeCodingTime: 15,
      idleTime: 5,
      tabSwitchCount: 2,
      windowBlurCount: 1,
      totalOutOfFocusTime: 10,
      largePasteEvents: 1,
      largestPasteSize: 480,
      snapshotCount: 1,
      runCount: 0,
      effective_pasted_chars: 480,
      submitDelayAfterLastPaste: 5
    };

    const res = calculateAcademicIntegrity(
      telemetry,
      88, // plagiarismSimilarity >= 85
      85, // aiReviewScore
      100, // correctnessScore
      85, // qualityScore
      500 // finalCodeLength
    );

    expect(res.riskLevel).toBe("CRITICAL");
    expect(res.overallScoreAfterCaps).toBeLessThanOrEqual(30);
  });

  // Scenario E: Extreme Paste
  it("Scenario E: Extreme Paste A should trigger CRITICAL risk and cap final score <= 20", () => {
    const telemetry = {
      typedCharacters: 40, // < 100
      pastedCharacters: 960,
      pasteEvents: 1,
      backspaceCount: 0,
      editCount: 1,
      activeCodingTime: 15,
      idleTime: 5,
      tabSwitchCount: 2,
      windowBlurCount: 1,
      totalOutOfFocusTime: 10,
      largePasteEvents: 1,
      largestPasteSize: 960,
      snapshotCount: 1,
      runCount: 0,
      effective_pasted_chars: 960, // effectivePasteRatio >= 90%
      submitDelayAfterLastPaste: 5
    };

    const res = calculateAcademicIntegrity(
      telemetry,
      20, // plagiarismSimilarity
      30, // aiReviewScore
      100, // correctnessScore
      80, // qualityScore
      1000 // finalCodeLength
    );

    expect(res.riskLevel).toBe("CRITICAL");
    expect(res.academicIntegrityScore).toBeLessThanOrEqual(20);
    expect(res.overallScoreAfterCaps).toBeLessThanOrEqual(20);
  });

  // Scenario F: Ownership Abuse
  it("Scenario F: Ownership Abuse should cap score <= 10 when Ownership < 10 and Similarity > 70", () => {
    // Make ownership < 10
    const telemetry = {
      typedCharacters: 5, // very low typing
      pastedCharacters: 900,
      pasteEvents: 1,
      backspaceCount: 0,
      editCount: 1,
      activeCodingTime: 10,
      idleTime: 2,
      tabSwitchCount: 1,
      windowBlurCount: 1,
      totalOutOfFocusTime: 5,
      largePasteEvents: 1,
      largestPasteSize: 900,
      snapshotCount: 0,
      runCount: 0,
      effective_pasted_chars: 900,
      submitDelayAfterLastPaste: 5
    };

    const res = calculateAcademicIntegrity(
      telemetry,
      75, // Similarity > 70
      40,
      100,
      80,
      905
    );

    expect(res.codeOwnershipScore).toBeLessThan(10);
    expect(res.overallScoreAfterCaps).toBeLessThanOrEqual(10);
  });

  // Scenario G: Impossible State Validation
  describe("Scenario G: Impossible State Validation & Rules", () => {
    it("Similarity > 85 must always be CRITICAL risk and Score <= 30", () => {
      const telemetry = {
        typedCharacters: 500,
        pastedCharacters: 0,
        pasteEvents: 0,
        backspaceCount: 20,
        editCount: 50,
        activeCodingTime: 300,
        idleTime: 50,
        tabSwitchCount: 1,
        windowBlurCount: 1,
        totalOutOfFocusTime: 10,
        largePasteEvents: 0,
        largestPasteSize: 0,
        snapshotCount: 15,
        runCount: 5,
        effective_pasted_chars: 0,
        submitDelayAfterLastPaste: null
      };

      const res = calculateAcademicIntegrity(
        telemetry,
        86, // similarity > 85
        10,
        100,
        90,
        500
      );

      expect(res.riskLevel).toBe("CRITICAL");
      expect(res.overallScoreAfterCaps).toBeLessThanOrEqual(30);
    });

    it("Trust < 35 or Ownership < 20 cannot be Genuine Work", () => {
      // High typing speed cheating scenario -> behavioralTrust < 35
      const telemetry = {
        typedCharacters: 1000,
        pastedCharacters: 200,
        pasteEvents: 1,
        backspaceCount: 2,
        editCount: 5,
        activeCodingTime: 10, // typing speed 6000 chars/min!
        idleTime: 2,
        tabSwitchCount: 1,
        windowBlurCount: 1,
        totalOutOfFocusTime: 2,
        largePasteEvents: 1,
        largestPasteSize: 200,
        snapshotCount: 2,
        runCount: 1,
        effective_pasted_chars: 200,
        submitDelayAfterLastPaste: 5
      };

      const res = calculateAcademicIntegrity(
        telemetry,
        75, // high similarity
        40,
        100,
        80,
        1200
      );

      // Verify that it is not Genuine Work
      expect(res.integrityVerdict).not.toBe("🟢 Genuine Work");
      expect(res.academicIntegrityScore).toBeLessThanOrEqual(89);
    });

    it("Ownership < 10 must have Risk >= HIGH", () => {
      const telemetry = {
        typedCharacters: 5,
        pastedCharacters: 500,
        pasteEvents: 1,
        backspaceCount: 0,
        editCount: 1,
        activeCodingTime: 10,
        idleTime: 2,
        tabSwitchCount: 1,
        windowBlurCount: 1,
        totalOutOfFocusTime: 2,
        largePasteEvents: 1,
        largestPasteSize: 500,
        snapshotCount: 0,
        runCount: 0,
        effective_pasted_chars: 500,
        submitDelayAfterLastPaste: 5
      };

      const res = calculateAcademicIntegrity(
        telemetry,
        0, // low similarity
        10,
        100,
        80,
        505
      );

      expect(res.codeOwnershipScore).toBeLessThan(10);
      expect(res.riskLevel).not.toBe("LOW");
      expect(res.riskLevel).not.toBe("MEDIUM");
    });

    it("3+ fraud indicators must cap integrity at 60 and risk cannot be LOW", () => {
      const telemetry = {
        typedCharacters: 150,
        pastedCharacters: 400,
        pasteEvents: 1,
        backspaceCount: 2,
        editCount: 5,
        activeCodingTime: 120,
        idleTime: 10,
        tabSwitchCount: 1,
        windowBlurCount: 1,
        totalOutOfFocusTime: 5,
        largePasteEvents: 1,
        largestPasteSize: 400,
        snapshotCount: 1, // Indicator 1: snapshotCount <= 1
        runCount: 0, // Indicator 2: runCount === 0
        effective_pasted_chars: 400, // pasteRatio = 400/550 = 72.7% (not indicator)
        submitDelayAfterLastPaste: 10 // Indicator 3: submitDelay < 60
      };

      const res = calculateAcademicIntegrity(
        telemetry,
        0,
        10,
        100,
        80,
        550
      );

      expect(res.fraudIndicatorCount).toBeGreaterThanOrEqual(3);
      expect(res.academicIntegrityScore).toBeLessThanOrEqual(60);
      expect(res.riskLevel).not.toBe("LOW");
    });

    it("5+ fraud indicators must have Risk = HIGH (unless CRITICAL)", () => {
      const telemetry = {
        typedCharacters: 120, // >= 100 to avoid Extreme Paste Condition A
        pastedCharacters: 490,
        pasteEvents: 1,
        backspaceCount: 1,
        editCount: 2,
        activeCodingTime: 40,
        idleTime: 5,
        tabSwitchCount: 1,
        windowBlurCount: 1,
        totalOutOfFocusTime: 5,
        largePasteEvents: 1,
        largestPasteSize: 450, // Indicator 2: large paste > 300
        snapshotCount: 1, // Indicator 5: snapshotCount <= 1
        runCount: 0, // Indicator 4: runCount === 0
        effective_pasted_chars: 490, // Indicator 1: pasteRatio = 490/610 = 80.3% > 80%
        submitDelayAfterLastPaste: 10 // Indicator 3: submitDelay < 60
      };

      const res = calculateAcademicIntegrity(
        telemetry,
        0,
        10,
        100,
        80,
        610 // finalCodeLength (pasteRatio = 490/610 = 80.3%)
      );

      expect(res.fraudIndicatorCount).toBe(5);
      expect(res.riskLevel).toBe("HIGH");
    });
  });
});
