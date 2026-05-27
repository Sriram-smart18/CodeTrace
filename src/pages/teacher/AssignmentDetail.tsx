import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Brain, Loader2, Search, Eye, Radio } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";
import { IntegrityReport, type IntegrityEvaluation } from "@/components/IntegrityReport";

type Assignment = Tables<"assignments">;


interface SubmissionWithProfile {
  id: string;
  student_id: string;
  code: string | null;
  status: string;
  score: number | null;
  submitted_at: string;
  profile?: { name: string; uid: string | null; email: string } | null;
}

export default function TeacherAssignmentDetail() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionWithProfile[]>([]);
  const [evaluations, setEvaluations] = useState<Record<string, IntegrityEvaluation>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [evaluating, setEvaluating] = useState<string | null>(null);
  const [batchEvaluating, setBatchEvaluating] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
  const [selectedEval, setSelectedEval] = useState<IntegrityEvaluation | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [codePreview, setCodePreview] = useState<{ code: string; studentName: string } | null>(null);

  const fetchData = async () => {
    if (!assignmentId) return;

    const { data: asgn } = await supabase
      .from("assignments").select("*").eq("id", assignmentId).single();
    if (asgn) setAssignment(asgn);

    const { data: subs } = await supabase
      .from("submissions").select("*")
      .eq("assignment_id", assignmentId)
      .order("submitted_at", { ascending: false });

    if (subs) {
      // Fetch profiles for these students
      const studentIds = [...new Set(subs.map((s: any) => s.student_id))];
      const { data: profiles } = await supabase
        .from("profiles").select("user_id, name, uid, email")
        .in("user_id", studentIds);

      const profileMap: Record<string, any> = {};
      profiles?.forEach((p: any) => { profileMap[p.user_id] = p; });

      const enriched = subs.map((s: any) => ({
        ...s,
        profile: profileMap[s.student_id] || null,
      }));
      setSubmissions(enriched);
    }

    const { data: evals } = await supabase
      .from("ai_evaluations").select("*").eq("assignment_id", assignmentId);
    if (evals) {
      const map: Record<string, IntegrityEvaluation> = {};
      evals.forEach((e: any) => { map[e.submission_id] = e; });
      setEvaluations(map);
    }
  };

  useEffect(() => { fetchData(); }, [assignmentId]);

  const handleEvaluate = async (submissionId: string) => {
    setEvaluating(submissionId);
    const { error } = await invokeEdgeFunction("evaluate-submission", {
      submission_id: submissionId,
    });
    if (error) {
      toast({ title: "Evaluation failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Evaluation complete" });
      await fetchData();
    }
    setEvaluating(null);
  };

  const pendingSubmissions = submissions.filter((s) => !evaluations[s.id]);

  const handleBatchEvaluate = async () => {
    const toEvaluate = pendingSubmissions;
    if (toEvaluate.length === 0) {
      toast({ title: "Nothing to evaluate", description: "All submissions have already been evaluated." });
      return;
    }
    setBatchEvaluating(true);
    setBatchProgress({ done: 0, total: toEvaluate.length });
    let successCount = 0;
    let failCount = 0;

    for (const sub of toEvaluate) {
      const { error } = await invokeEdgeFunction("evaluate-submission", {
        submission_id: sub.id,
      });
      if (error) {
        failCount++;
      } else {
        successCount++;
      }
      setBatchProgress((prev) => ({ ...prev, done: prev.done + 1 }));
    }

    setBatchEvaluating(false);
    toast({
      title: "Batch evaluation complete",
      description: `${successCount} succeeded, ${failCount} failed out of ${toEvaluate.length}.`,
    });
    fetchData();
  };

  const getRiskLevel = (score: number | null) => {
    if (score === null) return "none";
    if (score >= 70) return "high";
    if (score >= 40) return "medium";
    return "low";
  };

  const riskBadge = (score: number | null) => {
    if (score === null) return <span className="text-xs text-muted-foreground">—</span>;
    const level = getRiskLevel(score);
    const variant = level === "high" ? "destructive" : level === "medium" ? "outline" : "secondary";
    return (
      <Badge variant={variant} className="text-[10px]">
        {score}% {level.toUpperCase()}
      </Badge>
    );
  };

  const statusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "evaluated": return "default";
      case "flagged": return "destructive";
      default: return "secondary";
    }
  };

  // Apply filters
  const filtered = submissions.filter((s) => {
    // UID/name search
    if (search) {
      const q = search.toLowerCase();
      const matchName = s.profile?.name?.toLowerCase().includes(q);
      const matchUid = s.profile?.uid?.toLowerCase().includes(q);
      const matchEmail = s.profile?.email?.toLowerCase().includes(q);
      if (!matchName && !matchUid && !matchEmail) return false;
    }
    // Status filter
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    // Risk filter
    if (riskFilter !== "all") {
      const eval_ = evaluations[s.id];
      const level = getRiskLevel(eval_?.ai_probability_score ?? null);
      if (riskFilter === "none" && level !== "none") return false;
      if (riskFilter !== "none" && level !== riskFilter) return false;
    }
    return true;
  });

  const totalMarks = assignment?.total_marks || 100;

  return (
    <DashboardLayout role="teacher">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/teacher/assignments")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-foreground">{assignment?.title || "Loading..."}</h1>
              <p className="text-xs text-muted-foreground">
                {submissions.length} submission(s) · {totalMarks} marks
                {assignment?.due_date && ` · Due ${new Date(assignment.due_date).toLocaleDateString()}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              className="gap-2 text-xs"
              disabled={batchEvaluating || pendingSubmissions.length === 0}
              onClick={handleBatchEvaluate}
            >
              {batchEvaluating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Evaluating {batchProgress.done}/{batchProgress.total}
                </>
              ) : (
                <>
                  <Brain className="h-3.5 w-3.5" />
                  Evaluate All ({pendingSubmissions.length})
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-xs"
              onClick={() => navigate(`/teacher/live-session/${assignmentId}`)}
            >
              <Radio className="h-3.5 w-3.5" />
              Live Session
            </Button>
          </div>
        </div>

        {assignment?.description && (
          <Card>
            <CardContent className="py-3 text-sm text-muted-foreground">
              {assignment.description}
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by UID, name, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-9 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="evaluated">Evaluated</SelectItem>
              <SelectItem value="flagged">Flagged</SelectItem>
            </SelectContent>
          </Select>
          <Select value={riskFilter} onValueChange={setRiskFilter}>
            <SelectTrigger className="w-[140px] h-9 text-xs">
              <SelectValue placeholder="AI Risk" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Risk</SelectItem>
              <SelectItem value="high">High Risk</SelectItem>
              <SelectItem value="medium">Medium Risk</SelectItem>
              <SelectItem value="low">Low Risk</SelectItem>
              <SelectItem value="none">Not Evaluated</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-auto">
            Showing {filtered.length} of {submissions.length}
          </span>
        </div>

        {/* Submissions table */}
        <Card>
          <CardContent className="pt-4 px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-mono text-xs">UID</TableHead>
                  <TableHead className="text-xs">Student</TableHead>
                  <TableHead className="text-xs">Submitted</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Score</TableHead>
                  <TableHead className="text-xs">AI Risk</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                      No submissions match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((s) => {
                    const eval_ = evaluations[s.id];
                    return (
                      <TableRow key={s.id} className="hover:bg-muted/50">
                        <TableCell className="font-mono text-xs text-primary font-medium">
                          {s.profile?.uid || "—"}
                        </TableCell>
                        <TableCell className="text-sm">{s.profile?.name || "Unknown"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(s.submitted_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(s.status)} className="capitalize text-[10px]">
                            {s.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {s.score !== null ? `${s.score}/${totalMarks}` : "—"}
                        </TableCell>
                        <TableCell>{riskBadge(eval_?.ai_probability_score ?? null)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center gap-1.5 justify-end">
                            {s.code && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs px-2"
                                onClick={() => setCodePreview({ code: s.code!, studentName: s.profile?.name || "Unknown" })}
                              >
                                <Eye className="h-3 w-3" />
                              </Button>
                            )}
                            {eval_ && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs px-2"
                                onClick={() => { setSelectedEval(eval_); setDetailOpen(true); }}
                              >
                                Report
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant={eval_ ? "outline" : "default"}
                              className="h-7 text-xs px-2"
                              disabled={evaluating === s.id}
                              onClick={() => handleEvaluate(s.id)}
                            >
                              {evaluating === s.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Brain className="h-3 w-3" />
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

      {/* Code Preview Dialog */}
      <Dialog open={!!codePreview} onOpenChange={() => setCodePreview(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">
              {codePreview?.studentName}'s Submission
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto rounded bg-[hsl(var(--terminal-bg))] border border-[hsl(var(--terminal-border))]">
            <div className="flex text-xs font-mono">
              <div className="select-none text-right pr-3 pl-3 py-2 text-[hsl(var(--terminal-muted))] bg-[hsl(220,25%,8%)] border-r border-[hsl(var(--terminal-border))] sticky left-0">
                {codePreview?.code.split("\n").map((_, i) => (
                  <div key={i} className="leading-5">{i + 1}</div>
                ))}
              </div>
              <pre className="py-2 px-4 text-[hsl(var(--terminal-fg))] whitespace-pre overflow-x-auto flex-1 leading-5">
                {codePreview?.code}
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {selectedEval && (
        <IntegrityReport
          evaluation={selectedEval}
          open={detailOpen}
          onOpenChange={setDetailOpen}
          totalMarks={totalMarks}
        />
      )}
    </DashboardLayout>
  );
}
