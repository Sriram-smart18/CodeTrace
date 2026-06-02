import { useEffect, useState, useRef } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Brain, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { IntegrityReport, type IntegrityEvaluation } from "@/components/IntegrityReport";
import { aiQueueService } from "@/lib/aiQueueService";
import { subscriptionManager } from "@/lib/subscriptionManager";
import { type AssessmentResult } from "@/integrations/supabase/types";

const createFallbackEvaluation = (submissionId: string, assessment?: AssessmentResult | null): IntegrityEvaluation => {
  return {
    id: assessment?.id || Math.random().toString(36).substring(2, 15),
    submission_id: submissionId,
    correctness_score: assessment?.correctness_score ?? null,
    code_quality_score: assessment?.quality_score ?? null,
    plagiarism_score: assessment ? (100 - assessment.plagiarism_score) : null,
    ai_probability_score: null,
    total_score: assessment?.overall_score ?? null,
    feedback: (assessment?.quality_details as any)?.feedback || "Evaluation completed.",
    detailed_report: {
      strengths: (assessment?.quality_details as any)?.strengths || [],
      improvements: (assessment?.quality_details as any)?.improvements || [],
    },
    risk_level: assessment?.risk_level || "low",
    integrity_verdict: (assessment?.plagiarism_details as any)?.plagiarism_explanation || null,
    suspicious_segments: null,
    ai_indicators: null,
    plagiarism_indicators: null,
    faculty_review_recommended: assessment?.risk_level === "HIGH",
    style_inconsistency_detected: null,
    paste_suspected: null,
    complexity_jump_detected: null,
    behavioral_log: null,
    peer_similarity_scores: null,
    highest_peer_similarity: assessment?.plagiarism_score ?? null,
    peer_ai_verdict: (assessment?.plagiarism_details as any)?.plagiarism_explanation || null,
    evaluated_at: assessment?.created_at || new Date().toISOString(),
  };
};

