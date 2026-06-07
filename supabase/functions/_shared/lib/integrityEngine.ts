export interface IntegrityResult {
  academicIntegrityScore: number;
  codeOwnershipScore: number;
  behavioralTrust: number;
  similarityScore: number;
  processScore: number;
  focusScore: number;
  fraudIndicatorCount: number;
  riskLevel: string;
  integrityVerdict: string;
  overallScoreBeforeCaps: number;
  overallScoreAfterCaps: number;
  penaltiesApplied: string[];
  evidence: {
    possible_ai_generation: boolean;
    possible_external_solution: boolean;
    quick_submit_after_paste: boolean;
    minimal_editing: boolean;
    minimal_debugging: boolean;
    suspicious_input_pattern: boolean;
  };
}

export function calculateAcademicIntegrity(
  telemetry: any,
  plagiarismSimilarity: number,
  aiReviewScore: number,
  correctnessScore: number,
  qualityScore: number,
  finalCodeLength: number
): IntegrityResult {
  // Telemetry fields extraction
  const typedCharacters = Number(telemetry.typedCharacters || 0);
  const pastedCharacters = Number(telemetry.pastedCharacters || 0);
  const pasteEvents = Number(telemetry.pasteEvents || 0);
  const backspaceCount = Number(telemetry.backspaceCount || 0);
  const editCount = Number(telemetry.editCount || 0);
  const activeCodingTime = Number(telemetry.activeCodingTime || 0); // seconds
  const idleTime = Number(telemetry.idleTime || 0); // seconds
  
  const tabSwitchCount = Number(telemetry.tabSwitchCount || 0);
  const windowBlurCount = Number(telemetry.windowBlurCount || 0);
  const totalOutOfFocusTime = Number(telemetry.totalOutOfFocusTime || 0); // seconds
  const largePasteEvents = Number(telemetry.largePasteEvents || 0);
  const largestPasteSize = Number(telemetry.largestPasteSize || 0);
  const snapshotCount = Number(telemetry.snapshotCount || 0);
  const runCount = Number(telemetry.runCount || 0);
  const effectivePastedChars = Number(telemetry.effective_pasted_chars || 0);
  const submitDelay = telemetry.submitDelayAfterLastPaste !== undefined && telemetry.submitDelayAfterLastPaste !== null ? Number(telemetry.submitDelayAfterLastPaste) : null;

  const pasteRatio = finalCodeLength > 0 ? Math.min(1, effectivePastedChars / finalCodeLength) : 0;

  // 1. Behavioral Trust (0-100)
  const typingMinutes = activeCodingTime / 60;
  const typingSpeed = typingMinutes > 0 ? Math.round(typedCharacters / typingMinutes) : 0;
  
  let typingConsistency = 100;
  if (typingSpeed > 400) {
    const isCheatingSuspected = pasteRatio > 0.50 || plagiarismSimilarity > 70;
    if (isCheatingSuspected) {
      typingConsistency = Math.max(0, 100 - ((typingSpeed - 400) / 5));
    }
  }

  let typingScore = 100;
  if (typedCharacters < 300) {
    typingScore = (typedCharacters / 300) * 100;
  }
  typingScore = typingScore * (typingConsistency / 100);

  const pasteScore = Math.max(0, 100 - (pasteRatio * 80) - (pasteEvents * 5) - (largePasteEvents * 20));

  let behavioralTrust = (typingScore * 0.5) + (pasteScore * 0.5);

  if (submitDelay !== null && submitDelay < 60 && (largePasteEvents > 0 || largestPasteSize > 300)) {
    behavioralTrust -= 30;
  }

  // Minimum Human Coding Time Caps
  if (activeCodingTime < 30) {
    behavioralTrust = Math.min(behavioralTrust, 20);
  } else if (activeCodingTime < 60) {
    behavioralTrust = Math.min(behavioralTrust, 40);
  }

  behavioralTrust = Math.min(100, Math.max(0, Math.round(behavioralTrust)));

  // 2. Similarity Score (0-100)
  const similarityScore = Math.max(0, 100 - plagiarismSimilarity);

  // 3. Process Score (0-100)
  const snapshotComponent = Math.min(40, snapshotCount * 8);
  const runComponent = runCount === 0 ? 0 : Math.min(20, 10 + (runCount * 3));
  const editComponent = Math.min(40, Math.round(
    (editCount > 20 ? 25 : (editCount / 20) * 25) +
    (backspaceCount > 5 ? 15 : (backspaceCount / 5) * 15)
  ));
  const processScore = Math.min(100, Math.max(0, Math.round(snapshotComponent + runComponent + editComponent)));

  // 4. Focus Score (0-100)
  const totalSessionTime = activeCodingTime + idleTime || 1;
  const outOfFocusRatio = totalOutOfFocusTime / totalSessionTime;
  const focusScore = Math.max(0, 100 - (tabSwitchCount * 3) - (windowBlurCount * 3) - Math.round(outOfFocusRatio * 150));

  // Calculate AcademicIntegrityScore (0-100)
  let academicIntegrityScore = Math.round(
    (behavioralTrust * 0.40) +
    (similarityScore * 0.35) +
    (processScore * 0.15) +
    (focusScore * 0.10)
  );

  // Code Ownership Score (0-100)
  const ownershipTyping = Math.min(100, (typedCharacters / Math.max(finalCodeLength, 1)) * 100);
  const ownershipSnapshots = Math.min(100, snapshotCount * 10);
  const ownershipEdits = Math.min(100, editCount * 2);
  const ownershipRuns = Math.min(100, runCount * 15);

  const codeOwnershipScore = Math.min(100, Math.max(0, Math.round(
    (ownershipTyping * 0.40) +
    (ownershipSnapshots * 0.20) +
    (ownershipEdits * 0.20) +
    (ownershipRuns * 0.20)
  )));

  // Behavioral Fraud Indicators
  const fraudIndicatorsList = {
    paste_ratio_over_80: pasteRatio > 0.80,
    large_paste_over_300: largestPasteSize > 300,
    quick_submit: submitDelay !== null && submitDelay < 60,
    no_runs: runCount === 0,
    one_snapshot: snapshotCount <= 1
  };

  let fraudIndicatorCount = 0;
  if (fraudIndicatorsList.paste_ratio_over_80) fraudIndicatorCount++;
  if (fraudIndicatorsList.large_paste_over_300) fraudIndicatorCount++;
  if (fraudIndicatorsList.quick_submit) fraudIndicatorCount++;
  if (fraudIndicatorsList.no_runs) fraudIndicatorCount++;
  if (fraudIndicatorsList.one_snapshot) fraudIndicatorCount++;

  let riskLevel = "LOW";
  if (plagiarismSimilarity >= 85) {
    riskLevel = "CRITICAL";
  } else if (plagiarismSimilarity >= 70 || behavioralTrust < 50) {
    riskLevel = "HIGH";
  } else if (plagiarismSimilarity >= 40 || behavioralTrust < 60) {
    riskLevel = "MEDIUM";
  }

  // Fraud overrides
  if (fraudIndicatorCount >= 3) {
    academicIntegrityScore = Math.min(academicIntegrityScore, 60);
    if (riskLevel === "LOW") {
      riskLevel = "MEDIUM";
    }
  }
  if (fraudIndicatorCount >= 5) {
    if (riskLevel !== "CRITICAL") {
      riskLevel = "HIGH";
    }
  }

  // AI / External Solution Evidence flags
  const possible_ai_generation = aiReviewScore > 70 || (plagiarismSimilarity > 70 && pasteRatio > 0.80);
  const possible_external_solution = largePasteEvents > 0 || pastedCharacters > 300 || largestPasteSize > 300;
  const quick_submit_after_paste = submitDelay !== null && submitDelay < 60 && (largePasteEvents > 0 || largestPasteSize > 300 || pasteEvents > 0);
  const minimal_editing = editCount < 10 && backspaceCount < 3;
  const minimal_debugging = runCount <= 1;

  // Extreme Paste Detection & Overrides
  const effectivePasteRatio = finalCodeLength > 0 ? (effectivePastedChars / finalCodeLength) : 0;
  const isExtremePasteA = effectivePasteRatio >= 0.90 && typedCharacters < 100;
  const isSuspiciousB = finalCodeLength > 500 && activeCodingTime < 60;
  const isSuspiciousC = finalCodeLength > 1000 && typedCharacters < 150;

  if (isExtremePasteA) {
    riskLevel = "CRITICAL";
    academicIntegrityScore = Math.min(academicIntegrityScore, 20);
  }

  // Ownership-Based Governance
  if (codeOwnershipScore < 10) {
    if (riskLevel === "LOW" || riskLevel === "MEDIUM") {
      riskLevel = "HIGH";
    }
  }

  // Similarity >= 85 -> Risk = CRITICAL
  if (plagiarismSimilarity >= 85) {
    riskLevel = "CRITICAL";
  }

  // Verdict and impossible state validation: Trust < 35 OR Ownership < 20 cannot be Genuine Work
  if (behavioralTrust < 35 || codeOwnershipScore < 20) {
    academicIntegrityScore = Math.min(academicIntegrityScore, 89);
  }

  let integrityVerdict = "";
  if (academicIntegrityScore >= 90) {
    integrityVerdict = "🟢 Genuine Work";
  } else if (academicIntegrityScore >= 70) {
    integrityVerdict = "🟡 Mostly Genuine";
  } else if (academicIntegrityScore >= 50) {
    integrityVerdict = "🟠 Mixed Evidence";
  } else if (academicIntegrityScore >= 30) {
    integrityVerdict = "🔴 Suspicious";
  } else {
    integrityVerdict = "🚨 Highly Suspicious";
  }

  // Calculate overallScore before caps
  const overallScoreBeforeCaps = Math.round(
    (correctnessScore * 0.5) +
    (academicIntegrityScore * 0.25) +
    (qualityScore * 0.15) +
    (processScore * 0.1)
  );

  let overallScore = overallScoreBeforeCaps;

  // Apply score caps in priority:
  // 1. Academic Integrity Gated Caps
  if (academicIntegrityScore >= 90) {
    // no cap
  } else if (academicIntegrityScore >= 70) {
    overallScore = Math.min(overallScore, 90);
  } else if (academicIntegrityScore >= 50) {
    overallScore = Math.min(overallScore, 75);
  } else if (academicIntegrityScore >= 30) {
    overallScore = Math.min(overallScore, 50);
  } else {
    overallScore = Math.min(overallScore, 30);
  }

  // 2. Similarity Gated Caps
  if (plagiarismSimilarity >= 85) {
    overallScore = Math.min(overallScore, 30);
  } else if (plagiarismSimilarity >= 60) {
    overallScore = Math.min(overallScore, 50);
  } else if (plagiarismSimilarity >= 40) {
    overallScore = Math.min(overallScore, 75);
  }

  // 3. Ownership Gated Caps
  if (codeOwnershipScore < 10 && plagiarismSimilarity > 70) {
    overallScore = Math.min(overallScore, 10);
  } else if (codeOwnershipScore < 20) {
    overallScore = Math.min(overallScore, 20);
  }

  // Extreme Paste Condition A Cap
  if (isExtremePasteA) {
    overallScore = Math.min(overallScore, 20);
  }

  const overallScoreAfterCaps = overallScore;

  // Penalties list
  const penaltiesApplied: string[] = [];
  if (fraudIndicatorsList.paste_ratio_over_80) penaltiesApplied.push("PASTE_RATIO_OVER_80");
  if (fraudIndicatorsList.large_paste_over_300) penaltiesApplied.push("LARGE_PASTE_OVER_300");
  if (fraudIndicatorsList.quick_submit) penaltiesApplied.push("QUICK_SUBMIT_AFTER_LARGE_PASTE");
  if (fraudIndicatorsList.no_runs) penaltiesApplied.push("NO_RUNS_BEFORE_SUBMIT");
  if (fraudIndicatorsList.one_snapshot) penaltiesApplied.push("ONLY_ONE_SNAPSHOT");
  if (isExtremePasteA) penaltiesApplied.push("EXTREME_PASTE_DETECTION");
  if (isSuspiciousB || isSuspiciousC) penaltiesApplied.push("SUSPICIOUS_INPUT_PATTERN");

  return {
    academicIntegrityScore,
    codeOwnershipScore,
    behavioralTrust,
    similarityScore,
    processScore,
    focusScore,
    fraudIndicatorCount,
    riskLevel,
    integrityVerdict,
    overallScoreBeforeCaps,
    overallScoreAfterCaps,
    penaltiesApplied,
    evidence: {
      possible_ai_generation,
      possible_external_solution,
      quick_submit_after_paste,
      minimal_editing,
      minimal_debugging,
      suspicious_input_pattern: isSuspiciousB || isSuspiciousC
    }
  };
}
