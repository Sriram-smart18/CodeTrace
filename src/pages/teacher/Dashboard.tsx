import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
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
  ShieldAlert, 
  Brain, 
  School, 
  ArrowRight, 
  Plus, 
  Award,
  Calendar,
  AlertTriangle,
  UserCheck,
  Code,
  Bell
} from "lucide-react";
import { motion } from "framer-motion";
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from "recharts";

interface RealtimeLog {
  id: string;
  type: "submission" | "fraud" | "join";
  title: string;
  message: string;
  timestamp: string;
  icon: string;
}

export default function TeacherDashboard() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();

  // Primary States
  const [stats, setStats] = useState({
    classrooms: 0,
    assignments: 0,
    submissions: 0,
    enrolledStudents: 0,
    fraudAlerts: 0,
    todaySubmissions: 0,
  });
  const [recentClassrooms, setRecentClassrooms] = useState<any[]>([]);
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);
  const [realtimeLogs, setRealtimeLogs] = useState<RealtimeLog[]>([]);
  const [analyticsData, setAnalyticsData] = useState<any>({
    classroomPerformance: [],
    submissionTrends: [],
    languageDistribution: [],
    riskAnalysis: []
  });
  const [loading, setLoading] = useState(true);

  // Tab State
  const [activeTab, setActiveTab] = useState("overview");

  const loadData = async () => {
    if (!user) return;
    try {
      // 1. Get teacher's classrooms
      const { data: classrooms, count: classroomCount } = await supabase
        .from("classrooms")
        .select("*", { count: "exact" })
        .eq("teacher_id", user.id)
        .order("created_at", { ascending: false });

      const classroomIds = classrooms?.map(c => c.id) || [];
      setRecentClassrooms((classrooms ?? []).slice(0, 3));

      // 2. Get teacher's assignments
      const { data: assignments, count: assignmentCount } = await supabase
        .from("assignments")
        .select("*", { count: "exact" })
        .eq("created_by", user.id);

      const assignmentIds = assignments?.map((a) => a.id) || [];

      let submissionCount = 0;
      let todayCount = 0;
      let alertCount = 0;
      let recentSubs: any[] = [];
      let fraudRecords: any[] = [];

      // 3. Submissions and fraud counts
      if (assignmentIds.length > 0) {
        // Submissions count
        const { data: subs, count: subCount } = await supabase
          .from("submissions")
          .select("*, assignments(title)")
          .in("assignment_id", assignmentIds)
          .order("submitted_at", { ascending: false });
        
        submissionCount = subCount ?? 0;
        recentSubs = (subs ?? []).slice(0, 5);

        // Submissions today
        const todayStr = new Date().toDateString();
        todayCount = subs?.filter(s => new Date(s.submitted_at).toDateString() === todayStr).length ?? 0;

        // Fraud alerts
        const { data: alerts, count: alertsCount } = await supabase
          .from("fraud_alerts")
          .select("*, assignments(title)")
          .in("assignment_id", assignmentIds)
          .eq("dismissed", false);
        
        alertCount = alertsCount ?? 0;
        fraudRecords = alerts ?? [];
      }

      // 4. Count enrolled students
      let enrolledCount = 0;
      let studentJoins: any[] = [];
      if (classroomIds.length > 0) {
        const { data: enrolledStudentsList, count } = await supabase
          .from("classroom_students")
          .select("*, classrooms(classroom_name)")
          .in("classroom_id", classroomIds)
          .eq("is_active", true)
          .is("deleted_at", null)
          .order("joined_at", { ascending: false });
        
        enrolledCount = count ?? 0;
        studentJoins = enrolledStudentsList ?? [];
      }

      // Set global counters
      setStats({
        classrooms: classroomCount ?? 0,
        assignments: assignmentCount ?? 0,
        submissions: submissionCount,
        enrolledStudents: enrolledCount,
        fraudAlerts: alertCount,
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

      // Map fraud alerts
      fraudRecords.slice(0, 5).forEach((f) => {
        initialLogs.push({
          id: f.id,
          type: "fraud",
          title: "Plagiarism Flagged",
          message: `Suspicious similarity (${f.confidence_score}%) flagged on "${f.assignments?.title || "Assignment"}".`,
          timestamp: f.created_at,
          icon: "shield"
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

      // D. Plagiarism/Risk distribution
      const riskChart = [
        { risk: 'High Plagiarism', count: fraudRecords.filter(f => f.confidence_score >= 80).length },
        { risk: 'Medium Plagiarism', count: fraudRecords.filter(f => f.confidence_score >= 50 && f.confidence_score < 80).length },
        { risk: 'Low Plagiarism', count: fraudRecords.filter(f => f.confidence_score < 50).length },
      ];

      setAnalyticsData({
        classroomPerformance: performanceChart,
        submissionTrends: trendsChart,
        languageDistribution: languageChart,
        riskAnalysis: riskChart
      });

    } catch (error) {
      console.error("Failed to load teacher dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const initializedRef = useRef(false);

  useEffect(() => {
    loadData();

    if (!user) return;
    if (initializedRef.current) return;
    initializedRef.current = true;

    const channelName = `teacher-analytics-${user.id}`;
    let unsubSubmissions = () => {};
    let unsubFraud = () => {};
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

    // Fraud alert changes
    try {
      unsubFraud = subscriptionManager.subscribe(
        channelName,
        "fraud_alerts",
        "INSERT",
        undefined,
        async (payload) => {
          const { data: asg } = await supabase
            .from("assignments")
            .select("title, created_by")
            .eq("id", payload.new.assignment_id)
            .single();

          if (asg?.created_by === user.id) {
            const newLog: RealtimeLog = {
              id: payload.new.id,
              type: "fraud",
              title: "Plagiarism Risk Alert",
              message: `High similarity flagged on "${asg.title}" with a confidence score of ${payload.new.confidence_score}%.`,
              timestamp: new Date().toISOString(),
              icon: "shield"
            };
            setRealtimeLogs(prev => [newLog, ...prev].slice(0, 12));
            loadData();
          }
        }
      );
    } catch (err) {
      console.error("[Realtime] Failed to subscribe to teacher fraud telemetry:", err);
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
      unsubFraud();
      unsubEnrollments();
    };
  }, [user]);

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
      case "shield": return <ShieldAlert className="h-4 w-4 text-red-400" />;
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
        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-xl">
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
          <div className="flex gap-2">
            <Button size="sm" onClick={() => navigate("/teacher/classrooms")} className="font-semibold">
              <Plus className="h-4 w-4 mr-2" /> New Classroom
            </Button>
          </div>
        </motion.div>

        {/* Global Statistics */}
        <motion.div variants={itemVariants} className="grid gap-4 grid-cols-2 lg:grid-cols-6">
          {[
            { label: "Classrooms", value: stats.classrooms, icon: School, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20", link: "/teacher/classrooms" },
            { label: "Assignments", value: stats.assignments, icon: BookOpen, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20", link: "/teacher/classrooms" },
            { label: "Students Size", value: stats.enrolledStudents, icon: Users, color: "text-green-400", bg: "bg-green-500/10 border-green-500/20", link: "/teacher/classrooms" },
            { label: "Submissions", value: stats.submissions, icon: FileText, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20", link: "/teacher/classrooms" },
            { label: "Submissions Today", value: stats.todaySubmissions, icon: Activity, color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20", link: "/teacher/classrooms" },
            { label: "Pending Alerts", value: stats.fraudAlerts, icon: ShieldAlert, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", link: "/teacher/classrooms" },
          ].map((card) => (
            <Card
              key={card.label}
              className="glass-panel hover:border-primary/30 transition-all cursor-pointer"
              onClick={() => navigate(card.link)}
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
          <TabsList className="w-full sm:w-auto bg-black/40 border border-white/10 p-1 rounded-xl">
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
                  <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate("/teacher/classrooms")}>
                    See all classrooms <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
                {recentClassrooms.length === 0 ? (
                  <Card className="glass-panel border-dashed border-primary/20">
                    <CardContent className="py-12 text-center">
                      <p className="text-muted-foreground text-sm mb-3">No classrooms found.</p>
                      <Button size="sm" onClick={() => navigate("/teacher/classrooms")}>Create Classroom</Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {recentClassrooms.map((c) => (
                      <Card
                        key={c.id}
                        className="glass-panel hover:border-white/10 hover:bg-white/[0.005] transition-all cursor-pointer"
                        onClick={() => navigate(`/teacher/classroom/${c.id}`)}
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
                  <div className="space-y-2">
                    {recentSubmissions.map((s) => (
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
                )}
              </motion.div>
            </div>

            {/* Quick Actions */}
            <motion.div variants={itemVariants} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Brain className="h-4.5 w-4.5 text-primary" /> Workspace Operations
              </h2>
              <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
                {[
                  { label: "Manage Labs", icon: School, action: () => navigate("/teacher/classrooms"), color: "border-purple-500/20 hover:border-purple-500/50 hover:bg-purple-500/[0.02]" },
                  { label: "New Classroom", icon: Plus, action: () => navigate("/teacher/classrooms"), color: "border-primary/20 hover:border-primary/50 hover:bg-primary/[0.02]" },
                  { label: "Submissions Log", icon: FileText, action: () => navigate("/teacher/classrooms"), color: "border-cyan-500/20 hover:border-cyan-500/50 hover:bg-cyan-500/[0.02]" },
                  { label: "Fraud Alerts", icon: ShieldAlert, action: () => navigate("/teacher/classrooms"), color: "border-red-500/20 hover:border-red-500/50 hover:bg-red-500/[0.02]" },
                ].map((action) => (
                  <button
                    key={action.label}
                    onClick={action.action}
                    className={`p-4 rounded-2xl border glass-panel text-left transition-all flex flex-col items-start ${action.color}`}
                  >
                    <action.icon className="h-5 w-5 text-muted-foreground mb-3" />
                    <p className="text-sm font-bold text-foreground">{action.label}</p>
                  </button>
                ))}
              </div>
            </motion.div>
          </TabsContent>

          {/* ANALYTICS PANEL */}
          <TabsContent value="analytics" className="space-y-6 mt-6 focus-visible:outline-none">
            <div className="grid gap-6 md:grid-cols-2">
              
              {/* Avg Grades Per Lab */}
              <Card className="glass-panel">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Classroom Performance Average (%)</CardTitle>
                </CardHeader>
                <CardContent>
                  {analyticsData.classroomPerformance.length > 0 ? (
                    <div className="h-[240px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analyticsData.classroomPerformance}>
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

              {/* Submissions trends */}
              <Card className="glass-panel">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Submissions Volume (Last 7 Days)</CardTitle>
                </CardHeader>
                <CardContent>
                  {recentSubmissions.length > 0 ? (
                    <div className="h-[240px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={analyticsData.submissionTrends}>
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

              {/* Languages Used distribution */}
              <Card className="glass-panel">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Assigned Languages Size</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center">
                  {analyticsData.languageDistribution.length > 0 ? (
                    <div className="h-[240px] w-full flex items-center justify-between gap-4">
                      <div className="h-full flex-1">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={analyticsData.languageDistribution}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {analyticsData.languageDistribution.map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-2 shrink-0 pr-8">
                        {analyticsData.languageDistribution.map((entry: any) => (
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

              {/* Fraud Alert metrics */}
              <Card className="glass-panel">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Plagiarism / Similarity Risk Indicators</CardTitle>
                </CardHeader>
                <CardContent>
                  {stats.fraudAlerts > 0 || analyticsData.riskAnalysis.some((r: any) => r.count > 0) ? (
                    <div className="h-[240px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analyticsData.riskAnalysis} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" horizontal={false} />
                          <XAxis type="number" stroke="#6b7280" fontSize={10} tickLine={false} allowDecimals={false} />
                          <YAxis dataKey="risk" type="category" stroke="#6b7280" fontSize={9} tickLine={false} width={100} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: "#0b0f19", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px" }}
                            itemStyle={{ color: "#ef4444", fontSize: "11px" }}
                          />
                          <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} maxBarSize={30} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-[240px] flex items-center justify-center text-xs text-muted-foreground font-mono">No plagiarism records generated. Perfect integrity!</div>
                  )}
                </CardContent>
              </Card>

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
                    className={`p-4 rounded-xl border bg-white/[0.01] border-white/5 hover:border-white/10 transition-all flex items-start gap-4 shadow-sm`}
                  >
                    <div className={`p-2 rounded-xl mt-0.5 shrink-0 ${
                      log.type === "fraud" 
                        ? "bg-red-500/10 border border-red-500/20" 
                        : log.type === "submission" 
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
