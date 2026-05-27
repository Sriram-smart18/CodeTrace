import { useEffect, useState } from "react";
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


export default function TeacherSubmissions() {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [evaluations, setEvaluations] = useState<Record<string, IntegrityEvaluation>>({});
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
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleEvaluate = async (submissionId: string) => {
    setEvaluating(submissionId);
    const { error } = await invokeEdgeFunction("evaluate-submission", {
      submission_id: submissionId,
    });
    if (error) {
      toast({ title: "Evaluation failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Evaluation complete", description: "AI has evaluated the submission." });
      await fetchData();
    }
    setEvaluating(null);
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
                          {eval_ ? (
                            <span className={`text-xs font-medium ${risk.color}`}>
                              {eval_.ai_probability_score}% ({risk.label})
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center gap-2 justify-end">
                            {eval_ && (
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openDetail(eval_)}>
                                View Report
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant={eval_ ? "outline" : "default"}
                              className="h-7 text-xs"
                              disabled={evaluating === s.id}
                              onClick={() => handleEvaluate(s.id)}
                            >
                              {evaluating === s.id ? (
                                <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Evaluating...</>
                              ) : (
                                <><Brain className="h-3 w-3 mr-1" /> {eval_ ? "Re-evaluate" : "AI Evaluate"}</>
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
          open={detailOpen}
          onOpenChange={setDetailOpen}
          totalMarks={submissions.find(s => s.id === selectedEval.submission_id)?.assignments?.total_marks}
        />
      )}
    </DashboardLayout>
  );
}
