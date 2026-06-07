import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Brain, ShieldAlert, ShieldCheck, ShieldX, AlertTriangle,
  CheckCircle, ChevronDown, ClipboardX, Zap, Copy, Clock,
  Keyboard, BarChart2, Users
} from "lucide-react";
import { useState } from "react";
import { type AssessmentResult } from "@/integrations/supabase/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CorrectnessDetails {
  visible_passed: number;
  visible_total: number;
  hidden_passed: number;
  hidden_total: number;
}

interface QualityDetails {
  readability: number;
  naming: number;
  modularity: number;
  complexity: number;
}

interface PlagiarismDetails {
  ast_similarity: number;
  token_similarity: number;
  levenshtein_distance: number;
  winnowing_similarity: number;
  structural_similarity?: number;
  matched_student_ids?: string[];
  matched_submission_ids?: string[];
  similarity_percentage?: number;
  matched_student_count?: number;
  plagiarism_explanation?: string;
  score_breakdown?: {
    ast_score: number;
    winnowing_score: number;
    token_score: number;
    levenshtein_score: number;
    structural_score: number;
    ai_score: number;
    final_score: number;
  } | null;
  match_metadata?: {
    matched_student_id: string;
    matched_submission_id: string;
    matched_assignment_id: string;
    similarity_source: string;
  } | null;
  behavioral_indicators?: string[];
  style_inconsistency_detected?: boolean;
  behavioral_integrity?: {
    trust_score: number;
    risk_level: string;
    paste_ratio: number;
    typing_speed: number;
    snapshot_count: number;
    run_count: number;
    tab_switches: number;
    focus_loss_seconds: number;
    penalties_applied: string[];
    process_score?: number;
    evidence: {
      possible_external_solution: boolean;
      quick_submit_after_paste: boolean;
      high_similarity_detected: boolean;
    };
  } | null;
}

interface SuspiciousSegment {
  code: string;
  reason: string;
}

interface PeerScore {
  student_id: string;
  submission_id: string;
  similarity_score: number;
  jaccard: number;
  edit_ratio: number;
  histogram: number;
}

interface BehavioralLog {
  paste_count?: number;
  largest_paste_size?: number;
  total_typing_time?: number;
  idle_time?: number;
  typing_speed_estimate?: number;
  deletion_frequency?: number;
  submission_duration?: number;
}

export interface IntegrityEvaluation {
  id: string;
  submission_id: string;
  // Original scores
  correctness_score: number | null;
  code_quality_score: number | null;
  plagiarism_score: number | null;
  ai_probability_score: number | null;
  total_score: number | null;
  feedback: string | null;
  detailed_report: { strengths?: string[]; improvements?: string[] } | null;
  plagiarism_details: PlagiarismDetails | null;
  // New integrity fields
  risk_level: string | null;
  integrity_verdict: string | null;
  suspicious_segments: SuspiciousSegment[] | null;
  ai_indicators: string[] | null;
  plagiarism_indicators: string[] | null;
  faculty_review_recommended: boolean | null;
  style_inconsistency_detected: boolean | null;
  paste_suspected: boolean | null;
  complexity_jump_detected: boolean | null;
  behavioral_log: BehavioralLog | null;
  peer_similarity_scores: PeerScore[] | null;
  highest_peer_similarity: number | null;
  peer_ai_verdict: string | null;
  evaluated_at: string;
}

interface IntegrityReportProps {
  evaluation: IntegrityEvaluation;
  assessment?: AssessmentResult | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalMarks?: number;
}

// ─── Risk level config ────────────────────────────────────────────────────────

