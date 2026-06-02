import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Brain, ShieldAlert, ShieldCheck, ShieldX, AlertTriangle,
  CheckCircle, ChevronDown, ClipboardX, Zap, Copy, Clock,
  Keyboard, BarChart2, Users
} from "lucide-react";
import { useState } from "react";
import { type AssessmentResult } from "@/integrations/supabase/types";

// ─── Types ────────────────────────────────────────────────────────────────────

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

        <ScrollArea className="flex-1 px-6 py-5">
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
                  Visible: {(assessment.correctness_details as any).visible_passed}/{(assessment.correctness_details as any).visible_total} passed | 
                  Hidden: {(assessment.correctness_details as any).hidden_passed}/{(assessment.correctness_details as any).hidden_total} passed
                </div>
              )}

              <ScoreBar label="Code Quality" score={assessment ? assessment.quality_score : ev.code_quality_score} />
              {assessment?.quality_details && (
                <div className="text-[11px] text-muted-foreground pl-4 -mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5">
                  <div>Readability: {(assessment.quality_details as any).readability}/100</div>
                  <div>Naming: {(assessment.quality_details as any).naming}/100</div>
                  <div>Modularity: {(assessment.quality_details as any).modularity}/100</div>
                  <div>Complexity: {(assessment.quality_details as any).complexity}/100</div>
                </div>
              )}

              <ScoreBar label="Plagiarism Risk" score={assessment ? (100 - assessment.plagiarism_score) : ev.plagiarism_score} inverted />
              {assessment?.plagiarism_details && (
                <div className="text-[11px] text-muted-foreground pl-4 -mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5">
                  <div>AST Similarity: {(assessment.plagiarism_details as any).ast_similarity}%</div>
                  <div>Token Similarity: {(assessment.plagiarism_details as any).token_similarity}%</div>
                  <div>Levenshtein Sim: {(assessment.plagiarism_details as any).levenshtein_distance}%</div>
                  <div>Fingerprints (Winnowing): {(assessment.plagiarism_details as any).winnowing_similarity}%</div>
                </div>
              )}

              {!assessment && <ScoreBar label="AI-Generated Probability" score={ev.ai_probability_score} inverted />}
              
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/40">
                <span className="text-sm font-medium">Total Score</span>
                <span className="font-mono text-lg font-bold text-primary">
                  {(assessment ? assessment.overall_score : ev.total_score) ?? "—"}/{totalMarks}
                </span>
              </div>
            </div>

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

            {/* Behavioral Summary */}
            {ev.behavioral_log && (
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
            {ev.plagiarism_indicators && ev.plagiarism_indicators.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Plagiarism Signals</p>
                <ul className="space-y-1">
                  {ev.plagiarism_indicators.map((indicator, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <ClipboardX className="h-3 w-3 text-red-400 flex-shrink-0 mt-0.5" />
                      {indicator}
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
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