export default function TeacherSubmissions() {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [evaluations, setEvaluations] = useState<Record<string, IntegrityEvaluation>>({});
  const [assessments, setAssessments] = useState<Record<string, AssessmentResult>>({});
  const [evaluating, setEvaluating] = useState<string | null>(null);
  const [selectedEval, setSelectedEval] = useState<IntegrityEvaluation | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const { toast } = useToast();

  const fetchData = async () => {
    // Only fetch submissions for this teacher's assignments
    const { data: myAssignments } = await supabase
      .from("assignments")
      .select("id")
      .eq("created_by", (await supabase.auth.getUser()).data.user?.id || "");
    
    const assignmentIds = myAssignments?.map((a: any) => a.id) || [];
    
    if (assignmentIds.length === 0) {
      setSubmissions([]);
      return;
    }

    const { data: subs } = await supabase
      .from("submissions")
      .select("*, assignments(title, total_marks)")
      .in("assignment_id", assignmentIds)
      .order("submitted_at", { ascending: false });
    if (subs) setSubmissions(subs);

    const subIds = subs?.map((s: any) => s.id) || [];
    if (subIds.length > 0) {
      const { data: evals } = await supabase
        .from("ai_evaluations")
        .select("*")
        .in("submission_id", subIds);
      if (evals) {
        const map: Record<string, IntegrityEvaluation> = {};
        evals.forEach((e: any) => { map[e.submission_id] = e; });
        setEvaluations(map);
      }

      const { data: assessList } = await supabase
        .from("assessment_results")
        .select("*")
        .in("submission_id", subIds);
      if (assessList) {
        const map: Record<string, AssessmentResult> = {};
        assessList.forEach((a: any) => { map[a.submission_id] = a; });
        setAssessments(map);
      }
    }
  };

  const initializedRef = useRef(false);

  useEffect(() => {
    fetchData();

    if (initializedRef.current) return;
    initializedRef.current = true;

    let unsub = () => {};
    let unsubAssess = () => {};

    try {
      // Listen to background evaluation job changes
      unsub = subscriptionManager.subscribe(
        "teacher-submissions-jobs",
        "evaluation_jobs",
        "*",
        undefined,
        () => {
          fetchData();
        }
      );
    } catch (err) {
      console.error("[Realtime] Failed to subscribe to background evaluation job telemetry:", err);
    }

    try {
      // Listen to assessment results updates
      unsubAssess = subscriptionManager.subscribe(
        "teacher-submissions-assessments",
        "assessment_results",
        "*",
        undefined,
        () => {
          fetchData();
        }
      );
    } catch (err) {
      console.error("[Realtime] Failed to subscribe to assessment_results updates:", err);
    }

    return () => {
      initializedRef.current = false;
      unsub();
      unsubAssess();
    };
  }, []);

  const handleEvaluate = async (submissionId: string) => {
    setEvaluating(submissionId);
    try {
      await aiQueueService.enqueueJob(submissionId);
      toast({
        title: "Evaluation Job Enqueued",
        description: "The submission has been queued for background AI evaluation.",
      });
      await fetchData();
    } catch (error: any) {
      toast({
        title: "Failed to queue evaluation",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setEvaluating(null);
    }
  };

  const openDetail = (eval_: IntegrityEvaluation) => {
    setSelectedEval(eval_);
    setDetailOpen(true);
  };

  const statusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "evaluated": return "default";
      case "flagged": return "destructive";
      default: return "secondary";
    }
  };

  const riskLevel = (score: number | null) => {
    if (score === null) return { label: "N/A", color: "text-muted-foreground" };
    if (score >= 70) return { label: "High", color: "text-destructive" };
    if (score >= 40) return { label: "Medium", color: "text-[hsl(var(--warning))]" };
    return { label: "Low", color: "text-[hsl(var(--success))]" };
  };

  return (
    <DashboardLayout role="teacher">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">All Submissions</h1>
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Assignment</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>AI Risk</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No submissions yet.</TableCell>
                  </TableRow>
                ) : (
                  submissions.map((s) => {
                    const eval_ = evaluations[s.id];
                    const risk = riskLevel(eval_?.ai_probability_score ?? null);
                    const totalMarks = s.assignments?.total_marks || 100;
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium text-sm">{s.assignments?.title || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{new Date(s.submitted_at).toLocaleString()}</TableCell>
                        <TableCell><Badge variant={statusVariant(s.status)} className="capitalize">{s.status}</Badge></TableCell>
                        <TableCell className="font-mono text-sm">
                          {s.score !== null ? `${s.score}/${totalMarks}` : "—"}
                        </TableCell>
                        <TableCell>
                          {assessments[s.id] ? (
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-xs text-foreground">Score: {assessments[s.id].overall_score}</span>
                                <Badge className={`text-[9px] px-1 py-0.2 border capitalize ${
                                  assessments[s.id].risk_level === "LOW" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/10" :
                                  assessments[s.id].risk_level === "MEDIUM" ? "bg-amber-500/10 border-amber-500/20 text-amber-500 hover:bg-amber-500/10" :
                                  "bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500/10"
                                }`}>
                                  {assessments[s.id].risk_level}
                                </Badge>
                              </div>
                              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                C:{assessments[s.id].correctness_score} | Q:{assessments[s.id].quality_score} | P:{assessments[s.id].plagiarism_score}
                              </span>
                            </div>
                          ) : eval_ ? (
                            <span className={`text-xs font-medium ${risk.color}`}>
                              {eval_.ai_probability_score}% ({risk.label})
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center gap-2 justify-end">
                            {(eval_ || assessments[s.id]) && (
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openDetail(eval_ || createFallbackEvaluation(s.id, assessments[s.id]))}>
                                View Report
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant={eval_ || assessments[s.id] ? "outline" : "default"}
                              className="h-7 text-xs"
                              disabled={evaluating === s.id}
                              onClick={() => handleEvaluate(s.id)}
                            >
                              {evaluating === s.id ? (
                                <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Evaluating...</>
                              ) : (
                                <><Brain className="h-3 w-3 mr-1" /> {eval_ || assessments[s.id] ? "Re-evaluate" : "AI Evaluate"}</>
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {selectedEval && (
        <IntegrityReport
          evaluation={selectedEval}
          assessment={assessments[selectedEval.submission_id]}
          open={detailOpen}
          onOpenChange={setDetailOpen}
          totalMarks={submissions.find(s => s.id === selectedEval.submission_id)?.assignments?.total_marks}
        />
      )}
    </DashboardLayout>
  );
}
