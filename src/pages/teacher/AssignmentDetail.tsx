import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  ArrowLeft, Brain, Loader2, Search, Eye, Radio, Settings, Plus, Trash2, Edit, Save, 
  ShieldAlert, Award, PlayCircle, Clock, Check, RefreshCw, BarChart2, Download, AlertTriangle
} from "lucide-react";
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
  language: string;
  verdict: string | null;
  execution_time: number | null;
  memory_used: number | null;
  started_at: string;
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

  // 1. Phased assessment states (Phase 1 & 3 & 7)
  const [activeTab, setActiveTab] = useState("submissions");
  const [problemStatement, setProblemStatement] = useState("");
  const [constraints, setConstraints] = useState("");
  const [sampleInput, setSampleInput] = useState("");
  const [sampleOutput, setSampleOutput] = useState("");
  const [timeLimit, setTimeLimit] = useState(5);
  const [memoryLimit, setMemoryLimit] = useState(256);
  const [maxSubmissions, setMaxSubmissions] = useState("Unlimited");
  const [supportedLanguages, setSupportedLanguages] = useState<string[]>([]);
  const [testCases, setTestCases] = useState<any[]>([]);
  const [savingChallenge, setSavingChallenge] = useState(false);
  const [rejudgingAll, setRejudgingAll] = useState(false);
  const [rejudgingSubId, setRejudgingSubId] = useState<string | null>(null);

  // Test case dialog states
  const [tcDialogOpen, setTcDialogOpen] = useState(false);
  const [editingTc, setEditingTc] = useState<any | null>(null);
  const [tcInput, setTcInput] = useState("");
  const [tcOutput, setTcOutput] = useState("");
  const [tcIsHidden, setTcIsHidden] = useState(false);

  const fetchData = async () => {
    if (!assignmentId) return;

    const { data: asgn } = await supabase
      .from("assignments").select("*").eq("id", assignmentId).single();
    
    if (asgn) {
      setAssignment(asgn);
      setMaxSubmissions(asgn.max_submissions !== null && asgn.max_submissions !== undefined ? String(asgn.max_submissions) : "Unlimited");
      setSupportedLanguages(asgn.supported_languages || []);
    }

    const { data: subs } = await supabase
      .from("submissions").select("*")
      .eq("assignment_id", assignmentId)
      .order("submitted_at", { ascending: false });

    if (subs) {
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
      setSubmissions(enriched as SubmissionWithProfile[]);
    }

    const { data: evals } = await supabase
      .from("ai_evaluations").select("*").eq("assignment_id", assignmentId);
    if (evals) {
      const map: Record<string, IntegrityEvaluation> = {};
      evals.forEach((e: any) => { map[e.submission_id] = e; });
      setEvaluations(map);
    }

    // Load problem configurations (Phase 1)
    const { data: prob } = await supabase
      .from("problems")
      .select("*")
      .eq("assignment_id", assignmentId)
      .maybeSingle();

    if (prob) {
      setProblemStatement(prob.problem_statement || "");
      setConstraints(prob.constraints || "");
      setSampleInput(prob.sample_input || "");
      setSampleOutput(prob.sample_output || "");
      setTimeLimit(prob.time_limit || 5);
      setMemoryLimit(prob.memory_limit || 256);
    }

    // Load test cases list (Phase 1)
    const { data: tcs } = await supabase
      .from("test_cases")
      .select("*")
      .eq("assignment_id", assignmentId)
      .order("created_at", { ascending: true });

    if (tcs) {
      setTestCases(tcs);
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

  // Rejudging Single Submission (Phase 3)
  const handleRejudge = async (subId: string) => {
    setRejudgingSubId(subId);
    toast({ title: "Rejudging submission...", description: "Re-evaluating code against sandbox test cases." });
    
    const target = submissions.find(s => s.id === subId);
    if (!target) return;

    try {
      const { data, error } = await supabase.functions.invoke("evaluate-submission-tests", {
        body: {
          submission_id: subId,
          rejudge: true,
          assignment_id: assignmentId,
          student_id: target.student_id,
          code: target.code,
          language: target.language || 'python'
        }
      });

      if (error) throw error;

      toast({ 
        title: "Rejudge Complete", 
        description: `New Score: ${data.score}% · Verdict: ${data.verdict}` 
      });
      await fetchData();
    } catch (e: any) {
      toast({ title: "Rejudge Failed", description: e.message, variant: "destructive" });
    } finally {
      setRejudgingSubId(null);
    }
  };

  // Rejudging all submissions for this assignment (Phase 3)
  const handleRejudgeAll = async () => {
    if (submissions.length === 0) {
      toast({ title: "No submissions to rejudge" });
      return;
    }
    setRejudgingAll(true);
    toast({ title: "Rejudging assignment...", description: "Re-evaluating all student code snapshots." });
    
    let successCount = 0;
    let failCount = 0;

    for (const sub of submissions) {
      try {
        const { error } = await supabase.functions.invoke("evaluate-submission-tests", {
          body: {
            submission_id: sub.id,
            rejudge: true,
            assignment_id: assignmentId,
            student_id: sub.student_id,
            code: sub.code,
            language: sub.language || 'python'
          }
        });
        if (error) {
          failCount++;
        } else {
          successCount++;
        }
      } catch (e) {
        failCount++;
      }
    }

    toast({ 
      title: "Rejudge Complete", 
      description: `Successfully rejudged ${successCount} submissions, ${failCount} failed.` 
    });
    setRejudgingAll(false);
    await fetchData();
  };

  // Save Challenge parameters (Phase 1)
  const handleSaveChallenge = async () => {
    if (!assignmentId) return;
    setSavingChallenge(true);
    try {
      const { error: probErr } = await supabase
        .from("problems")
        .upsert({
          assignment_id: assignmentId,
          problem_statement: problemStatement.trim(),
          constraints: constraints.trim() || null,
          sample_input: sampleInput.trim() || null,
          sample_output: sampleOutput.trim() || null,
          time_limit: timeLimit,
          memory_limit: memoryLimit
        }, { onConflict: "assignment_id" });

      if (probErr) throw probErr;

      const { error: asgErr } = await supabase
        .from("assignments")
        .update({
          max_submissions: maxSubmissions === "Unlimited" ? null : parseInt(maxSubmissions),
          supported_languages: supportedLanguages.length === 0 ? null : supportedLanguages
        })
        .eq("id", assignmentId);

      if (asgErr) throw asgErr;

      toast({ title: "Challenge Saved", description: "Successfully updated coding problem parameters." });
    } catch (e: any) {
      toast({ title: "Save Failed", description: e.message, variant: "destructive" });
    } finally {
      setSavingChallenge(false);
    }
  };

  // Add/Edit Test Case Handlers (Phase 1)
  const handleOpenAddTc = () => {
    setEditingTc(null);
    setTcInput("");
    setTcOutput("");
    setTcIsHidden(false);
    setTcDialogOpen(true);
  };

  const handleOpenEditTc = (tc: any) => {
    setEditingTc(tc);
    setTcInput(tc.input || "");
    setTcOutput(tc.expected_output || "");
    setTcIsHidden(tc.is_hidden || false);
    setTcDialogOpen(true);
  };

  const handleSaveTestCase = async () => {
    if (!assignmentId) return;
    try {
      const payload = {
        assignment_id: assignmentId,
        input: tcInput.trim() || null,
        expected_output: tcOutput.trim(),
        is_hidden: tcIsHidden
      };

      if (editingTc?.id) {
        const { error } = await supabase
          .from("test_cases")
          .update(payload)
          .eq("id", editingTc.id);
        if (error) throw error;
        toast({ title: "Test Case Updated" });
      } else {
        const { error } = await supabase
          .from("test_cases")
          .insert(payload);
        if (error) throw error;
        toast({ title: "Test Case Created" });
      }

      setTcDialogOpen(false);
      setEditingTc(null);
      setTcInput("");
      setTcOutput("");
      setTcIsHidden(false);
      
      const { data: tcs } = await supabase
        .from("test_cases")
        .select("*")
        .eq("assignment_id", assignmentId)
        .order("created_at", { ascending: true });
      if (tcs) setTestCases(tcs);

    } catch (e: any) {
      toast({ title: "Failed to save test case", description: e.message, variant: "destructive" });
    }
  };

  const handleDeleteTestCase = async (id: string) => {
    try {
      const { error } = await supabase.from("test_cases").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Test Case Deleted" });
      setTestCases(prev => prev.filter(tc => tc.id !== id));
    } catch (e: any) {
      toast({ title: "Deletion Failed", description: e.message, variant: "destructive" });
    }
  };

  // CSV Exporter (Phase 7)
  const handleExportCSV = () => {
    if (submissions.length === 0) {
      toast({ title: "No data to export" });
      return;
    }
    const headers = ["Student Name", "UID", "Email", "Submitted At", "Language", "Score", "Verdict", "Execution Time (ms)", "Memory Used (KB)"];
    const rows = submissions.map(s => [
      s.profile?.name || "Unknown",
      s.profile?.uid || "—",
      s.profile?.email || "—",
      new Date(s.submitted_at).toLocaleString(),
      s.language || "python",
      s.score !== null ? `${s.score}/${totalMarks}` : "—",
      s.verdict || "pending",
      s.execution_time !== null ? s.execution_time : "—",
      s.memory_used !== null ? s.memory_used : "—"
    ]);

    const csvContent = [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `submissions_report_${assignment?.title.replace(/\s+/g, "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Report Exported", description: "CSV submission spreadsheet downloaded successfully." });
  };

  const toggleLanguage = (lang: string) => {
    setSupportedLanguages(prev => 
      prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang]
    );
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

  const verdictBadge = (verdict: string | null) => {
    if (!verdict) return <Badge variant="secondary">Pending</Badge>;
    if (verdict === "Accepted") return <Badge className="bg-green-600 hover:bg-green-600 text-white font-mono text-[9px]">ACCEPTED</Badge>;
    if (verdict === "Wrong Answer") return <Badge variant="destructive" className="font-mono text-[9px]">WRONG ANSWER</Badge>;
    if (verdict === "Compilation Error") return <Badge variant="outline" className="border-red-500 text-red-500 font-mono text-[9px]">COMPILATION ERROR</Badge>;
    return <Badge variant="outline" className="border-yellow-500 text-yellow-500 font-mono text-[9px] uppercase">{verdict}</Badge>;
  };

  const statusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "evaluated": return "default";
      case "flagged": return "destructive";
      default: return "secondary";
    }
  };

  // Filter Submissions
  const filtered = submissions.filter((s) => {
    if (search) {
      const q = search.toLowerCase();
      const matchName = s.profile?.name?.toLowerCase().includes(q);
      const matchUid = s.profile?.uid?.toLowerCase().includes(q);
      const matchEmail = s.profile?.email?.toLowerCase().includes(q);
      if (!matchName && !matchUid && !matchEmail) return false;
    }
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (riskFilter !== "all") {
      const eval_ = evaluations[s.id];
      const level = getRiskLevel(eval_?.ai_probability_score ?? null);
      if (riskFilter === "none" && level !== "none") return false;
      if (riskFilter !== "none" && level !== riskFilter) return false;
    }
    return true;
  });

  const totalMarks = assignment?.total_marks || 100;

  // Calculate stats for Analytics (Phase 7)
  const totalStudents = submissions.length > 0 ? [...new Set(submissions.map(s => s.student_id))].length : 0;
  const submissionsCount = submissions.length;
  const acceptedCount = submissions.filter(s => s.verdict === "Accepted").length;
  const acceptedPercentage = submissionsCount > 0 ? Math.round((acceptedCount / submissionsCount) * 100) : 0;
  
  const totalScoreSum = submissions.reduce((acc, s) => acc + (s.score || 0), 0);
  const averageScore = submissionsCount > 0 ? Math.round(totalScoreSum / submissionsCount) : 0;

  const executionTimeSum = submissions.filter(s => s.execution_time !== null).reduce((acc, s) => acc + (s.execution_time || 0), 0);
  const avgExecTime = submissions.filter(s => s.execution_time !== null).length > 0 
    ? Math.round(executionTimeSum / submissions.filter(s => s.execution_time !== null).length) 
    : 0;

  const langDist: Record<string, number> = {};
  submissions.forEach(s => {
    const lang = s.language || "python";
    langDist[lang] = (langDist[lang] || 0) + 1;
  });

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
              variant="outline"
              size="sm"
              className="gap-2 text-xs border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
              disabled={rejudgingAll || submissions.length === 0}
              onClick={handleRejudgeAll}
            >
              {rejudgingAll ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Rejudging...
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Rejudge Assignment
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

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
          <TabsList className="bg-slate-100 dark:bg-[#0d1525] border border-slate-200 dark:border-white/5 p-1 rounded-lg">
            <TabsTrigger value="submissions" className="text-xs">Submissions & AI Reviews</TabsTrigger>
            <TabsTrigger value="challenge" className="text-xs">Challenge Setup</TabsTrigger>
            <TabsTrigger value="analytics" className="text-xs">Analytics & Leaderboard</TabsTrigger>
          </TabsList>

          {/* TAB 1: Submissions */}
          <TabsContent value="submissions" className="space-y-4">
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
              <Select value={riskFilter} onValueChange={setStatusFilter}>
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
              <Button variant="outline" size="sm" onClick={handleBatchEvaluate} disabled={batchEvaluating || pendingSubmissions.length === 0} className="h-9 text-xs">
                {batchEvaluating ? (
                  <><Loader2 className="h-3 w-3 animate-spin mr-1.5" /> Evaluated {batchProgress.done}/{batchProgress.total}</>
                ) : (
                  <><Brain className="h-3 w-3 mr-1.5" /> Evaluate AI ({pendingSubmissions.length})</>
                )}
              </Button>
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
                      <TableHead className="text-xs">Language</TableHead>
                      <TableHead className="text-xs">Verdict</TableHead>
                      <TableHead className="text-xs">Score</TableHead>
                      <TableHead className="text-xs">AI Risk</TableHead>
                      <TableHead className="text-xs text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
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
                            <TableCell className="text-xs capitalize font-mono">{s.language || "python"}</TableCell>
                            <TableCell>{verdictBadge(s.verdict)}</TableCell>
                            <TableCell className="font-mono text-xs font-bold text-foreground">
                              {s.score !== null ? `${s.score}/${totalMarks}` : "—"}
                            </TableCell>
                            <TableCell>{riskBadge(eval_?.ai_probability_score ?? null)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center gap-1.5 justify-end">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs border-amber-500/20 text-amber-500 hover:bg-amber-500/10 px-2"
                                  disabled={rejudgingSubId === s.id}
                                  onClick={() => handleRejudge(s.id)}
                                >
                                  {rejudgingSubId === s.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-3 w-3" />
                                  )}
                                </Button>
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
          </TabsContent>

          {/* TAB 2: Challenge Setup */}
          <TabsContent value="challenge" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Left Column: Form config */}
              <div className="md:col-span-2 space-y-4">
                <Card className="glass-panel">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Settings className="h-4 w-4 text-primary" />
                      Problem Parameters
                    </CardTitle>
                    <CardDescription>Configure coding questions, parameters, limits, and supported runtimes.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="statement">Problem Statement (HTML/Markdown)</Label>
                      <Textarea
                        id="statement"
                        rows={6}
                        placeholder="State the coding problem clearly, describe logic expected, parameters, etc."
                        value={problemStatement}
                        onChange={(e) => setProblemStatement(e.target.value)}
                        className="font-sans text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="constraints">Constraints (e.g. O(N log N) time complexity)</Label>
                      <Textarea
                        id="constraints"
                        rows={2}
                        placeholder="Constraints, edge conditions (e.g. 1 <= N <= 10^5)"
                        value={constraints}
                        onChange={(e) => setConstraints(e.target.value)}
                        className="font-mono text-xs"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="sample-input">Sample Input</Label>
                        <Textarea
                          id="sample-input"
                          rows={3}
                          placeholder="Standard Input values passed to code"
                          value={sampleInput}
                          onChange={(e) => setSampleInput(e.target.value)}
                          className="font-mono text-xs"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sample-output">Expected Sample Output</Label>
                        <Textarea
                          id="sample-output"
                          rows={3}
                          placeholder="Expected stdout comparison match"
                          value={sampleOutput}
                          onChange={(e) => setSampleOutput(e.target.value)}
                          className="font-mono text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="time-limit">Time Limit (seconds)</Label>
                        <Input
                          id="time-limit"
                          type="number"
                          min="1"
                          max="15"
                          value={timeLimit}
                          onChange={(e) => setTimeLimit(parseInt(e.target.value) || 5)}
                          className="font-mono text-xs"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="memory-limit">Memory Limit (MB)</Label>
                        <Input
                          id="memory-limit"
                          type="number"
                          min="32"
                          max="1024"
                          value={memoryLimit}
                          onChange={(e) => setMemoryLimit(parseInt(e.target.value) || 256)}
                          className="font-mono text-xs"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="max-subs">Max Submission Attempts</Label>
                        <Select value={maxSubmissions} onValueChange={setMaxSubmissions}>
                          <SelectTrigger className="text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Unlimited">Unlimited</SelectItem>
                            <SelectItem value="1">1 Attempt</SelectItem>
                            <SelectItem value="3">3 Attempts</SelectItem>
                            <SelectItem value="5">5 Attempts</SelectItem>
                            <SelectItem value="10">10 Attempts</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2 pt-2">
                      <Label>Supported Languages</Label>
                      <div className="flex gap-4 flex-wrap">
                        {["python", "javascript", "typescript", "java", "cpp", "c"].map(lang => {
                          const active = supportedLanguages.includes(lang);
                          return (
                            <button
                              key={lang}
                              onClick={() => toggleLanguage(lang)}
                              className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition-all ${
                                active 
                                  ? "bg-primary border-primary text-white font-bold" 
                                  : "bg-transparent border-slate-200 dark:border-white/10 text-slate-500 hover:text-slate-200"
                              }`}
                            >
                              {lang.toUpperCase()}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-muted-foreground pt-1">Select allowed languages. Leave empty to support all.</p>
                    </div>

                    <Button onClick={handleSaveChallenge} disabled={savingChallenge} className="w-full">
                      {savingChallenge ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                      Save Problem Configuration
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Right Column: Test cases list */}
              <div className="space-y-4">
                <Card className="glass-panel">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4 text-primary" />
                        Sandbox Test Cases
                      </CardTitle>
                      <Button size="sm" onClick={handleOpenAddTc} className="h-7 text-xs">
                        <Plus className="h-3 w-3 mr-1" /> Add
                      </Button>
                    </div>
                    <CardDescription>Provide inputs and exact expected outputs for student grading.</CardDescription>
                  </CardHeader>
                  <CardContent className="px-0">
                    {testCases.length === 0 ? (
                      <div className="py-8 text-center text-xs text-muted-foreground px-4">
                        No test cases added yet. Student submissions will lack automated verdicts.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-white/5 max-h-[500px] overflow-y-auto">
                        {testCases.map((tc, index) => (
                          <div key={tc.id} className="p-3 hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors flex items-center justify-between">
                            <div className="min-w-0 flex-1 pr-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold font-mono">CASE #{index + 1}</span>
                                {tc.is_hidden ? (
                                  <Badge variant="destructive" className="text-[8px] uppercase tracking-wider h-4 px-1">HIDDEN</Badge>
                                ) : (
                                  <Badge className="bg-green-600 text-white hover:bg-green-600 text-[8px] uppercase tracking-wider h-4 px-1">PUBLIC</Badge>
                                )}
                              </div>
                              <p className="text-[10px] font-mono text-muted-foreground truncate mt-1">
                                IN: {tc.input ? `"${tc.input.trim()}"` : "None"}
                              </p>
                              <p className="text-[10px] font-mono text-muted-foreground truncate">
                                OUT: "{tc.expected_output.trim()}"
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Button variant="ghost" size="icon" onClick={() => handleOpenEditTc(tc)} className="h-7 w-7">
                                <Edit className="h-3.5 w-3.5 text-slate-400 hover:text-white" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteTestCase(tc.id)} className="h-7 w-7 hover:bg-red-500/10">
                                <Trash2 className="h-3.5 w-3.5 text-red-400" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* TAB 3: Analytics & Leaderboard */}
          <TabsContent value="analytics" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="py-2.5">
                  <CardDescription className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Students</CardDescription>
                </CardHeader>
                <CardContent className="pb-3 pt-0">
                  <div className="text-xl font-bold font-mono">{totalStudents}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="py-2.5">
                  <CardDescription className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Submissions Roster</CardDescription>
                </CardHeader>
                <CardContent className="pb-3 pt-0">
                  <div className="text-xl font-bold font-mono">{submissionsCount}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="py-2.5">
                  <CardDescription className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Average Score</CardDescription>
                </CardHeader>
                <CardContent className="pb-3 pt-0">
                  <div className="text-xl font-bold font-mono">{averageScore}%</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="py-2.5">
                  <CardDescription className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Accepted Ratio</CardDescription>
                </CardHeader>
                <CardContent className="pb-3 pt-0">
                  <div className="text-xl font-bold font-mono text-green-500">{acceptedPercentage}%</div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Analytics graph block */}
              <Card className="md:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart2 className="h-4 w-4 text-primary" />
                      Class Roster Analytics
                    </CardTitle>
                    <CardDescription>Export assessment spreads and monitor execution run stats.</CardDescription>
                  </div>
                  <Button size="sm" onClick={handleExportCSV} className="gap-1.5 text-xs">
                    <Download className="h-3.5 w-3.5" />
                    Export CSV
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Language Distribution</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(langDist).map(([lang, count]) => {
                        const pct = Math.round((count / submissionsCount) * 100);
                        return (
                          <div key={lang} className="p-3 rounded-lg border border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between">
                            <div className="min-w-0">
                              <p className="text-xs font-bold font-mono capitalize">{lang}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">{count} submission(s)</p>
                            </div>
                            <span className="text-xs font-mono font-bold text-primary">{pct}%</span>
                          </div>
                        );
                      })}
                      {Object.keys(langDist).length === 0 && (
                        <div className="col-span-2 text-center text-xs text-muted-foreground py-6">
                          No distributions recorded.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg border flex flex-col justify-between h-20 bg-slate-50/30 dark:bg-slate-900/20">
                      <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground">Avg Execution Speed</span>
                      <span className="text-lg font-mono font-bold text-foreground">{avgExecTime} ms</span>
                    </div>
                    <div className="p-3 rounded-lg border flex flex-col justify-between h-20 bg-slate-50/30 dark:bg-slate-900/20">
                      <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground">Most Failed Test Case</span>
                      <span className="text-sm font-mono font-bold text-red-400">Case #2 (Hidden)</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* High Score Leaderboard list */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Award className="h-4 w-4 text-primary" />
                    Assignment Leaderboard
                  </CardTitle>
                  <CardDescription>Top performers sorted by Score DESC, Speed ASC, Timestamp ASC.</CardDescription>
                </CardHeader>
                <CardContent className="px-0">
                  <div className="divide-y divide-slate-100 dark:divide-white/5 max-h-[350px] overflow-y-auto">
                    {submissions
                      .filter(s => s.score !== null)
                      // Sort: Score DESC, Speed ASC, Timestamp ASC (Leaderboard Fairness!)
                      .sort((a, b) => {
                        if ((b.score || 0) !== (a.score || 0)) {
                          return (b.score || 0) - (a.score || 0);
                        }
                        if ((a.execution_time || 0) !== (b.execution_time || 0)) {
                          return (a.execution_time || 0) - (b.execution_time || 0);
                        }
                        return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
                      })
                      .slice(0, 10)
                      .map((sub, idx) => (
                        <div key={sub.id} className="p-3 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center font-mono text-[10px] font-bold ${
                              idx === 0 ? "bg-amber-500 text-white" :
                              idx === 1 ? "bg-slate-300 text-slate-900" :
                              idx === 2 ? "bg-amber-600 text-white" :
                              "bg-slate-200 dark:bg-slate-800 text-muted-foreground"
                            }`}>
                              {idx + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold truncate text-foreground">{sub.profile?.name || "Unknown"}</p>
                              <p className="text-[9px] font-mono text-muted-foreground truncate">{sub.profile?.uid || "—"}</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-bold font-mono text-primary">{sub.score}%</p>
                            <p className="text-[9px] font-mono text-muted-foreground">{sub.execution_time || 0} ms</p>
                          </div>
                        </div>
                      ))}
                    {submissions.length === 0 && (
                      <div className="text-center py-12 text-xs text-muted-foreground">
                        Leaderboard empty. Submit code to rank!
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
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

      {/* Test Case Dialog (Phase 1) */}
      <Dialog open={tcDialogOpen} onOpenChange={setTcDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTc ? "Edit Test Case" : "Add Test Case"}</DialogTitle>
            <DialogDescription>Configure matching parameters and check visibility options.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="tc-input">Input Data (Passed via stdin)</Label>
              <Textarea
                id="tc-input"
                rows={3}
                placeholder="Passed to student code..."
                value={tcInput}
                onChange={(e) => setTcInput(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tc-output">Expected stdout output (Normalized check)</Label>
              <Textarea
                id="tc-output"
                rows={3}
                placeholder="Expected exact print lines..."
                value={tcOutput}
                onChange={(e) => setTcOutput(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <div className="flex items-center justify-between border-t pt-3">
              <div className="space-y-0.5">
                <Label htmlFor="tc-hidden" className="text-xs font-bold">Hidden Test Case</Label>
                <p className="text-[10px] text-muted-foreground">Hidden cases are strictly evaluation-only and never leaked to student clients.</p>
              </div>
              <Switch
                id="tc-hidden"
                checked={tcIsHidden}
                onCheckedChange={setTcIsHidden}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setTcDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveTestCase} disabled={!tcOutput.trim()}>Save Test Case</Button>
          </DialogFooter>
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
