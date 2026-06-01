import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { realtimeManager } from "@/lib/realtimeManager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  BookOpen, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  Code, 
  Activity, 
  Award, 
  School, 
  ArrowRight, 
  Plus, 
  Bell, 
  Check, 
  Search, 
  Calendar, 
  ShieldAlert, 
  ChevronLeft, 
  ChevronRight,
  User,
  Brain,
  Timer
} from "lucide-react";
import { motion } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useStudentProgressQuery } from "@/hooks/useAnalyticsQueries";

interface AssignmentWithClassroom {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  classroom_id: string | null;
  language: string | null;
  difficulty: string | null;
  total_marks: number;
  classrooms: { classroom_name: string; subject_name: string; teacher_id: string } | null;
}

export default function StudentDashboard() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();

  // Load Student Progress & Streaks via React Query
  const { data: studentProgress } = useStudentProgressQuery(user?.id);

  // Primary states
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<AssignmentWithClassroom[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Tabs & pagination states
  const [activeTab, setActiveTab] = useState("overview");
  const [assignmentSubTab, setAssignmentSubTab] = useState<"active" | "completed" | "overdue">("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClassroomId, setSelectedClassroomId] = useState("all");
  const [selectedLanguage, setSelectedLanguage] = useState("all");
  
  // Pagination
  const [asgPage, setAsgPage] = useState(1);
  const [notifPage, setNotifPage] = useState(1);
  const itemsPerPage = 5;

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Get classroom enrollments
      const { data: enrollments } = await supabase
        .from("classroom_students")
        .select("classroom_id, joined_at")
        .eq("student_id", user.id)
        .eq("is_active", true)
        .is("deleted_at", null);

      const classroomIds = enrollments?.map((e) => e.classroom_id) || [];

      if (classroomIds.length > 0) {
        // 2. Fetch classroom details
        const { data: rooms } = await supabase
          .from("classrooms")
          .select("*")
          .in("id", classroomIds)
          .eq("is_active", true)
          .order("created_at", { ascending: false });
        
        const enrichedRooms = (rooms || []).map(r => {
          const matchingEnrollment = enrollments?.find(e => e.classroom_id === r.id);
          return {
            ...r,
            joined_at: matchingEnrollment?.joined_at
          };
        });
        setClassrooms(enrichedRooms);

        // 3. Load permitted assignments (RLS will automatically restrict private assignments)
        const { data: asgns } = await supabase
          .from("assignments")
          .select("*, classrooms(classroom_name, subject_name, teacher_id)")
          .in("classroom_id", classroomIds)
          .order("due_date", { ascending: true });
        
        setAssignments((asgns ?? []) as AssignmentWithClassroom[]);

        // 4. Load submissions
        const { data: subs } = await supabase
          .from("submissions")
          .select("*")
          .eq("student_id", user.id)
          .order("submitted_at", { ascending: false });
        setSubmissions(subs ?? []);

        // 5. Fetch teachers' names
        const teacherIds = Array.from(new Set((rooms || []).map(r => r.teacher_id).filter(Boolean)));
        if (teacherIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, name")
            .in("user_id", teacherIds);
          
          const teacherMap: Record<string, string> = {};
          profiles?.forEach((p) => {
            teacherMap[p.user_id] = p.name;
          });
          setTeachers(teacherMap);
        }
      } else {
        setClassrooms([]);
        setAssignments([]);
        setSubmissions([]);
      }

      // 6. Fetch user notifications
      const { data: notifs } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setNotifications(notifs ?? []);

    } catch (error) {
      console.error("Failed to load student dashboard:", error);
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

    const channelName = `notifications-${user.id}`;
    const key = `student-dashboard-notifs-${user.id}`;

    try {
      realtimeManager.subscribeToChannel({
        key,
        channelName,
        config: {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        callback: () => {
          // Quick reload notifications
          supabase
            .from("notifications")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .then(({ data }) => {
              if (data) setNotifications(data);
            });
        }
      });
    } catch (error) {
      console.error("[Realtime] Failed to subscribe to student notifications:", error);
    }

    return () => {
      initializedRef.current = false;
      realtimeManager.unsubscribeChannel(key);
    };
  }, [user]);

  const handleMarkAllRead = async () => {
    if (!user || notifications.filter(n => !n.read).length === 0) return;
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);
    
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleMarkRead = async (id: string) => {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  // Helper stats
  const getSubmission = (assignmentId: string) => submissions.find((s) => s.assignment_id === assignmentId);

  const stats = useMemo(() => {
    const totalClassrooms = classrooms.length;
    const submittedIds = submissions.map((s) => s.assignment_id);
    
    // An assignment is pending if it is not submitted and due date is in the future (or null)
    const pending = assignments.filter((a) => {
      const isSubmitted = submittedIds.includes(a.id);
      const isOverdue = a.due_date && new Date(a.due_date) < new Date();
      return !isSubmitted && !isOverdue;
    }).length;

    // An assignment is overdue if it is not submitted and due date is in the past
    const overdue = assignments.filter((a) => {
      const isSubmitted = submittedIds.includes(a.id);
      const isOverdue = a.due_date && new Date(a.due_date) < new Date();
      return !isSubmitted && isOverdue;
    }).length;

    return {
      classrooms: totalClassrooms,
      pending,
      overdue,
      submitted: submissions.length
    };
  }, [classrooms, assignments, submissions]);

  const avgScore = useMemo(() => {
    const scored = submissions.filter(s => s.score !== null);
    if (scored.length === 0) return null;
    return Math.round(scored.reduce((acc, s) => acc + (s.score || 0), 0) / scored.length);
  }, [submissions]);

  const chartData = useMemo(() => {
    return [...submissions]
      .filter(s => s.score !== null)
      .reverse()
      .map((s, i) => {
        const matchingAsg = assignments.find(a => a.id === s.assignment_id);
        return {
          name: matchingAsg ? matchingAsg.title.substring(0, 10) + "..." : `#${i + 1}`,
          score: s.score,
        };
      });
  }, [submissions, assignments]);

  // Assignments filter & categories logic
  const filteredAssignments = useMemo(() => {
    return assignments.filter((a) => {
      // 1. Classroom filter
      if (selectedClassroomId !== "all" && a.classroom_id !== selectedClassroomId) return false;
      // 2. Language filter
      if (selectedLanguage !== "all" && a.language?.toLowerCase() !== selectedLanguage.toLowerCase()) return false;
      // 3. Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        return (
          a.title.toLowerCase().includes(query) ||
          a.description?.toLowerCase().includes(query) ||
          a.classrooms?.classroom_name.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [assignments, selectedClassroomId, selectedLanguage, searchQuery]);

  const categorizedAssignments = useMemo(() => {
    const submittedIds = submissions.map((s) => s.assignment_id);
    
    const activeList: AssignmentWithClassroom[] = [];
    const completedList: AssignmentWithClassroom[] = [];
    const overdueList: AssignmentWithClassroom[] = [];

    filteredAssignments.forEach((a) => {
      const isSubmitted = submittedIds.includes(a.id);
      const isOverdue = a.due_date && new Date(a.due_date) < new Date();

      if (isSubmitted) {
        completedList.push(a);
      } else if (isOverdue) {
        overdueList.push(a);
      } else {
        activeList.push(a);
      }
    });

    return {
      active: activeList,
      completed: completedList,
      overdue: overdueList,
    };
  }, [filteredAssignments, submissions]);

  // Current list for the subtab
  const currentAssignmentsList = categorizedAssignments[assignmentSubTab];

  // Paginated Assignments
  const paginatedAssignments = useMemo(() => {
    const start = (asgPage - 1) * itemsPerPage;
    return currentAssignmentsList.slice(start, start + itemsPerPage);
  }, [currentAssignmentsList, asgPage]);

  const totalAsgPages = Math.ceil(currentAssignmentsList.length / itemsPerPage);

  // Paginated Notifications
  const paginatedNotifications = useMemo(() => {
    const start = (notifPage - 1) * itemsPerPage;
    return notifications.slice(start, start + itemsPerPage);
  }, [notifications, notifPage]);

  const totalNotifPages = Math.ceil(notifications.length / itemsPerPage);

  // Animation constants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
  };

  const itemVariants = {
    hidden: { y: 15, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { type: "spring" as const, stiffness: 260, damping: 22 } },
  };

  const getDifficultyColor = (diff: string | null) => {
    switch (diff) {
      case "Easy": return "bg-green-500/10 text-green-400 border-green-500/20";
      case "Medium": return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
      case "Hard": return "bg-red-500/10 text-red-400 border-red-500/20";
      default: return "bg-white/5 text-muted-foreground border-white/5";
    }
  };

  const getNotifIcon = (type: string) => {
    switch (type) {
      case "fraud_detected": return <ShieldAlert className="h-4 w-4 text-red-400" />;
      case "assignment_assigned": return <Code className="h-4 w-4 text-primary" />;
      case "announcement": return <Bell className="h-4 w-4 text-amber-400" />;
      default: return <Bell className="h-4 w-4 text-blue-400" />;
    }
  };

  if (loading) {
    return (
      <DashboardLayout role="student">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="space-y-4 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary mx-auto"></div>
            <p className="text-sm text-muted-foreground font-mono">Assembling student terminal...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="student">
      <motion.div
        className="space-y-6 max-w-6xl mx-auto"
        initial="hidden"
        animate="visible"
        variants={containerVariants}
      >
        {/* Profile Ribbon */}
        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-primary text-sm font-mono shadow-inner shadow-primary/20">
              {profile?.name?.substring(0, 2).toUpperCase() || "ST"}
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                Welcome back, {profile?.name} 
              </h1>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                Terminal ID: <span className="text-primary font-bold">{profile?.uid || "—"}</span>
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-2" onClick={() => navigate("/student/classrooms")}>
              <School className="h-4 w-4" /> Classrooms
            </Button>
          </div>
        </motion.div>

        {/* Tabs Bar */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full sm:w-auto bg-black/40 border border-white/10 p-1 rounded-xl">
            <TabsTrigger value="overview" className="rounded-lg text-xs py-2 px-4">Overview</TabsTrigger>
            <TabsTrigger value="assignments" className="rounded-lg text-xs py-2 px-4">Assignments ({assignments.length})</TabsTrigger>
            <TabsTrigger value="classroom_hub" className="rounded-lg text-xs py-2 px-4">Classroom Hub</TabsTrigger>
            <TabsTrigger value="analytics" className="rounded-lg text-xs py-2 px-4">My Analytics</TabsTrigger>
            <TabsTrigger value="notifications" className="rounded-lg text-xs py-2 px-4 flex gap-1.5 items-center">
              Inbox
              {notifications.filter(n => !n.read).length > 0 && (
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              )}
            </TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-6 mt-6 focus-visible:outline-none">
            {/* Stats row */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="glass-panel hover:border-purple-500/30 transition-colors">
                <CardContent className="pt-5 flex items-center gap-3">
                  <div className="p-2.5 bg-purple-500/10 rounded-xl border border-purple-500/25">
                    <School className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold tracking-tight">{stats.classrooms}</p>
                    <p className="text-xs text-muted-foreground">Classrooms Enrolled</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-panel hover:border-primary/30 transition-colors">
                <CardContent className="pt-5 flex items-center gap-3">
                  <div className="p-2.5 bg-primary/10 rounded-xl border border-primary/25">
                    <BookOpen className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold tracking-tight">{stats.pending}</p>
                    <p className="text-xs text-muted-foreground">Active Assignments</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-panel hover:border-red-500/30 transition-colors">
                <CardContent className="pt-5 flex items-center gap-3">
                  <div className="p-2.5 bg-red-500/10 rounded-xl border border-red-500/25">
                    <Clock className="h-5 w-5 text-red-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold tracking-tight">{stats.overdue}</p>
                    <p className="text-xs text-muted-foreground">Overdue Assignments</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-panel hover:border-green-500/30 transition-colors">
                <CardContent className="pt-5 flex items-center gap-3">
                  <div className="p-2.5 bg-green-500/10 rounded-xl border border-green-500/25">
                    <Award className="h-5 w-5 text-green-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold tracking-tight">
                      {avgScore !== null ? `${avgScore}%` : stats.submitted}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {avgScore !== null ? "Average Grade" : "Total Submissions"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {classrooms.length === 0 ? (
              <Card className="glass-panel border-dashed border-primary/20">
                <CardContent className="py-16 text-center space-y-4">
                  <School className="h-12 w-12 text-muted-foreground mx-auto opacity-30" />
                  <div className="max-w-md mx-auto">
                    <p className="font-semibold text-foreground">Terminals Offline</p>
                    <p className="text-sm text-muted-foreground mt-1">You are not enrolled in any classrooms. Enter the classroom enrollment key from your teacher to unlock assignments.</p>
                  </div>
                  <Button onClick={() => navigate("/student/classrooms")} className="font-semibold">
                    <Plus className="h-4 w-4 mr-2" /> Join Classroom
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-6 lg:grid-cols-3">
                {/* Main Content Area */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Quick Access Classrooms */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">My Enrolled Labs</h3>
                      <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setActiveTab("classroom_hub")}>
                        See Hub <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                      {classrooms.slice(0, 2).map((c) => (
                        <Card
                          key={c.id}
                          className="glass-panel cursor-pointer hover:border-primary/40 hover:bg-white/[0.01] transition-all"
                          onClick={() => navigate(`/student/classroom/${c.id}`)}
                        >
                          <CardContent className="p-4 flex justify-between items-center">
                            <div className="space-y-1 min-w-0">
                              <p className="font-bold text-sm text-foreground truncate">{c.classroom_name}</p>
                              <p className="text-xs text-muted-foreground truncate">{c.subject_name}</p>
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 ml-4" />
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>

                  {/* Immediate Priority Assignments */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Priority Assignments</h3>
                    {assignments.filter(a => !getSubmission(a.id)).length === 0 ? (
                      <div className="p-8 text-center border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
                        <CheckCircle className="h-8 w-8 text-green-400 mx-auto mb-2 opacity-60 animate-bounce" />
                        <p className="text-sm font-semibold text-foreground">No pending items!</p>
                        <p className="text-xs text-muted-foreground mt-0.5">You've successfully completed all active coding sheets.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {assignments.filter(a => !getSubmission(a.id)).slice(0, 3).map((a) => {
                          const isOverdue = a.due_date && new Date(a.due_date) < new Date();
                          return (
                            <Card
                              key={a.id}
                              className={`glass-panel border-l-4 hover:bg-white/[0.01] transition-all cursor-pointer ${isOverdue ? "border-l-red-500" : "border-l-primary"}`}
                              onClick={() => navigate(`/student/editor/${a.id}`)}
                            >
                              <CardContent className="p-4 flex items-center justify-between">
                                <div className="space-y-1.5 min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-bold text-sm text-foreground truncate">{a.title}</h4>
                                    {a.language && <Badge variant="outline" className="text-[10px] uppercase font-mono">{a.language}</Badge>}
                                  </div>
                                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <School className="h-3.5 w-3.5" />
                                      {a.classrooms?.classroom_name || "—"}
                                    </span>
                                    {a.due_date && (
                                      <span className={`flex items-center gap-1 ${isOverdue ? "text-red-400 font-semibold" : ""}`}>
                                        <Clock className="h-3.5 w-3.5" />
                                        {isOverdue ? "Overdue" : `Due ${new Date(a.due_date).toLocaleDateString()}`}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0 hover:bg-primary/10 hover:text-primary">
                                  <Code className="h-4 w-4" />
                                </Button>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Side Column (Performance) */}
                <div className="space-y-6">
                  <Card className="glass-panel">
                    <CardHeader className="pb-3 border-b border-white/5">
                      <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        <Activity className="h-4 w-4 text-primary" /> Grade Analytics
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-4">
                      {chartData.length > 0 ? (
                        <div className="h-[180px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                              <XAxis dataKey="name" stroke="#6b7280" fontSize={9} tickLine={false} axisLine={false} />
                              <YAxis stroke="#6b7280" fontSize={9} tickLine={false} axisLine={false} domain={[0, 100]} />
                              <Tooltip
                                contentStyle={{ backgroundColor: "#0b0f19", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px" }}
                                labelStyle={{ fontSize: "10px", color: "#9ca3af" }}
                                itemStyle={{ color: "#3B82F6", fontSize: "11px" }}
                              />
                              <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={{ fill: "#3b82f6", r: 2.5 }} activeDot={{ r: 4 }} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground font-mono border border-dashed border-white/5 rounded-xl bg-black/10">
                          Submit problems to unlock trends.
                        </div>
                      )}
                      
                      <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 text-xs space-y-1">
                        <span className="font-bold text-primary uppercase font-mono">Academic Metrics</span>
                        <p className="text-muted-foreground leading-relaxed">
                          {chartData.length > 0
                            ? `Computed over ${submissions.length} submission logs. Current class placement average is ${avgScore}%.`
                            : "Compile your scripts successfully to generate analytics records."}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ASSIGNMENTS TAB */}
          <TabsContent value="assignments" className="space-y-4 mt-6 focus-visible:outline-none">
            {/* Filters Row */}
            <div className="flex flex-col md:flex-row gap-3 items-center justify-between bg-black/20 p-3.5 rounded-xl border border-white/5">
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filter by assignment name..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setAsgPage(1);
                  }}
                  className="pl-9 bg-background/50 border-white/10 text-xs"
                />
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                <Select value={selectedClassroomId} onValueChange={(v) => { setSelectedClassroomId(v); setAsgPage(1); }}>
                  <SelectTrigger className="bg-background/50 border-white/10 text-xs w-full md:w-44 h-9">
                    <SelectValue placeholder="All Classrooms" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classrooms</SelectItem>
                    {classrooms.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.classroom_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={selectedLanguage} onValueChange={(v) => { setSelectedLanguage(v); setAsgPage(1); }}>
                  <SelectTrigger className="bg-background/50 border-white/10 text-xs w-full md:w-36 h-9">
                    <SelectValue placeholder="All Languages" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Languages</SelectItem>
                    <SelectItem value="python">Python</SelectItem>
                    <SelectItem value="javascript">JavaScript</SelectItem>
                    <SelectItem value="java">Java</SelectItem>
                    <SelectItem value="c">C</SelectItem>
                    <SelectItem value="cpp">C++</SelectItem>
                    <SelectItem value="go">Go</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Sub-tabs for Assignment States */}
            <div className="border-b border-white/5 flex gap-4">
              <button
                className={`pb-2.5 text-xs font-semibold tracking-wide border-b-2 transition-all uppercase ${
                  assignmentSubTab === "active" 
                    ? "border-primary text-primary" 
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => { setAssignmentSubTab("active"); setAsgPage(1); }}
              >
                Active ({categorizedAssignments.active.length})
              </button>
              <button
                className={`pb-2.5 text-xs font-semibold tracking-wide border-b-2 transition-all uppercase ${
                  assignmentSubTab === "completed" 
                    ? "border-primary text-primary" 
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => { setAssignmentSubTab("completed"); setAsgPage(1); }}
              >
                Completed ({categorizedAssignments.completed.length})
              </button>
              <button
                className={`pb-2.5 text-xs font-semibold tracking-wide border-b-2 transition-all uppercase ${
                  assignmentSubTab === "overdue" 
                    ? "border-primary text-primary" 
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => { setAssignmentSubTab("overdue"); setAsgPage(1); }}
              >
                Overdue ({categorizedAssignments.overdue.length})
              </button>
            </div>

            {/* Assignments List */}
            {paginatedAssignments.length === 0 ? (
              <Card className="glass-panel mt-2">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <BookOpen className="h-10 w-10 text-muted-foreground opacity-30 mx-auto mb-2" />
                  <p className="text-sm font-semibold">No assignments found</p>
                  <p className="text-xs mt-0.5">Either none exist in this tab or filter queries excluded all matches.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3 mt-2">
                {paginatedAssignments.map((a) => {
                  const sub = getSubmission(a.id);
                  const isOverdue = a.due_date && new Date(a.due_date) < new Date();
                  return (
                    <Card
                      key={a.id}
                      className="glass-panel hover:bg-white/[0.005] hover:border-white/10 transition-all cursor-pointer"
                      onClick={() => navigate(`/student/${sub ? `classroom/${a.classroom_id}` : `editor/${a.id}`}`)}
                    >
                      <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1.5 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-bold text-sm text-foreground truncate">{a.title}</h4>
                            {a.difficulty && <Badge variant="outline" className={`text-[10px] px-2 ${getDifficultyColor(a.difficulty)}`}>{a.difficulty}</Badge>}
                            {a.language && <Badge variant="outline" className="text-[10px] uppercase font-mono bg-white/5">{a.language}</Badge>}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1">
                              <School className="h-3.5 w-3.5" /> {a.classrooms?.classroom_name}
                            </span>
                            {a.due_date && (
                              <span className={`flex items-center gap-1 ${isOverdue && !sub ? "text-red-400" : ""}`}>
                                <Calendar className="h-3.5 w-3.5" />
                                Due {new Date(a.due_date).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between md:justify-end gap-3 border-t md:border-t-0 border-white/5 pt-3 md:pt-0 shrink-0">
                          {sub ? (
                            <div className="flex items-center gap-2">
                              {sub.score !== null ? (
                                <Badge className="bg-green-500/10 text-green-400 border-green-500/25">
                                  Grade: {sub.score}/{a.total_marks}
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                                  Under Review
                                </Badge>
                              )}
                              <Badge className="bg-white/10 text-white border-white/20">Submitted</Badge>
                            </div>
                          ) : (
                            <Button size="sm" className="gap-1.5 font-bold h-8 text-xs">
                              <Code className="h-3.5 w-3.5" /> Solve Challenge
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}

                {/* Pagination Controls */}
                {totalAsgPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t border-white/5">
                    <span className="text-xs text-muted-foreground">
                      Page <strong className="text-foreground">{asgPage}</strong> of <strong className="text-foreground">{totalAsgPages}</strong>
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setAsgPage(p => Math.max(p - 1, 1))}
                        disabled={asgPage === 1}
                        className="h-8 w-8"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setAsgPage(p => Math.min(p + 1, totalAsgPages))}
                        disabled={asgPage === totalAsgPages}
                        className="h-8 w-8"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* CLASSROOM HUB TAB */}
          <TabsContent value="classroom_hub" className="space-y-6 mt-6 focus-visible:outline-none">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {classrooms.map((c) => (
                <Card
                  key={c.id}
                  className="glass-panel flex flex-col justify-between hover:border-white/15 transition-all cursor-pointer"
                  onClick={() => navigate(`/student/classroom/${c.id}`)}
                >
                  <CardHeader className="pb-3 border-b border-white/5">
                    <Badge variant="outline" className="text-[10px] w-fit mb-1">{c.subject_name}</Badge>
                    <CardTitle className="text-base font-bold text-foreground line-clamp-1">{c.classroom_name}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 flex flex-col justify-between flex-1 gap-4">
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" /> Teacher</span>
                        <span className="text-foreground font-semibold">{teachers[c.teacher_id] || "Instructor"}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Enrolled On</span>
                        <span className="text-foreground">{c.joined_at ? new Date(c.joined_at).toLocaleDateString() : "—"}</span>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="w-full text-xs font-semibold gap-1.5 mt-2">
                      Enter Laboratory <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* MY ANALYTICS TAB */}
          <TabsContent value="analytics" className="space-y-6 mt-6 focus-visible:outline-none">
            {/* Stat Summary Row */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="glass-panel">
                <CardContent className="pt-5 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider font-semibold">Coding Streak</p>
                    <div className="text-2xl font-bold tracking-tight">{studentProgress?.streak || 0} Days</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
                    <Award className="h-5 w-5 text-orange-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-panel">
                <CardContent className="pt-5 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider font-semibold">Labs Completed</p>
                    <div className="text-2xl font-bold tracking-tight">{studentProgress?.completedAssignments || 0}</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <CheckCircle className="h-5 w-5 text-emerald-400" />
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-panel">
                <CardContent className="pt-5 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider font-semibold">Avg AI Score</p>
                    <div className="text-2xl font-bold tracking-tight">{studentProgress?.averageScore || 0}%</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20">
                    <Brain className="h-5 w-5 text-primary" />
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-panel">
                <CardContent className="pt-5 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider font-semibold">Total Submissions</p>
                    <div className="text-2xl font-bold tracking-tight">{studentProgress?.submissionsCount || 0}</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                    <Activity className="h-5 w-5 text-cyan-400" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recharts visualizations */}
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Submission Timeline Area Chart */}
              <Card className="glass-panel lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-xs uppercase font-mono tracking-wider text-muted-foreground">My Submissions Frequency</CardTitle>
                </CardHeader>
                <CardContent>
                  {studentProgress?.submissions && studentProgress.submissions.length > 0 ? (
                    <div className="h-[250px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={
                          Object.entries(
                            (studentProgress.submissions || []).reduce((acc: Record<string, number>, curr: any) => {
                              const d = new Date(curr.submitted_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                              acc[d] = (acc[d] || 0) + 1;
                              return acc;
                            }, {})
                          ).map(([date, count]) => ({ date, count }))
                        }>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                          <XAxis dataKey="date" stroke="#6b7280" fontSize={10} tickLine={false} />
                          <YAxis stroke="#6b7280" fontSize={10} tickLine={false} allowDecimals={false} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: "#0b0f19", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px" }}
                            labelStyle={{ fontSize: "10px", color: "#9ca3af" }}
                            itemStyle={{ color: "#3B82F6", fontSize: "11px" }}
                          />
                          <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2.5} dot={{ fill: "#3b82f6" }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-[250px] flex items-center justify-center text-xs text-muted-foreground font-mono">No submissions history available.</div>
                  )}
                </CardContent>
              </Card>

              {/* Language usage footprint Pie Chart */}
              <Card className="glass-panel">
                <CardHeader>
                  <CardTitle className="text-xs uppercase font-mono tracking-wider text-muted-foreground">Language Footprints</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center pt-2">
                  {studentProgress?.languageDistribution && studentProgress.languageDistribution.length > 0 ? (
                    <div className="h-[210px] w-full relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={studentProgress.languageDistribution}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={75}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {studentProgress.languageDistribution.map((entry: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip 
                            contentStyle={{ backgroundColor: "#0b0f19", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px" }}
                            itemStyle={{ fontSize: "11px" }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      
                      {/* Custom legend */}
                      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-2 text-[10px] font-mono text-muted-foreground">
                        {studentProgress.languageDistribution.map((item: any, idx: number) => (
                          <div key={idx} className="flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                            <span>{item.name} ({item.value})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="h-[210px] flex items-center justify-center text-xs text-muted-foreground font-mono">No languages assigned.</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* INBOX TAB */}
          <TabsContent value="notifications" className="space-y-4 mt-6 focus-visible:outline-none">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Bell className="h-4 w-4" /> Message Center
              </h3>
              {notifications.filter(n => !n.read).length > 0 && (
                <Button variant="ghost" size="sm" onClick={handleMarkAllRead} className="h-8 text-xs text-primary gap-1">
                  <Check className="h-3.5 w-3.5" /> Mark all read
                </Button>
              )}
            </div>

            {notifications.length === 0 ? (
              <Card className="glass-panel">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Bell className="h-10 w-10 text-muted-foreground opacity-20 mx-auto mb-2" />
                  <p className="text-sm font-semibold">Inbox Empty</p>
                  <p className="text-xs mt-0.5">Announcements or allocation logs will populate here.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {paginatedNotifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-4 rounded-xl border transition-all flex items-start justify-between gap-4 ${
                      n.read 
                        ? "bg-white/[0.005] border-white/5 opacity-70" 
                        : "bg-white/[0.02] border-white/10 hover:border-white/20 shadow-lg shadow-black/10"
                    }`}
                  >
                    <div className="flex gap-3">
                      <div className={`p-2 rounded-xl mt-0.5 shrink-0 ${n.read ? "bg-white/5" : "bg-primary/10 border border-primary/20"}`}>
                        {getNotifIcon(n.type)}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-bold ${n.read ? "text-muted-foreground" : "text-foreground"}`}>
                            {n.title}
                          </p>
                          {!n.read && (
                            <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{n.message}</p>
                        <span className="text-[10px] text-muted-foreground/60 font-mono block mt-1">
                          {new Date(n.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {!n.read && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0 hover:bg-white/5"
                        onClick={() => handleMarkRead(n.id)}
                        title="Mark as read"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}

                {/* Notification Pagination */}
                {totalNotifPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t border-white/5">
                    <span className="text-xs text-muted-foreground">
                      Page <strong className="text-foreground">{notifPage}</strong> of <strong className="text-foreground">{totalNotifPages}</strong>
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setNotifPage(p => Math.max(p - 1, 1))}
                        disabled={notifPage === 1}
                        className="h-8 w-8"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setNotifPage(p => Math.min(p + 1, totalNotifPages))}
                        disabled={notifPage === totalNotifPages}
                        className="h-8 w-8"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </motion.div>
    </DashboardLayout>
  );
}
