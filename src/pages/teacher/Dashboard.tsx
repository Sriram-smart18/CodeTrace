import { useEffect, useState, useMemo, useRef, memo, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { subscriptionManager } from "@/lib/subscriptionManager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Users, 
  BookOpen, 
  FileText, 
  Activity, 
  Brain, 
  School, 
  Plus, 
  UserCheck, 
  Code, 
  Bell 
} from "lucide-react";
import { motion } from "framer-motion";
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from "recharts";

interface RealtimeLog {
  id: string;
  type: "submission" | "join";
  title: string;
  message: string;
  timestamp: string;
  icon: string;
}

type Classroom = Database["public"]["Tables"]["classrooms"]["Row"];

interface ClassroomPerformanceItem {
  name: string;
  average: number;
}

interface SubmissionTrendsItem {
  date: string;
  submissions: number;
}

interface LanguageDistributionItem {
  name: string;
  value: number;
  color: string;
}

interface DashboardSubmission {
  id: string;
  assignment_id: string;
  student_id: string;
  status: string;
  submitted_at: string;
  score: number | null;
  assignments: {
    title: string;
  } | null;
}

interface StudentJoinEvent {
  id: string;
  student_id: string;
  classroom_id: string;
  joined_at: string;
  classrooms: {
    classroom_name: string;
  } | null;
}

interface AnalyticsData {
  classroomPerformance: ClassroomPerformanceItem[];
  submissionTrends: SubmissionTrendsItem[];
  languageDistribution: LanguageDistributionItem[];
}

// stand-alone sub-components to prevent unnecessary chart and list re-renders
const ClassroomPerformanceChart = memo(({ data }: { data: ClassroomPerformanceItem[] }) => {
  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Classroom Performance Average (%)</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                <XAxis dataKey="name" stroke="#6b7280" fontSize={10} tickLine={false} />
                <YAxis stroke="#6b7280" fontSize={10} tickLine={false} domain={[0, 100]} />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#0b0f19", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px" }}
                  labelStyle={{ fontSize: "10px", color: "#9ca3af" }}
                  itemStyle={{ color: "#3B82F6", fontSize: "11px" }}
                />
                <Bar dataKey="average" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[240px] flex items-center justify-center text-xs text-muted-foreground font-mono">No grade data available.</div>
        )}
      </CardContent>
    </Card>
  );
});
ClassroomPerformanceChart.displayName = "ClassroomPerformanceChart";

