import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { 
  FileDown, 
  Printer, 
  Search, 
  FileSpreadsheet, 
  Brain, 
  Activity, 
  CheckCircle2, 
  TrendingUp,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Loader2
} from "lucide-react";
import { useReportsQuery } from "@/hooks/useAnalyticsQueries";

export default function TeacherReports() {
  const { user } = useAuth();
  
  // Filtering States
  const [selectedClassroom, setSelectedClassroom] = useState<string>("");
  const [selectedAssignment, setSelectedAssignment] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [reportType, setReportType] = useState<"performance" | "ai" | "activity">("performance");
  
  const limit = 15;

  // 1. Fetch Teacher Classrooms for dropdown
  const { data: classrooms } = useQuery({
    queryKey: ["teacher-classrooms-list", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("classrooms")
        .select("id, classroom_name")
        .eq("teacher_id", user?.id || "");
      return data || [];
    },
    enabled: !!user?.id,
  });

  // 2. Fetch Assignments for dropdown
  const { data: assignments } = useQuery({
    queryKey: ["teacher-assignments-list", user?.id, selectedClassroom],
    queryFn: async () => {
      let q = supabase
        .from("assignments")
        .select("id, title")
        .eq("created_by", user?.id || "");
      if (selectedClassroom) {
        q = q.eq("classroom_id", selectedClassroom);
      }
      const { data } = await q;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // 3. Fetch Paginated Reports using React Query
  const { data, isLoading } = useReportsQuery(user?.id, {
    classroomId: selectedClassroom || undefined,
    assignmentId: selectedAssignment || undefined,
    search: searchQuery || undefined,
    page,
    limit,
  });

  const reportItems = useMemo(() => data?.data || [], [data?.data]);
  const totalCount = data?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / limit);

  // 4. Calculate Aggregate Metrics for Header
  const stats = useMemo(() => {
    if (reportItems.length === 0) return { avgScore: 0, completionRate: 0, highRiskCount: 0, total: 0 };
    const scores = reportItems.map(r => r.score).filter((s): s is number => s !== null);
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    
    const completed = reportItems.filter(r => r.status === "graded" || r.status === "completed").length;
    const completionRate = Math.round((completed / reportItems.length) * 100);

    const highRiskCount = reportItems.filter(r => r.risk_level === "high").length;

    return {
      avgScore,
      completionRate,
      highRiskCount,
      total: totalCount
    };
  }, [reportItems, totalCount]);

  // ── CSV Export Engine ──
  const exportCSV = () => {
    if (reportItems.length === 0) return;

    // Header matching columns
    const headers = [
      "Student Name",
      "Student UID",
      "Email Address",
      "Assignment Title",
      "Status",
      "Evaluation Score",
      "Submission Date",
      "Plagiarism Index (%)",
      "AI Risk Rating"
    ];

    // Build row lines with proper string escapes
    const rows = reportItems.map(item => [
      `"${item.student_name.replace(/"/g, '""')}"`,
      `"${item.student_uid.replace(/"/g, '""')}"`,
      `"${item.email.replace(/"/g, '""')}"`,
      `"${item.assignment_title.replace(/"/g, '""')}"`,
      `"${item.status.toUpperCase()}"`,
      item.score !== null ? item.score : "—",
      `"${new Date(item.submitted_at).toLocaleString()}"`,
      item.plagiarism_score !== null ? `${item.plagiarism_score}%` : "0%",
      `"${item.risk_level.toUpperCase()}"`
    ]);

    // Prepend UTF-8 BOM so MS Excel reads symbols correctly
    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `CodeTrace_Report_${reportType}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ── Print / PDF Generation Trigger ──
  const triggerPrint = () => {
    window.print();
  };

  return (
    <DashboardLayout role="teacher">
      {/* Printable CSS Page Breaks rules */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * {
            visibility: hidden;
            background: transparent !important;
            color: black !important;
            box-shadow: none !important;
          }
          #print-area, #print-area * {
            visibility: visible;
          }
          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print {
            display: none !important;
          }
          .page-break {
            page-break-before: always;
          }
          .card {
            border: 1px solid #ddd !important;
            page-break-inside: avoid;
          }
        }
      `}} />

      <div id="print-area" className="space-y-6 max-w-7xl mx-auto">
        {/* Header Block */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              Observability Reports Engine
              <Badge variant="outline" className="border-primary/30 text-primary font-mono text-xs">Phase 4</Badge>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Exportable educational analytics, AI risk models, and student logs</p>
          </div>
          
          <div className="flex items-center gap-2 no-print">
            <Button
              variant="outline"
              size="sm"
              onClick={exportCSV}
              disabled={reportItems.length === 0}
              className="border-white/10 hover:bg-white/5 text-xs font-mono gap-1.5 h-9"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-400" /> Export CSV
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={triggerPrint}
              disabled={reportItems.length === 0}
              className="bg-primary hover:bg-primary/95 text-xs font-mono gap-1.5 h-9"
            >
              <Printer className="h-4 w-4" /> Print / Save PDF
            </Button>
          </div>
        </div>

        {/* Aggregates Dashboard Row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="glass-panel card">
            <CardContent className="pt-5 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase font-mono">Submissions Scoped</p>
                <div className="text-2xl font-bold">{stats.total}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/10">
                <Activity className="h-5 w-5 text-blue-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel card">
            <CardContent className="pt-5 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase font-mono">Average Evaluation</p>
                <div className="text-2xl font-bold">{stats.avgScore} <span className="text-xs text-muted-foreground font-normal">/100</span></div>
              </div>
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/10">
                <TrendingUp className="h-5 w-5 text-emerald-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel card">
            <CardContent className="pt-5 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase font-mono">Completion Rate</p>
                <div className="text-2xl font-bold">{stats.completionRate}%</div>
              </div>
              <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/10">
                <CheckCircle2 className="h-5 w-5 text-purple-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel card">
            <CardContent className="pt-5 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase font-mono">High Plagiarism Risk</p>
                <div className="text-2xl font-bold">{stats.highRiskCount}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/10">
                <AlertTriangle className="h-5 w-5 text-red-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter Ribbon no-print */}
        <div className="grid gap-3 md:grid-cols-4 items-center bg-card/40 border border-white/5 p-4 rounded-xl no-print">
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-mono text-muted-foreground">Classroom Filter</label>
            <select
              value={selectedClassroom}
              onChange={(e) => {
                setSelectedClassroom(e.target.value);
                setSelectedAssignment("");
                setPage(1);
              }}
              className="w-full bg-background border border-white/10 rounded-lg px-3 py-1.5 text-xs text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
            >
              <option value="">All Classrooms</option>
              {classrooms?.map((c) => (
                <option key={c.id} value={c.id}>{c.classroom_name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-mono text-muted-foreground">Assignment Filter</label>
            <select
              value={selectedAssignment}
              onChange={(e) => {
                setSelectedAssignment(e.target.value);
                setPage(1);
              }}
              className="w-full bg-background border border-white/10 rounded-lg px-3 py-1.5 text-xs text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
            >
              <option value="">All Assignments</option>
              {assignments?.map((a) => (
                <option key={a.id} value={a.id}>{a.title}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label className="text-[10px] uppercase font-mono text-muted-foreground">Fuzzy Search Student</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
              <Input
                placeholder="grep student name, ID or code..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="pl-9 h-8.5 bg-background border-white/10 text-xs rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* Tab Selection Ribbon */}
        <div className="flex border-b border-white/5 no-print gap-4">
          {(["performance", "ai", "activity"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setReportType(tab);
                setPage(1);
              }}
              className={`pb-3 text-xs uppercase font-mono font-bold border-b-2 px-1 transition-all ${
                reportType === tab 
                  ? "border-primary text-foreground" 
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "performance" && "Student Performance Report"}
              {tab === "ai" && "AI & Plagiarism Audit"}
              {tab === "activity" && "Classroom Code Activity"}
            </button>
          ))}
        </div>

        {/* Main Report Table Area */}
        <Card className="glass-panel overflow-hidden card">
          <div className="overflow-x-auto min-h-[300px]">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground font-mono">Assembling Observability Snapshot...</p>
              </div>
            ) : reportItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center space-y-2">
                <Brain className="h-10 w-10 text-muted-foreground/20" />
                <h3 className="text-sm font-semibold">No reportable snapshots</h3>
                <p className="text-xs text-muted-foreground">Try adjusting your workspace filters or fuzzy search keywords.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-muted/40 border-b border-white/5 font-mono text-[10px] text-muted-foreground uppercase">
                    <th className="p-4">Student</th>
                    <th className="p-4">Assignment</th>
                    {reportType === "performance" && (
                      <>
                        <th className="p-4 text-center">Status</th>
                        <th className="p-4 text-center">AI Score</th>
                        <th className="p-4">Submitted At</th>
                      </>
                    )}
                    {reportType === "ai" && (
                      <>
                        <th className="p-4 text-center">Copy Count</th>
                        <th className="p-4 text-center">Plagiarism Index</th>
                        <th className="p-4 text-center">Integrity Rating</th>
                        <th className="p-4">Risk Level</th>
                      </>
                    )}
                    {reportType === "activity" && (
                      <>
                        <th className="p-4 text-center">Editor focus time</th>
                        <th className="p-4 text-center">Typing active</th>
                        <th className="p-4 text-center">Deletions</th>
                        <th className="p-4">Coding speed</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {reportItems.map((item) => (
                    <tr key={item.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-4">
                        <div>
                          <p className="font-semibold text-foreground">{item.student_name}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{item.student_uid} · {item.email}</p>
                        </div>
                      </td>
                      <td className="p-4 font-medium">{item.assignment_title}</td>

                      {/* Performance Report Tab */}
                      {reportType === "performance" && (
                        <>
                          <td className="p-4 text-center">
                            <Badge 
                              variant="outline" 
                              className={`text-[9px] uppercase font-mono ${
                                item.status === "graded" || item.status === "completed"
                                  ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/5"
                                  : "border-yellow-500/30 text-yellow-400 bg-yellow-500/5"
                              }`}
                            >
                              {item.status}
                            </Badge>
                          </td>
                          <td className="p-4 text-center font-bold font-mono text-sm">
                            {item.score !== null ? (
                              <span className={item.score > 80 ? "text-emerald-400" : item.score > 60 ? "text-yellow-400" : "text-red-400"}>
                                {item.score}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="p-4 text-muted-foreground font-mono text-[10px]">
                            {new Date(item.submitted_at).toLocaleString()}
                          </td>
                        </>
                      )}

                      {/* AI Plagiarism tab */}
                      {reportType === "ai" && (
                        <>
                          <td className="p-4 text-center font-mono">
                            {(item.behavioral_summary as any)?.paste_count || 0} times
                          </td>
                          <td className="p-4 text-center font-mono font-bold">
                            <span className={item.plagiarism_score && item.plagiarism_score > 60 ? "text-red-400" : "text-emerald-400"}>
                              {item.plagiarism_score || 0}%
                            </span>
                          </td>
                          <td className="p-4 text-center font-mono capitalize">
                            {item.risk_level === "high" ? (
                              <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[9px] uppercase">FRAUD RISK</Badge>
                            ) : (
                              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[9px] uppercase">SECURE PASS</Badge>
                            )}
                          </td>
                          <td className="p-4">
                            <span className={`text-[10px] font-mono uppercase ${
                              item.risk_level === "high" ? "text-red-400" : item.risk_level === "medium" ? "text-yellow-400" : "text-emerald-400"
                            }`}>
                              ● {item.risk_level} risk
                            </span>
                          </td>
                        </>
                      )}

                      {/* Code Activity Metrics */}
                      {reportType === "activity" && (
                        <>
                          <td className="p-4 text-center font-mono text-muted-foreground">
                            {(item.behavioral_summary as any)?.submission_duration || 0}s
                          </td>
                          <td className="p-4 text-center font-mono text-muted-foreground">
                            {(item.behavioral_summary as any)?.total_typing_time || 0}s
                          </td>
                          <td className="p-4 text-center font-mono text-muted-foreground">
                            {(item.behavioral_summary as any)?.deletion_frequency || 0}
                          </td>
                          <td className="p-4 font-mono text-foreground font-semibold">
                            {(item.behavioral_summary as any)?.typing_speed_estimate || 0} cpm
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Table Server-Side Pagination Footer */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-white/5 px-4 py-3.5 no-print">
              <span className="text-[10px] text-muted-foreground font-mono">
                Showing page {page} of {totalPages} ({totalCount} items)
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="h-8 w-8 border-white/10 hover:bg-white/5"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="h-8 w-8 border-white/10 hover:bg-white/5"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