const RISK_CONFIG: Record<string, {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
}> = {
  low: {
    label: "Low Risk",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
    icon: <ShieldCheck className="h-4 w-4 text-emerald-400" />,
  },
  medium: {
    label: "Medium Risk",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    icon: <ShieldAlert className="h-4 w-4 text-amber-400" />,
  },
  high: {
    label: "High Risk",
    color: "text-orange-400",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/30",
    icon: <ShieldAlert className="h-4 w-4 text-orange-400" />,
  },
  critical: {
    label: "Critical",
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
    icon: <ShieldX className="h-4 w-4 text-red-400" />,
  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreBar({
  label,
  score,
  inverted,
}: {
  label: string;
  score: number | null;
  inverted?: boolean;
}) {
  if (score === null) return null;
  const color = inverted
    ? score >= 70 ? "bg-destructive" : score >= 40 ? "bg-amber-500" : "bg-emerald-500"
    : score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-500" : "bg-destructive";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-mono font-medium">{score}/100</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function FlagChip({
  active,
  label,
  icon,
}: {
  active: boolean | null;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
      active
        ? "bg-red-500/10 border-red-500/30 text-red-400"
        : "bg-muted/40 border-border/40 text-muted-foreground"
    }`}>
      {icon}
      {label}
    </div>
  );
}

function BehavioralMetric({ label, value, unit }: { label: string; value?: number | string; unit?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-mono font-semibold">
        {value !== undefined && value !== null ? `${value}${unit ? ` ${unit}` : ""}` : "—"}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function IntegrityReport({ evaluation: ev, assessment, open, onOpenChange, totalMarks = 100 }: IntegrityReportProps) {
  const [segmentsOpen, setSegmentsOpen] = useState(false);
  const riskKey = assessment ? assessment.risk_level.toLowerCase() : (ev.risk_level || "low").toLowerCase();
  const plagDetails = (assessment?.plagiarism_details || ev.plagiarism_details) as unknown as PlagiarismDetails | null;
  const behavioralIntegrity = plagDetails?.behavioral_integrity;
  
  let risk = RISK_CONFIG[riskKey] || RISK_CONFIG.low;
  if (assessment) {
    const rLvl = assessment.risk_level.toUpperCase();
    if (rLvl === "LOW") {
      risk = {
        label: "Low Risk",
        color: "text-emerald-400",
        bgColor: "bg-emerald-500/10",
        borderColor: "border-emerald-500/30",
        icon: <ShieldCheck className="h-4 w-4 text-emerald-400" />,
      };
    } else if (rLvl === "MEDIUM") {
      risk = {
        label: "Medium Risk",
        color: "text-amber-400",
        bgColor: "bg-amber-500/10",
        borderColor: "border-amber-500/30",
        icon: <ShieldAlert className="h-4 w-4 text-amber-400" />,
      };
    } else if (rLvl === "HIGH") {
      risk = {
        label: "High Risk",
        color: "text-orange-400",
        bgColor: "bg-orange-500/10",
        borderColor: "border-orange-500/30",
        icon: <ShieldAlert className="h-4 w-4 text-orange-400" />,
      };
    } else if (rLvl === "CRITICAL") {
      risk = {
        label: "Critical Risk",
        color: "text-red-400",
        bgColor: "bg-red-500/10",
        borderColor: "border-red-500/30",
        icon: <ShieldX className="h-4 w-4 text-red-400" />,
      };
    }
  }

  const hasPeerData = ev.peer_similarity_scores && ev.peer_similarity_scores.length > 0;
  const topPeers = (ev.peer_similarity_scores || [])
    .slice(0, 5)
    .filter((p) => p.similarity_score > 20);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Brain className="h-5 w-5 text-primary" />
            Integrity Report
            <span className="ml-auto">
              <Badge
                className={`text-[10px] uppercase tracking-widest px-2.5 py-0.5 border ${risk.bgColor} ${risk.borderColor} ${risk.color}`}
                variant="outline"
              >
                {risk.icon}
                <span className="ml-1">{risk.label}</span>
              </Badge>
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 custom-scrollbar">
          <div className="space-y-5">

            {/* Faculty Review Banner */}
            {ev.faculty_review_recommended && (
              <div className="flex items-start gap-3 p-3.5 rounded-lg bg-red-500/10 border border-red-500/40">
                <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-400">Manual Faculty Review Recommended</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    The AI has flagged this submission as requiring human review before grading.
                  </p>
                </div>
              </div>
            )}

            {/* Style Consistency Warning */}
            {(plagDetails?.style_inconsistency_detected || ev.style_inconsistency_detected) && (
              <div className="flex items-start gap-3 p-3.5 rounded-lg bg-orange-500/10 border border-orange-500/40">
                <AlertTriangle className="h-5 w-5 text-orange-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-orange-400">Sudden Coding-Style Deviation Detected</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    This submission's function length, variable naming style, nesting depth, or control-flow complexity deviates significantly from the student's own historical coding style baseline.
                  </p>
                </div>
              </div>
            )}

            {/* Integrity Verdict */}
            {ev.integrity_verdict && (
              <div className={`p-3.5 rounded-lg border ${risk.bgColor} ${risk.borderColor}`}>
                <p className={`text-xs font-semibold uppercase tracking-widest mb-1 ${risk.color}`}>Integrity Verdict</p>
                <p className="text-sm text-foreground leading-relaxed">{ev.integrity_verdict}</p>
              </div>
            )}

            {/* Score bars */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Evaluation Scores</p>
              
              <ScoreBar label="Correctness" score={assessment ? assessment.correctness_score : ev.correctness_score} />
              {assessment?.correctness_details && (
                <div className="text-[11px] text-muted-foreground pl-4 -mt-2">
                  Visible: {(assessment.correctness_details as unknown as CorrectnessDetails).visible_passed}/{(assessment.correctness_details as unknown as CorrectnessDetails).visible_total} passed | 
                  Hidden: {(assessment.correctness_details as unknown as CorrectnessDetails).hidden_passed}/{(assessment.correctness_details as unknown as CorrectnessDetails).hidden_total} passed
                </div>
              )}

              <ScoreBar label="Code Quality" score={assessment ? assessment.quality_score : ev.code_quality_score} />
              {assessment?.quality_details && (
                <div className="text-[11px] text-muted-foreground pl-4 -mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5">
                  <div>Readability: {(assessment.quality_details as unknown as QualityDetails).readability}/100</div>
                  <div>Naming: {(assessment.quality_details as unknown as QualityDetails).naming}/100</div>
                  <div>Modularity: {(assessment.quality_details as unknown as QualityDetails).modularity}/100</div>
                  <div>Complexity: {(assessment.quality_details as unknown as QualityDetails).complexity}/100</div>
                </div>
              )}

              <ScoreBar label="Academic Integrity" score={assessment ? assessment.plagiarism_score : ev.plagiarism_score} />
              <ScoreBar label="Plagiarism Similarity" score={behavioralIntegrity ? behavioralIntegrity.similarity_percentage : (plagDetails?.similarity_percentage ?? ev.highest_peer_similarity ?? 0)} inverted />
              <ScoreBar label="Code Ownership" score={behavioralIntegrity ? (behavioralIntegrity.code_ownership_score !== undefined ? behavioralIntegrity.code_ownership_score : null) : null} />
              {plagDetails && (
                <div className="pl-4 -mt-1 space-y-2">
                  {/* Score Breakdown Table */}
                  {plagDetails.score_breakdown ? (
                    <div className="rounded-lg border border-border/40 overflow-hidden bg-muted/10 my-2">
                      <table className="w-full text-[11px] text-muted-foreground">
                        <thead>
                          <tr className="bg-muted/30 border-b border-border/40 text-foreground font-semibold">
                            <th className="text-left px-2.5 py-1">Engine</th>
                            <th className="text-right px-2.5 py-1">Similarity</th>
                            <th className="text-right px-2.5 py-1">Weight</th>
                            <th className="text-right px-2.5 py-1">Weighted</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-border/10">
                            <td className="px-2.5 py-1 text-foreground font-medium">AST Similarity</td>
                            <td className="text-right px-2.5 py-1 font-mono">{plagDetails.score_breakdown.ast_score}%</td>
                            <td className="text-right px-2.5 py-1">35%</td>
                            <td className="text-right px-2.5 py-1 font-mono">{Math.round(plagDetails.score_breakdown.ast_score * 0.35)}%</td>
                          </tr>
                          <tr className="border-b border-border/10">
                            <td className="px-2.5 py-1 text-foreground font-medium">Winnowing Fingerprints</td>
                            <td className="text-right px-2.5 py-1 font-mono">{plagDetails.score_breakdown.winnowing_score}%</td>
                            <td className="text-right px-2.5 py-1">25%</td>
                            <td className="text-right px-2.5 py-1 font-mono">{Math.round(plagDetails.score_breakdown.winnowing_score * 0.25)}%</td>
                          </tr>
                          <tr className="border-b border-border/10">
                            <td className="px-2.5 py-1 text-foreground font-medium">Token Similarity</td>
                            <td className="text-right px-2.5 py-1 font-mono">{plagDetails.score_breakdown.token_score}%</td>
                            <td className="text-right px-2.5 py-1">15%</td>
                            <td className="text-right px-2.5 py-1 font-mono">{Math.round(plagDetails.score_breakdown.token_score * 0.15)}%</td>
                          </tr>
                          <tr className="border-b border-border/10">
                            <td className="px-2.5 py-1 text-foreground font-medium">Levenshtein Similarity</td>
                            <td className="text-right px-2.5 py-1 font-mono">{plagDetails.score_breakdown.levenshtein_score}%</td>
                            <td className="text-right px-2.5 py-1">10%</td>
                            <td className="text-right px-2.5 py-1 font-mono">{Math.round(plagDetails.score_breakdown.levenshtein_score * 0.10)}%</td>
                          </tr>
                          <tr className="border-b border-border/10">
                            <td className="px-2.5 py-1 text-foreground font-medium">Structural Similarity</td>
                            <td className="text-right px-2.5 py-1 font-mono">{plagDetails.score_breakdown.structural_score}%</td>
                            <td className="text-right px-2.5 py-1">10%</td>
                            <td className="text-right px-2.5 py-1 font-mono">{Math.round(plagDetails.score_breakdown.structural_score * 0.10)}%</td>
                          </tr>
                          <tr className="border-b border-border/10">
                            <td className="px-2.5 py-1 text-foreground font-medium">AI Semantic Review</td>
                            <td className="text-right px-2.5 py-1 font-mono">{plagDetails.score_breakdown.ai_score}%</td>
                            <td className="text-right px-2.5 py-1">5%</td>
                            <td className="text-right px-2.5 py-1 font-mono">{Math.round(plagDetails.score_breakdown.ai_score * 0.05)}%</td>
                          </tr>
                          <tr className="bg-muted/10 font-bold text-foreground">
                            <td className="px-2.5 py-1">Final Plagiarism Score</td>
                            <td className="text-right px-2.5 py-1"></td>
                            <td className="text-right px-2.5 py-1">100%</td>
                            <td className="text-right px-2.5 py-1 text-primary font-mono">{plagDetails.score_breakdown.final_score}%</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-[11px] text-muted-foreground grid grid-cols-2 gap-x-2 gap-y-0.5">
                      <div>AST Similarity: {plagDetails.ast_similarity}%</div>
                      <div>Token Similarity: {plagDetails.token_similarity}%</div>
                      <div>Levenshtein Sim: {plagDetails.levenshtein_distance}%</div>
                      <div>Fingerprints (Winnowing): {plagDetails.winnowing_similarity}%</div>
                    </div>
                  )}

                  {/* Match Source Metadata */}
                  {plagDetails.match_metadata && (
                    <div className="text-[11px] text-muted-foreground space-y-0.5 border-t border-border/30 pt-1.5 mt-1.5">
                      <div><strong>Matched Student:</strong> ...{plagDetails.match_metadata.matched_student_id.slice(-8)}</div>
                      <div><strong>Matched Submission:</strong> ...{plagDetails.match_metadata.matched_submission_id.slice(-8)}</div>
                      <div><strong>Matched Assignment:</strong> ...{plagDetails.match_metadata.matched_assignment_id.slice(-8)}</div>
                      <div>
                        <strong>Match Source:</strong>{' '}
                        <Badge variant="outline" className="text-[9px] uppercase tracking-wider px-1.5 py-0.1 bg-primary/5 border-primary/20 text-primary capitalize font-mono">
                          {plagDetails.match_metadata.similarity_source.replace('_', ' ')}
                        </Badge>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!assessment && <ScoreBar label="AI-Generated Probability" score={ev.ai_probability_score} inverted />}
              
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/40">
                <span className="text-sm font-medium">Total Final Score</span>
                <span className="font-mono text-lg font-bold text-primary flex items-center gap-1.5">
                  <span>{(assessment ? assessment.overall_score : ev.total_score) ?? "—"}/{totalMarks}</span>
                  {behavioralIntegrity && behavioralIntegrity.final_score_before_caps !== undefined && behavioralIntegrity.final_score_before_caps !== (behavioralIntegrity.final_score_after_caps ?? assessment?.overall_score ?? ev.total_score) && (
                    <span className="text-xs text-muted-foreground line-through ml-2">
                      {behavioralIntegrity.final_score_before_caps}/{totalMarks}
                    </span>
                  )}
                </span>
              </div>

              {/* Final Score Weighted Breakdown */}
              <div className="rounded-lg border border-border/30 bg-muted/10 p-3 my-2 space-y-1.5 text-xs text-muted-foreground select-none">
                <div className="flex justify-between border-b border-border/10 pb-1 mb-1 font-semibold text-foreground">
                  <span>Score Component</span>
                  <span>Weight</span>
                  <span>Calculated Score</span>
                </div>
                <div className="flex justify-between">
                  <span>Test Case Correctness</span>
                  <span>50%</span>
                  <span className="font-mono text-foreground font-medium">{assessment ? assessment.correctness_score : ev.correctness_score || 0}/100</span>
                </div>
                <div className="flex justify-between">
                  <span>Academic Integrity Score</span>
                  <span>25%</span>
                  <span className="font-mono text-foreground font-medium">{assessment ? assessment.plagiarism_score : ev.plagiarism_score || 0}/100</span>
                </div>
                <div className="flex justify-between">
                  <span>Code Quality</span>
                  <span>15%</span>
                  <span className="font-mono text-foreground font-medium">{assessment ? assessment.quality_score : ev.code_quality_score || 0}/100</span>
                </div>
                <div className="flex justify-between">
                  <span>Problem Solving Process</span>
                  <span>10%</span>
                  <span className="font-mono text-foreground font-medium">
                    {behavioralIntegrity ? (behavioralIntegrity.process_score || 0) : 70}/100
                  </span>
                </div>
              </div>
            </div>

            {/* Behavioral Integrity Dashboard Panel v2.2 */}
            {behavioralIntegrity ? (
              <div className="space-y-3 p-4 rounded-xl border border-border/40 bg-[#0f172a]/20 dark:bg-slate-950/40 shadow-sm">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <Keyboard className="h-4 w-4 text-primary" />
                    Behavioral Integrity Dashboard
                  </h4>
                  {(() => {
                    const score = assessment ? assessment.plagiarism_score : ev.plagiarism_score;
                    if (score === null || score === undefined) return null;
                    if (score >= 90) return <Badge className="bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-[10px] font-bold">🟢 Genuine Work</Badge>;
                    if (score >= 70) return <Badge className="bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/10 text-[10px] font-bold">🟡 Mostly Genuine</Badge>;
                    if (score >= 50) return <Badge className="bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 text-[10px] font-bold">🟠 Mixed Evidence</Badge>;
                    if (score >= 30) return <Badge className="bg-orange-500/10 border-orange-500/30 text-orange-400 hover:bg-orange-500/10 text-[10px] font-bold">🔴 Suspicious</Badge>;
                    return <Badge className="bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/10 text-[10px] font-bold">🚨 Highly Suspicious</Badge>;
                  })()}
                </div>

                {/* Trust score bar */}
                <div className="space-y-1 my-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Telemetry Trust Score</span>
                    <span className="font-mono font-bold text-foreground">{behavioralIntegrity.trust_score}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all ${
                        behavioralIntegrity.trust_score >= 80 ? "bg-emerald-500" :
                        behavioralIntegrity.trust_score >= 60 ? "bg-amber-500" :
                        behavioralIntegrity.trust_score >= 35 ? "bg-orange-500" : "bg-red-500"
                      }`}
                      style={{ width: `${behavioralIntegrity.trust_score}%` }} 
                    />
                  </div>
                </div>

                {/* Telemetry Grid */}
                {(() => {
                  const behLog = ev.behavioral_log || (plagDetails as any)?.behavioral_integrity || {};
                  const typedCharacters = behLog.typedCharacters || (behLog as any).typed_characters || 0;
                  const editCount = behLog.editCount || (behLog as any).edit_count || 0;
                  const backspaceCount = behLog.backspaceCount || (behLog as any).backspace_count || 0;

                  return (
                    <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                      <div className="p-2 rounded-lg bg-muted/20 border border-border/20">
                        <div className="text-[10px] text-muted-foreground uppercase font-semibold">Academic Integrity Score</div>
                        <div className="font-mono text-sm font-bold text-primary mt-0.5">
                          {behavioralIntegrity.academic_integrity_score !== undefined ? behavioralIntegrity.academic_integrity_score : ev.plagiarism_score}/100
                        </div>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/20 border border-border/20">
                        <div className="text-[10px] text-muted-foreground uppercase font-semibold">Code Ownership Score</div>
                        <div className="font-mono text-sm font-bold text-foreground mt-0.5">
                          {behavioralIntegrity.code_ownership_score !== undefined ? behavioralIntegrity.code_ownership_score : "—"}/100
                        </div>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/20 border border-border/20">
                        <div className="text-[10px] text-muted-foreground uppercase font-semibold">Telemetry Trust Score</div>
                        <div className="font-mono text-sm font-bold text-foreground mt-0.5">{behavioralIntegrity.trust_score}%</div>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/20 border border-border/20">
                        <div className="text-[10px] text-muted-foreground uppercase font-semibold">Similarity Score</div>
                        <div className="font-mono text-sm font-bold text-foreground mt-0.5">{behavioralIntegrity.similarity_percentage}%</div>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/20 border border-border/20">
                        <div className="text-[10px] text-muted-foreground uppercase font-semibold">Paste Ratio</div>
                        <div className="font-mono text-sm font-bold text-foreground mt-0.5">{(behavioralIntegrity.paste_ratio * 100).toFixed(1)}%</div>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/20 border border-border/20">
                        <div className="text-[10px] text-muted-foreground uppercase font-semibold">Typed Characters</div>
                        <div className="font-mono text-sm font-bold text-foreground mt-0.5">{typedCharacters} chars</div>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/20 border border-border/20">
                        <div className="text-[10px] text-muted-foreground uppercase font-semibold">Edits / Backspaces</div>
                        <div className="font-mono text-sm font-bold text-foreground mt-0.5">{editCount} edits / {backspaceCount} del</div>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/20 border border-border/20">
                        <div className="text-[10px] text-muted-foreground uppercase font-semibold">Snapshots & Runs</div>
                        <div className="font-mono text-sm font-bold text-foreground mt-0.5">{behavioralIntegrity.snapshot_count} snaps / {behavioralIntegrity.run_count || 0} runs</div>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/20 border border-border/20">
                        <div className="text-[10px] text-muted-foreground uppercase font-semibold">Focus Loss Time</div>
                        <div className="font-mono text-sm font-bold text-foreground mt-0.5">{behavioralIntegrity.focus_loss_seconds} sec</div>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/20 border border-border/20">
                        <div className="text-[10px] text-muted-foreground uppercase font-semibold">Fraud Indicators</div>
                        <div className="font-mono text-sm font-bold text-foreground mt-0.5">
                          {behavioralIntegrity.fraud_indicator_count !== undefined ? behavioralIntegrity.fraud_indicator_count : "—"} triggered
                        </div>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/20 border border-border/20 col-span-2">
                        <div className="text-[10px] text-muted-foreground uppercase font-semibold">Final Score Before / After Caps</div>
                        <div className="font-mono text-sm font-bold text-foreground mt-0.5">
                          Before: {behavioralIntegrity.final_score_before_caps ?? "—"} | After: {behavioralIntegrity.final_score_after_caps ?? "—"}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Evidence Flags */}
                <div className="space-y-1 pt-1 text-xs">
                  <span className="text-[10px] uppercase text-muted-foreground font-semibold">Evidence Flags</span>
                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                    {behavioralIntegrity.evidence?.possible_ai_generation && (
                      <Badge variant="outline" className="text-[9px] bg-purple-500/5 text-purple-400 border-purple-500/20">possible ai generation</Badge>
                    )}
                    {behavioralIntegrity.evidence?.possible_external_solution && (
                      <Badge variant="outline" className="text-[9px] bg-red-500/5 text-red-500 border-red-500/20">possible external solution</Badge>
                    )}
                    {behavioralIntegrity.evidence?.quick_submit_after_paste && (
                      <Badge variant="outline" className="text-[9px] bg-orange-500/5 text-orange-500 border-orange-500/20">quick submit after paste</Badge>
                    )}
                    {behavioralIntegrity.evidence?.minimal_editing && (
                      <Badge variant="outline" className="text-[9px] bg-amber-500/5 text-amber-500 border-amber-500/20">minimal editing</Badge>
                    )}
                    {behavioralIntegrity.evidence?.minimal_debugging && (
                      <Badge variant="outline" className="text-[9px] bg-yellow-500/5 text-yellow-500 border-yellow-500/20">minimal debugging</Badge>
                    )}
                    {behavioralIntegrity.evidence?.suspicious_input_pattern && (
                      <Badge variant="outline" className="text-[9px] bg-pink-500/5 text-pink-500 border-pink-500/20">suspicious input pattern</Badge>
                    )}
                    {!behavioralIntegrity.evidence?.possible_ai_generation && 
                     !behavioralIntegrity.evidence?.possible_external_solution && 
                     !behavioralIntegrity.evidence?.quick_submit_after_paste && 
                     !behavioralIntegrity.evidence?.minimal_editing && 
                     !behavioralIntegrity.evidence?.minimal_debugging && 
                     !behavioralIntegrity.evidence?.suspicious_input_pattern && (
                      <div className="text-[11px] text-muted-foreground italic">No evidence flags triggered.</div>
                    )}
                  </div>
                </div>

                {/* Penalties Applied */}
                {behavioralIntegrity.penalties_applied && behavioralIntegrity.penalties_applied.length > 0 && (
                  <div className="space-y-1 pt-1 text-xs">
                    <span className="text-[10px] uppercase text-muted-foreground font-semibold">Penalties Applied</span>
                    <div className="flex flex-wrap gap-1.5 mt-0.5">
                      {behavioralIntegrity.penalties_applied.map((penalty, idx) => (
                        <Badge key={idx} variant="secondary" className="text-[9px] uppercase font-mono tracking-wider bg-destructive/10 text-destructive border-destructive/20">{penalty.replace(/_/g, ' ')}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Timeline Visualization of Code Growth */}
                {ev.behavioral_log && (ev.behavioral_log as any).versionSnapshots && (ev.behavioral_log as any).versionSnapshots.length > 0 && (
                  <div className="space-y-1 pt-1.5 border-t border-border/40 text-xs">
                    <span className="text-[10px] uppercase text-muted-foreground font-semibold">Timeline Visualization of Code Growth</span>
                    <div className="pl-2 border-l border-border/80 space-y-2 py-1 max-h-36 overflow-y-auto mt-1">
                      {((ev.behavioral_log as any).versionSnapshots as { timestamp: string; codeLength: number }[]).map((v, i) => (
                        <div key={i} className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                          <span className="font-mono">{new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                          <span>—</span>
                          <span className="font-mono text-foreground font-semibold">{v.codeLength} characters</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : ev.behavioral_log && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                  <Keyboard className="h-3.5 w-3.5" />Behavioral Summary
                </p>
                <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-1">
                  <BehavioralMetric label="Paste Count" value={ev.behavioral_log.paste_count} />
                  <BehavioralMetric label="Largest Paste" value={ev.behavioral_log.largest_paste_size} unit="chars" />
                  <BehavioralMetric label="Active Typing Time" value={ev.behavioral_log.total_typing_time} unit="sec" />
                  <BehavioralMetric label="Idle Time" value={ev.behavioral_log.idle_time} unit="sec" />
                  <BehavioralMetric label="Typing Speed" value={ev.behavioral_log.typing_speed_estimate} unit="chars/min" />
                  <BehavioralMetric label="Deletion Events" value={ev.behavioral_log.deletion_frequency} />
                  <BehavioralMetric label="Session Duration" value={ev.behavioral_log.submission_duration} unit="sec" />
                </div>
              </div>
            )}

            {/* Detection Flags */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Detection Flags</p>
              <div className="flex flex-wrap gap-2">
                <FlagChip
                  active={ev.paste_suspected}
                  label="Paste Suspected"
                  icon={<Copy className="h-3 w-3" />}
                />
                <FlagChip
                  active={ev.style_inconsistency_detected}
                  label="Style Inconsistency"
                  icon={<Zap className="h-3 w-3" />}
                />
                <FlagChip
                  active={ev.complexity_jump_detected}
                  label="Complexity Jump"
                  icon={<BarChart2 className="h-3 w-3" />}
                />
              </div>
            </div>

            {/* AI Indicators */}
            {ev.ai_indicators && ev.ai_indicators.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">AI Generation Signals</p>
                <ul className="space-y-1">
                  {ev.ai_indicators.map((indicator, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Brain className="h-3 w-3 text-amber-400 flex-shrink-0 mt-0.5" />
                      {indicator}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Plagiarism Indicators */}
            {((ev.plagiarism_indicators && ev.plagiarism_indicators.length > 0) || (plagDetails?.behavioral_indicators && plagDetails.behavioral_indicators.length > 0)) && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Plagiarism Signals & Behavioral Correlation</p>
                <ul className="space-y-1">
                  {ev.plagiarism_indicators && ev.plagiarism_indicators.map((indicator, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <ClipboardX className="h-3 w-3 text-red-400 flex-shrink-0 mt-0.5" />
                      <span>{indicator}</span>
                    </li>
                  ))}
                  {plagDetails?.behavioral_indicators && plagDetails.behavioral_indicators.map((indicator, i) => (
                    <li key={`beh-${i}`} className="flex items-start gap-2 text-xs text-muted-foreground bg-orange-500/5 border border-orange-500/20 p-2 rounded-lg">
                      <AlertTriangle className="h-3.5 w-3.5 text-orange-400 flex-shrink-0 mt-0.5" />
                      <span>{indicator}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Suspicious Segments */}
            {ev.suspicious_segments && ev.suspicious_segments.length > 0 && (
              <Collapsible open={segmentsOpen} onOpenChange={setSegmentsOpen}>
                <CollapsibleTrigger className="flex items-center justify-between w-full text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">
                  <span>Suspicious Code Segments ({ev.suspicious_segments.length})</span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${segmentsOpen ? "rotate-180" : ""}`} />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 mt-2">
                  {ev.suspicious_segments.map((seg, i) => (
                    <div key={i} className="rounded-lg border border-amber-500/20 bg-amber-500/5 overflow-hidden">
                      <pre className="p-3 text-[11px] font-mono text-foreground overflow-x-auto whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                        {seg.code}
                      </pre>
                      <div className="px-3 py-2 border-t border-amber-500/20 bg-amber-500/10">
                        <p className="text-[11px] text-amber-400">{seg.reason}</p>
                      </div>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Cross-Submission Peer Similarity */}
            {hasPeerData && topPeers.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Peer Similarity
                  {ev.highest_peer_similarity !== null && (
                    <span className={`ml-auto text-xs font-mono ${
                      ev.highest_peer_similarity >= 70 ? "text-red-400" :
                      ev.highest_peer_similarity >= 40 ? "text-amber-400" : "text-muted-foreground"
                    }`}>
                      Highest: {ev.highest_peer_similarity}%
                    </span>
                  )}
                </p>
                <div className="rounded-lg border border-border/40 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/40 bg-muted/30">
                        <th className="text-left px-3 py-2 text-muted-foreground font-medium">Peer</th>
                        <th className="text-right px-3 py-2 text-muted-foreground font-medium">Combined</th>
                        <th className="text-right px-3 py-2 text-muted-foreground font-medium">Jaccard</th>
                        <th className="text-right px-3 py-2 text-muted-foreground font-medium">Edit Dist</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topPeers.map((p, i) => (
                        <tr key={i} className="border-b border-border/20 last:border-0 hover:bg-muted/20">
                          <td className="px-3 py-2 font-mono text-muted-foreground">
                            ...{p.student_id.slice(-8)}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono font-bold ${
                            p.similarity_score >= 70 ? "text-red-400" :
                            p.similarity_score >= 40 ? "text-amber-400" : "text-muted-foreground"
                          }`}>
                            {p.similarity_score}%
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-muted-foreground">{p.jaccard}%</td>
                          <td className="px-3 py-2 text-right font-mono text-muted-foreground">{p.edit_ratio}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* AI Plagiarism Verdict */}
                {ev.peer_ai_verdict && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-red-400 mb-1">AI Plagiarism Verdict</p>
                    <p className="text-xs text-muted-foreground">{ev.peer_ai_verdict}</p>
                  </div>
                )}
              </div>
            )}

            {/* Strengths & Improvements */}
            {ev.detailed_report?.strengths && ev.detailed_report.strengths.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> Strengths
                </span>
                <ul className="text-xs text-muted-foreground space-y-0.5 list-disc pl-5">
                  {ev.detailed_report.strengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            {ev.detailed_report?.improvements && ev.detailed_report.improvements.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> Improvements
                </span>
                <ul className="text-xs text-muted-foreground space-y-0.5 list-disc pl-5">
                  {ev.detailed_report.improvements.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}

            {/* Feedback */}
            {ev.feedback && (
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">AI Feedback</p>
                <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{ev.feedback}</p>
              </div>
            )}

            {/* Timestamp */}
            <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1 pt-1 border-t border-border/20">
              <Clock className="h-3 w-3" />
              Evaluated {new Date(ev.evaluated_at).toLocaleString()}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