const SubmissionTrendsChart = memo(({ data, hasSubmissions }: { data: SubmissionTrendsItem[]; hasSubmissions: boolean }) => {
  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Submissions Volume (Last 7 Days)</CardTitle>
      </CardHeader>
      <CardContent>
        {hasSubmissions ? (
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                <XAxis dataKey="date" stroke="#6b7280" fontSize={10} tickLine={false} />
                <YAxis stroke="#6b7280" fontSize={10} tickLine={false} allowDecimals={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#0b0f19", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px" }}
                  labelStyle={{ fontSize: "10px", color: "#9ca3af" }}
                  itemStyle={{ color: "#10b981", fontSize: "11px" }}
                />
                <Line type="monotone" dataKey="submissions" stroke="#10b981" strokeWidth={2.5} dot={{ fill: "#10b981", r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[240px] flex items-center justify-center text-xs text-muted-foreground font-mono">No submissions recorded.</div>
        )}
      </CardContent>
    </Card>
  );
});
SubmissionTrendsChart.displayName = "SubmissionTrendsChart";

const LanguageDistributionChart = memo(({ data }: { data: LanguageDistributionItem[] }) => {
  return (
    <Card className="glass-panel md:col-span-2">
      <CardHeader>
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Assigned Languages Size</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center">
        {data.length > 0 ? (
          <div className="h-[240px] w-full flex items-center justify-between gap-4">
            <div className="h-full flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {data.map((entry: LanguageDistributionItem, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 shrink-0 pr-8">
              {data.map((entry: LanguageDistributionItem) => (
                <div key={entry.name} className="flex items-center gap-2 text-xs">
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                  <span className="font-bold text-foreground font-mono">{entry.name}:</span>
                  <span className="text-muted-foreground">{entry.value} assignment(s)</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="h-[240px] flex items-center justify-center text-xs text-muted-foreground font-mono w-full">No active languages.</div>
        )}
      </CardContent>
    </Card>
  );
});
LanguageDistributionChart.displayName = "LanguageDistributionChart";

const RecentClassroomsList = memo(({ classrooms }: { classrooms: Classroom[] }) => {
  return (
    <div className="space-y-2">
      {classrooms.map((c) => (
        <Card
          key={c.id}
          className="glass-panel transition-all"
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div className="min-w-0 flex-1 pr-4">
              <p className="font-bold text-sm text-foreground truncate">{c.classroom_name}</p>
              <p className="text-xs text-muted-foreground truncate">{c.subject_name}</p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <span className="font-mono text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded-md">{c.classroom_code}</span>
              <Badge variant={c.is_active ? "default" : "secondary"} className="text-[10px]">
                {c.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
});
RecentClassroomsList.displayName = "RecentClassroomsList";

const RecentSubmissionsList = memo(({ submissions }: { submissions: DashboardSubmission[] }) => {
  return (
    <div className="space-y-2">
      {submissions.map((s) => (
        <div key={s.id} className="flex items-center justify-between p-3.5 glass-panel bg-card/30 rounded-xl">
          <div className="min-w-0 pr-4">
            <p className="text-sm font-bold text-foreground truncate">{s.assignments?.title || "Assignment"}</p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{new Date(s.submitted_at).toLocaleString()}</p>
          </div>
          <Badge 
            variant={s.status === "evaluated" ? "default" : s.status === "flagged" ? "destructive" : "secondary"}
            className="capitalize text-xs font-bold shrink-0"
          >
            {s.status}
          </Badge>
        </div>
      ))}
    </div>
  );
});
RecentSubmissionsList.displayName = "RecentSubmissionsList";

export default function TeacherDashboard() {
  const { profile, user } = useAuth();

  // Primary States
  const [stats, setStats] = useState({
    classrooms: 0,
    assignments: 0,
    submissions: 0,
    enrolledStudents: 0,
    todaySubmissions: 0,
  });
  const [recentClassrooms, setRecentClassrooms] = useState<Classroom[]>([]);
  const [recentSubmissions, setRecentSubmissions] = useState<DashboardSubmission[]>([]);
  const [realtimeLogs, setRealtimeLogs] = useState<RealtimeLog[]>([]);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData>({
    classroomPerformance: [],
    submissionTrends: [],
    languageDistribution: []
  });
  const [loading, setLoading] = useState(true);

  // Tab State
  const [activeTab, setActiveTab] = useState("overview");

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      // Phase 1: Fetch classrooms and assignments in parallel to minimize Supabase roundtrips
      const [classroomsResult, assignmentsResult] = await Promise.all([
        supabase
          .from("classrooms")
          .select("*", { count: "exact" })
          .eq("teacher_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("assignments")
          .select("*", { count: "exact" })
          .eq("created_by", user.id)
      ]);

      const classrooms = classroomsResult.data;
      const classroomCount = classroomsResult.count;
      const classroomIds = classrooms?.map(c => c.id) || [];
      setRecentClassrooms((classrooms ?? []).slice(0, 3));

      const assignments = assignmentsResult.data;
      const assignmentCount = assignmentsResult.count;
      const assignmentIds = assignments?.map((a) => a.id) || [];

      let submissionCount = 0;
      let todayCount = 0;
      let recentSubs: DashboardSubmission[] = [];
      let enrolledCount = 0;
      let studentJoins: StudentJoinEvent[] = [];

      // Phase 2: Fetch submissions and student enrollments in parallel
      const queries: PromiseLike<{ data: unknown; count: number | null }>[] = [];

      if (assignmentIds.length > 0) {
        queries.push(
          supabase
            .from("submissions")
            .select("*, assignments(title)")
            .in("assignment_id", assignmentIds)
            .order("submitted_at", { ascending: false })
        );
      } else {
        queries.push(Promise.resolve({ data: null, count: 0 }));
      }

      if (classroomIds.length > 0) {
        queries.push(
          supabase
            .from("classroom_students")
            .select("*, classrooms(classroom_name)")
            .in("classroom_id", classroomIds)
            .eq("is_active", true)
            .is("deleted_at", null)
            .order("joined_at", { ascending: false })
        );
      } else {
        queries.push(Promise.resolve({ data: null, count: 0 }));
      }

      const [subsResult, enrolledResult] = (await Promise.all(queries)) as [
        { data: DashboardSubmission[] | null; count: number | null },
        { data: StudentJoinEvent[] | null; count: number | null }
      ];

      if (assignmentIds.length > 0 && subsResult?.data) {
        const subs = subsResult.data;
        const subCount = subsResult.count;
        submissionCount = subCount ?? subs.length ?? 0;
        recentSubs = (subs ?? []).slice(0, 5);

        const todayStr = new Date().toDateString();
        todayCount = subs?.filter(s => new Date(s.submitted_at).toDateString() === todayStr).length ?? 0;
      }

      if (classroomIds.length > 0 && enrolledResult?.data) {
        const enrolledStudentsList = enrolledResult.data;
        const count = enrolledResult.count;
        enrolledCount = count ?? enrolledStudentsList.length ?? 0;
        studentJoins = enrolledStudentsList ?? [];
      }

      // Set global counters
      setStats({
        classrooms: classroomCount ?? 0,
        assignments: assignmentCount ?? 0,
        submissions: submissionCount,
        enrolledStudents: enrolledCount,
        todaySubmissions: todayCount,
      });
      setRecentSubmissions(recentSubs);

      // 5. Prepopulate Realtime Logs from DB
      const initialLogs: RealtimeLog[] = [];
      
      // Map submissions
      recentSubs.forEach((s) => {
        initialLogs.push({
          id: s.id,
          type: "submission",
          title: "Code Submitted",
          message: `Submission received for "${s.assignments?.title || "Assignment"}" with status ${s.status}.`,
          timestamp: s.submitted_at,
          icon: "code"
        });
      });

      // Map student joins
      studentJoins.slice(0, 5).forEach((j) => {
        initialLogs.push({
          id: j.id,
          type: "join",
          title: "Student Enrolled",
          message: `New student enrolled in "${j.classrooms?.classroom_name || "Classroom"}".`,
          timestamp: j.joined_at,
          icon: "user"
        });
      });

      // Sort combined initial logs by timestamp descending
      const sortedLogs = initialLogs
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 10);
      
      setRealtimeLogs(sortedLogs);

      // 6. Aggregate Analytics Data
      // A. Classroom Performance: Average score per classroom
      const classPerformance: Record<string, { totalScore: number; count: number; name: string }> = {};
      classrooms?.forEach(c => {
        classPerformance[c.id] = { totalScore: 0, count: 0, name: c.classroom_name };
      });

      recentSubs.forEach(s => {
        const matchingClassId = assignments?.find(a => a.id === s.assignment_id)?.classroom_id;
        if (matchingClassId && classPerformance[matchingClassId] && s.score !== null) {
          classPerformance[matchingClassId].totalScore += s.score;
          classPerformance[matchingClassId].count += 1;
        }
      });

      const performanceChart = Object.values(classPerformance).map(cp => ({
        name: cp.name.length > 12 ? cp.name.substring(0, 12) + "..." : cp.name,
        average: cp.count > 0 ? Math.round(cp.totalScore / cp.count) : 0,
      }));

      // B. Submission trends: Count submissions grouped by date (last 7 days)
      const last7Days: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        last7Days[d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })] = 0;
      }

      recentSubs.forEach(s => {
        const dateKey = new Date(s.submitted_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        if (dateKey in last7Days) {
          last7Days[dateKey] += 1;
        }
      });

      const trendsChart = Object.entries(last7Days).map(([date, count]) => ({
        date,
        submissions: count,
      }));

      // C. Languages used
      const langCount: Record<string, number> = {};
      assignments?.forEach(a => {
        if (a.language) {
          langCount[a.language] = (langCount[a.language] || 0) + 1;
        }
      });

      const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
      const languageChart = Object.entries(langCount).map(([lang, count], index) => ({
        name: lang.toUpperCase(),
        value: count,
        color: COLORS[index % COLORS.length]
      }));

      setAnalyticsData({
        classroomPerformance: performanceChart,
        submissionTrends: trendsChart,
        languageDistribution: languageChart
      });

    } catch (error) {
      console.error("Failed to load teacher dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const initializedRef = useRef(false);

  useEffect(() => {
    loadData();

    if (!user) return;
    if (initializedRef.current) return;
    initializedRef.current = true;

    const channelName = `teacher-analytics-${user.id}`;
    let unsubSubmissions = () => {};
    let unsubEnrollments = () => {};

    // Submissions changes
    try {
      unsubSubmissions = subscriptionManager.subscribe(
        channelName,
        "submissions",
        "*",
        undefined,
        async (payload) => {
          if (payload.eventType === "INSERT") {
            const { data: asg } = await supabase
              .from("assignments")
              .select("title, created_by")
              .eq("id", payload.new.assignment_id)
              .single();

            if (asg?.created_by === user.id) {
              const newLog: RealtimeLog = {
                id: payload.new.id,
                type: "submission",
                title: "Live submission received",
                message: `New code submitted for assignment "${asg.title}".`,
                timestamp: new Date().toISOString(),
                icon: "code"
              };
              setRealtimeLogs(prev => [newLog, ...prev].slice(0, 12));
              loadData();
            }
          }
        }
      );
    } catch (err) {
      console.error("[Realtime] Failed to subscribe to teacher submissions telemetry:", err);
    }

    // Enrollments changes
    try {
      unsubEnrollments = subscriptionManager.subscribe(
        channelName,
        "classroom_students",
        "INSERT",
        undefined,
        async (payload) => {
          const { data: room } = await supabase
            .from("classrooms")
            .select("classroom_name, teacher_id")
            .eq("id", payload.new.classroom_id)
            .single();

          if (room?.teacher_id === user.id) {
            const { data: prof } = await supabase
              .from("profiles")
              .select("name")
              .eq("user_id", payload.new.student_id)
              .single();

            const newLog: RealtimeLog = {
              id: payload.new.id,
              type: "join",
              title: "Student Join Event",
              message: `${prof?.name || "A new student"} just enrolled in "${room.classroom_name}".`,
              timestamp: new Date().toISOString(),
              icon: "user"
            };
            setRealtimeLogs(prev => [newLog, ...prev].slice(0, 12));
            loadData();
          }
        }
      );
    } catch (err) {
      console.error("[Realtime] Failed to subscribe to teacher enrollments telemetry:", err);
    }

    return () => {
      initializedRef.current = false;
      unsubSubmissions();
      unsubEnrollments();
    };
  }, [user, loadData]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
  };

  const itemVariants = {
    hidden: { y: 15, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { type: "spring" as const, stiffness: 260, damping: 22 } },
  };

  const renderLogIcon = (iconType: string) => {
    switch (iconType) {
      case "code": return <Code className="h-4 w-4 text-primary" />;
      case "user": return <UserCheck className="h-4 w-4 text-green-400" />;
      default: return <Bell className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (loading) {
    return (
      <DashboardLayout role="teacher">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="space-y-4 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary mx-auto"></div>
            <p className="text-sm text-muted-foreground font-mono">Loading telemetry aggregates...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="teacher">
      <motion.div
        className="space-y-6 max-w-[1400px] mx-auto"
        initial="hidden"
        animate="visible"
        variants={containerVariants}
      >
        {/* Title bar */}
        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-border dark:border-white/5 bg-card/50 dark:bg-white/[0.02] backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-primary text-sm shadow-inner shadow-primary/20">
              CT
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                Teacher Control Panel
                <Badge variant="outline" className="border-green-500/30 text-green-400 bg-green-500/5 animate-pulse text-[10px]">
                  Realtime Active
                </Badge>
              </h1>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">Welcome, {profile?.name}</p>
            </div>
          </div>
        </motion.div>

        {/* Global Statistics */}
        <motion.div variants={itemVariants} className="grid gap-4 grid-cols-2 lg:grid-cols-5">
          {[
            { label: "Classrooms", value: stats.classrooms, icon: School, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
            { label: "Assignments", value: stats.assignments, icon: BookOpen, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
            { label: "Students Size", value: stats.enrolledStudents, icon: Users, color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
            { label: "Submissions", value: stats.submissions, icon: FileText, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
            { label: "Submissions Today", value: stats.todaySubmissions, icon: Activity, color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
          ].map((card) => (
            <Card
              key={card.label}
              className="glass-panel transition-all"
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
                <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{card.label}</CardTitle>
                <div className={`p-1.5 ${card.bg} rounded-lg border`}>
                  <card.icon className={`h-3.5 w-3.5 ${card.color}`} />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl font-bold tracking-tight">{card.value}</div>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        {/* Dynamic Panels */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full sm:w-auto bg-muted/80 dark:bg-black/40 border border-border dark:border-white/10 p-1 rounded-xl">
            <TabsTrigger value="overview" className="rounded-lg text-xs py-2 px-4">Workspace Overview</TabsTrigger>
            <TabsTrigger value="analytics" className="rounded-lg text-xs py-2 px-4">Analytics Insights</TabsTrigger>
            <TabsTrigger value="activity_logs" className="rounded-lg text-xs py-2 px-4 flex gap-1.5 items-center">
              Realtime Logs
              <span className="h-2 w-2 rounded-full bg-green-500 animate-ping" />
            </TabsTrigger>
          </TabsList>

          {/* OVERVIEW PANEL */}
          <TabsContent value="overview" className="space-y-6 mt-6 focus-visible:outline-none">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Classrooms */}
              <motion.div variants={itemVariants} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <School className="h-4.5 w-4.5 text-primary" /> Active Classrooms
                  </h2>
                </div>
                {recentClassrooms.length === 0 ? (
                  <Card className="glass-panel border-dashed border-primary/20">
                    <CardContent className="py-12 text-center">
                      <p className="text-muted-foreground text-sm">No classrooms found.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <RecentClassroomsList classrooms={recentClassrooms} />
                )}
              </motion.div>

              {/* Submissions */}
              <motion.div variants={itemVariants} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <FileText className="h-4.5 w-4.5 text-cyan-400" /> Recent Submissions
                  </h2>
                </div>
                {recentSubmissions.length === 0 ? (
                  <Card className="glass-panel">
                    <CardContent className="py-12 text-center text-muted-foreground">
                      No code submissions received yet.
                    </CardContent>
                  </Card>
                ) : (
                  <RecentSubmissionsList submissions={recentSubmissions} />
                )}
              </motion.div>
            </div>

            {/* Quick Actions */}
            <motion.div variants={itemVariants} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Brain className="h-4.5 w-4.5 text-primary" /> Workspace Operations
              </h2>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
                {[
                  { label: "Manage Labs", icon: School, color: "border-purple-500/20" },
                  { label: "New Classroom", icon: Plus, color: "border-primary/20" },
                  { label: "Submissions Log", icon: FileText, color: "border-cyan-500/20" },
                ].map((action) => (
                  <div
                    key={action.label}
                    className={`p-4 rounded-2xl border glass-panel text-left transition-all flex flex-col items-start ${action.color}`}
                  >
                    <action.icon className="h-5 w-5 text-muted-foreground mb-3" />
                    <p className="text-sm font-bold text-foreground">{action.label}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </TabsContent>

          {/* ANALYTICS PANEL */}
          <TabsContent value="analytics" className="space-y-6 mt-6 focus-visible:outline-none">
            <div className="grid gap-6 md:grid-cols-2">
              
              {/* Avg Grades Per Lab */}
              <ClassroomPerformanceChart data={analyticsData.classroomPerformance} />

              {/* Submissions trends */}
              <SubmissionTrendsChart data={analyticsData.submissionTrends} hasSubmissions={recentSubmissions.length > 0} />

              {/* Languages Used distribution */}
              <LanguageDistributionChart data={analyticsData.languageDistribution} />

            </div>
          </TabsContent>

          {/* REALTIME LOGS PANEL */}
          <TabsContent value="activity_logs" className="space-y-4 mt-6 focus-visible:outline-none">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4 text-green-400" /> Live Classroom Streams
              </h2>
              <Badge variant="outline" className="border-green-500/30 text-green-400 bg-green-500/5 animate-pulse text-[10px]">
                Listening live
              </Badge>
            </div>

            {realtimeLogs.length === 0 ? (
              <Card className="glass-panel">
                <CardContent className="py-16 text-center text-muted-foreground space-y-2">
                  <Activity className="h-10 w-10 text-muted-foreground opacity-20 mx-auto mb-2" />
                  <p className="text-sm font-semibold">Streams Idle</p>
                  <p className="text-xs">No active evaluations, logins, or enrollment logs found in current context.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {realtimeLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-4 rounded-xl border bg-card/20 dark:bg-white/[0.01] border-border dark:border-white/5 hover:border-border/80 dark:hover:border-white/10 transition-all flex items-start gap-4 shadow-sm`}
                  >
                    <div className={`p-2 rounded-xl mt-0.5 shrink-0 ${
                      log.type === "submission" 
                        ? "bg-primary/10 border border-primary/20" 
                        : "bg-green-500/10 border border-green-500/20"
                    }`}>
                      {renderLogIcon(log.icon)}
                    </div>
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-foreground">{log.title}</p>
                        <span className="text-[10px] text-muted-foreground/60 font-mono">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed pr-4">{log.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </motion.div>
    </DashboardLayout>
  );
}
