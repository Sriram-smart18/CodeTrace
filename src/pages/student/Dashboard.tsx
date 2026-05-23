import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, CheckCircle, Clock, AlertTriangle, Code, Activity, Award, School, ArrowRight, Plus } from "lucide-react";
import { motion } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// Local type for assignment with nested classroom join
interface AssignmentWithClassroom {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  classroom_id: string | null;
  language: string | null;
  difficulty: string | null;
  total_marks: number;
  classrooms: { classroom_name: string; subject_name: string } | null;
}

export default function StudentDashboard() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [recentAssignments, setRecentAssignments] = useState<AssignmentWithClassroom[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [stats, setStats] = useState({ classrooms: 0, pending: 0, submitted: 0 });

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      // Get enrolled classrooms
      const { data: enrollments } = await supabase
        .from("classroom_students")
        .select("classroom_id")
        .eq("student_id", user.id);

      const classroomIds = enrollments?.map((e) => e.classroom_id) || [];

      if (classroomIds.length > 0) {
        const { data: rooms } = await supabase
          .from("classrooms")
          .select("*")
          .in("id", classroomIds)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(3);
        setClassrooms(rooms ?? []);

        const { data: asgns } = await supabase
          .from("assignments")
          .select("*, classrooms(classroom_name, subject_name)")
          .in("classroom_id", classroomIds)
          .order("due_date", { ascending: true })
          .limit(6);
        setRecentAssignments((asgns ?? []) as AssignmentWithClassroom[]);

        if (asgns && asgns.length > 0) {
          const aIds = asgns.map((a) => a.id);
          const { data: subs } = await supabase
            .from("submissions")
            .select("*")
            .eq("student_id", user.id)
            .in("assignment_id", aIds)
            .order("submitted_at", { ascending: true });
          setSubmissions(subs ?? []);

          const pending = asgns.filter((a) => !subs?.find((s) => s.assignment_id === a.id)).length;
          setStats({ classrooms: classroomIds.length, pending, submitted: subs?.length ?? 0 });
        } else {
          setStats({ classrooms: classroomIds.length, pending: 0, submitted: 0 });
        }
      } else {
        setClassrooms([]);
        setRecentAssignments([]);
        setSubmissions([]);
        setStats({ classrooms: 0, pending: 0, submitted: 0 });
      }
    };
    load();
  }, [user]);

  const getSubmission = (assignmentId: string) => submissions.find((s) => s.assignment_id === assignmentId);

  const avgScore = useMemo(() => {
    const scored = submissions.filter(s => s.score !== null);
    if (scored.length === 0) return null;
    return Math.round(scored.reduce((acc, s) => acc + (s.score || 0), 0) / scored.length);
  }, [submissions]);

  const chartData = useMemo(() => {
    return submissions.filter(s => s.score !== null).map((s, i) => ({
      name: `#${i + 1}`,
      score: s.score,
    }));
  }, [submissions]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
  };
  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { type: "spring" as const, stiffness: 300, damping: 24 } },
  };

  const statusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "evaluated": return "default";
      case "flagged": return "destructive";
      case "submitted": return "secondary";
      default: return "outline";
    }
  };

  return (
    <DashboardLayout role="student">
      <motion.div
        className="space-y-8 max-w-6xl mx-auto"
        initial="hidden"
        animate="visible"
        variants={containerVariants}
      >
        <motion.div variants={itemVariants} className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Overview</h1>
          <p className="text-muted-foreground font-mono text-sm">
            UID: <span className="text-primary">{profile?.uid || "—"}</span>
            {" · "}{profile?.name}
          </p>
        </motion.div>

        {/* Stats */}
        <motion.div variants={itemVariants} className="grid gap-4 md:grid-cols-3">
          <Card className="glass-panel group hover:border-purple-500/50 transition-colors cursor-pointer" onClick={() => navigate("/student/classrooms")}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">My Classrooms</CardTitle>
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <School className="h-4 w-4 text-purple-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tracking-tighter">{stats.classrooms}</div>
            </CardContent>
          </Card>
          <Card className="glass-panel group hover:border-primary/50 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending Assignments</CardTitle>
              <div className="p-2 bg-primary/10 rounded-lg">
                <BookOpen className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tracking-tighter">{stats.pending}</div>
            </CardContent>
          </Card>
          <Card className="glass-panel group hover:border-green-500/50 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {avgScore !== null ? "Avg Score" : "Submissions"}
              </CardTitle>
              <div className="p-2 bg-green-500/10 rounded-lg">
                <Award className="h-4 w-4 text-green-400" />
              </div>
            </CardHeader>
            <CardContent>
              {avgScore !== null ? (
                <div className="text-3xl font-bold tracking-tighter">
                  {avgScore}<span className="text-lg text-muted-foreground">/100</span>
                </div>
              ) : (
                <div className="text-3xl font-bold tracking-tighter">{stats.submitted}</div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* No classrooms state */}
        {stats.classrooms === 0 && (
          <motion.div variants={itemVariants}>
            <Card className="glass-panel border-dashed border-primary/30">
              <CardContent className="py-12 text-center space-y-4">
                <School className="h-12 w-12 text-muted-foreground mx-auto opacity-30" />
                <div>
                  <p className="font-semibold text-foreground">No classrooms yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Join a classroom using the code from your teacher to see assignments.</p>
                </div>
                <Button onClick={() => navigate("/student/classrooms")}>
                  <Plus className="h-4 w-4 mr-2" /> Join a Classroom
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {stats.classrooms > 0 && (
          <div className="grid gap-8 lg:grid-cols-3">
            {/* Assignments + Classrooms */}
            <motion.div variants={itemVariants} className="lg:col-span-2 space-y-6">
              {/* My Classrooms quick access */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
                    <School className="h-5 w-5 text-primary" /> My Classrooms
                  </h2>
                  <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate("/student/classrooms")}>
                    View all <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  {classrooms.map((c) => (
                    <Card
                      key={c.id}
                      className="glass-panel cursor-pointer hover:border-primary/40 transition-all"
                      onClick={() => navigate(`/student/classroom/${c.id}`)}
                    >
                      <CardContent className="p-3">
                        <p className="font-semibold text-sm truncate">{c.classroom_name}</p>
                        <Badge variant="outline" className="text-[10px] mt-1">{c.subject_name}</Badge>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Pending Assignments */}
              <div>
                <h2 className="text-lg font-semibold tracking-tight mb-3">Pending Assignments</h2>
                {recentAssignments.filter(a => !getSubmission(a.id)).length === 0 ? (
                  <div className="p-8 text-center border border-dashed border-white/10 rounded-xl bg-card/20">
                    <CheckCircle className="h-8 w-8 text-green-400 mx-auto mb-2 opacity-60" />
                    <p className="text-muted-foreground font-mono text-sm">All caught up! No pending assignments.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentAssignments.filter(a => !getSubmission(a.id)).slice(0, 4).map((a) => {
                      const isOverdue = a.due_date && new Date(a.due_date) < new Date();
                      return (
                        <motion.div whileHover={{ scale: 1.005 }} key={a.id}>
                          <Card
                            className={`glass-panel border-l-4 hover:bg-card/60 transition-all cursor-pointer ${isOverdue ? "border-l-destructive" : "border-l-primary"}`}
                            onClick={() => navigate(`/student/editor/${a.id}`)}
                          >
                            <CardContent className="p-4 flex items-center justify-between">
                              <div className="space-y-1 min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <h3 className="font-semibold text-foreground text-sm truncate">{a.title}</h3>
                                  {a.language && <Badge variant="outline" className="text-[10px] shrink-0">{a.language}</Badge>}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <School className="h-3 w-3" />
                                    {a.classrooms?.classroom_name || "—"}
                                  </span>
                                  {a.due_date && (
                                    <span className={`flex items-center gap-1 ${isOverdue ? "text-destructive" : ""}`}>
                                      <Clock className="h-3 w-3" />
                                      {isOverdue ? "Overdue" : `Due ${new Date(a.due_date).toLocaleDateString()}`}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <Button size="sm" variant="ghost" className="shrink-0 ml-2">
                                <Code className="h-4 w-4" />
                              </Button>
                            </CardContent>
                          </Card>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Recent Submissions */}
              {submissions.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold tracking-tight mb-3">Recent Submissions</h2>
                  <div className="space-y-2">
                    {submissions.slice(-4).reverse().map(sub => {
                      const a = recentAssignments.find(a => a.id === sub.assignment_id);
                      return (
                        <div key={sub.id} className="flex items-center justify-between p-3 glass-panel bg-card/30 rounded-lg">
                          <div>
                            <p className="text-sm font-medium">{a?.title || "Unknown Assignment"}</p>
                            <p className="text-xs text-muted-foreground font-mono mt-0.5">{new Date(sub.submitted_at).toLocaleString()}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {sub.score !== null && (
                              <span className="font-mono text-xs font-bold text-primary">{sub.score}/{a?.total_marks || 100}</span>
                            )}
                            <Badge variant={statusVariant(sub.status)} className="capitalize text-xs">{sub.status}</Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.div>

            {/* Performance Chart */}
            <motion.div variants={itemVariants}>
              <Card className="glass-panel h-full">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    Performance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {chartData.length > 0 ? (
                    <div className="h-[220px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                          <XAxis dataKey="name" stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false} />
                          <YAxis stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} />
                          <Tooltip
                            contentStyle={{ backgroundColor: "#111827", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }}
                            itemStyle={{ color: "#3B82F6" }}
                          />
                          <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={{ fill: "#3b82f6", r: 3 }} activeDot={{ r: 5 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground font-mono border border-dashed border-white/5 rounded-lg bg-black/20">
                      No scores yet.
                    </div>
                  )}
                  <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/10">
                    <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">Summary</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {chartData.length > 0
                        ? `${stats.submitted} submission(s) · Avg score: ${avgScore}/100`
                        : "Submit assignments to track your performance."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        )}
      </motion.div>
    </DashboardLayout>
  );
}
