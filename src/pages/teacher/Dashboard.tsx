import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, BookOpen, FileText, Activity, ShieldAlert, Brain, School, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export default function TeacherDashboard() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    classrooms: 0,
    assignments: 0,
    submissions: 0,
    enrolledStudents: 0,
    fraudAlerts: 0,
    todaySubmissions: 0,
  });
  const [recentClassrooms, setRecentClassrooms] = useState<any[]>([]);
  const [recentSubmissions, setRecentSubmissions] = useState<Array<{
    id: string;
    status: string;
    submitted_at: string;
    assignments: { title: string } | null;
  }>>([]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      // Get teacher's classrooms
      const { data: classrooms, count: classroomCount } = await supabase
        .from("classrooms")
        .select("*", { count: "exact" })
        .eq("teacher_id", user.id)
        .order("created_at", { ascending: false })
        .limit(3);

      // Get teacher's assignments
      const { count: assignmentCount } = await supabase
        .from("assignments")
        .select("*", { count: "exact", head: true })
        .eq("created_by", user.id);

      // Get assignment IDs for this teacher
      const { data: myAssignments } = await supabase
        .from("assignments")
        .select("id")
        .eq("created_by", user.id);
      const assignmentIds = myAssignments?.map((a) => a.id) || [];

      let submissionCount = 0;
      let todayCount = 0;
      let alertCount = 0;
      let recentSubs: any[] = [];

      if (assignmentIds.length > 0) {
        const { count: subCount } = await supabase
          .from("submissions")
          .select("*", { count: "exact", head: true })
          .in("assignment_id", assignmentIds);
        submissionCount = subCount ?? 0;

        const today = new Date().toDateString();
        const { data: todaySubs } = await supabase
          .from("submissions")
          .select("submitted_at")
          .in("assignment_id", assignmentIds);
        todayCount = todaySubs?.filter(s => new Date(s.submitted_at).toDateString() === today).length ?? 0;

        // Fraud alerts for this teacher's assignments
        const { count: alerts } = await supabase
          .from("fraud_alerts")
          .select("*", { count: "exact", head: true })
          .in("assignment_id", assignmentIds)
          .eq("dismissed", false);
        alertCount = alerts ?? 0;

        // Recent submissions with assignment title
        const { data: subs } = await supabase
          .from("submissions")
          .select("*, assignments(title)")
          .in("assignment_id", assignmentIds)
          .order("submitted_at", { ascending: false })
          .limit(5);
        recentSubs = subs ?? [];
      }

      // Count enrolled students across all classrooms
      let enrolledCount = 0;
      if (classrooms && classrooms.length > 0) {
        const classroomIds = classrooms.map((c) => c.id);
        const { count } = await supabase
          .from("classroom_students")
          .select("*", { count: "exact", head: true })
          .in("classroom_id", classroomIds);
        enrolledCount = count ?? 0;
      }

      setStats({
        classrooms: classroomCount ?? 0,
        assignments: assignmentCount ?? 0,
        submissions: submissionCount,
        enrolledStudents: enrolledCount,
        fraudAlerts: alertCount,
        todaySubmissions: todayCount,
      });
      setRecentClassrooms(classrooms ?? []);
      setRecentSubmissions(recentSubs);
    };
    load();
  }, [user]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
  };
  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { type: "spring", stiffness: 300, damping: 24 } },
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
    <DashboardLayout role="teacher">
      <motion.div
        className="space-y-8 max-w-[1400px] mx-auto"
        initial="hidden"
        animate="visible"
        variants={containerVariants}
      >
        <motion.div variants={itemVariants} className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Control Center
            <Badge variant="outline" className="ml-2 border-primary/50 text-primary">Live</Badge>
          </h1>
          <p className="text-muted-foreground font-mono text-sm">Welcome back, {profile?.name}</p>
        </motion.div>

        {/* Stats */}
        <motion.div variants={itemVariants} className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Classrooms", value: stats.classrooms, icon: School, color: "text-purple-400", bg: "bg-purple-500/10", link: "/teacher/classrooms" },
            { label: "Assignments", value: stats.assignments, icon: BookOpen, color: "text-blue-400", bg: "bg-blue-500/10", link: "/teacher/assignments" },
            { label: "Students", value: stats.enrolledStudents, icon: Users, color: "text-green-400", bg: "bg-green-500/10", link: "/teacher/students" },
            { label: "Submissions", value: stats.submissions, icon: FileText, color: "text-cyan-400", bg: "bg-cyan-500/10", link: "/teacher/submissions" },
            { label: "Today", value: stats.todaySubmissions, icon: Activity, color: "text-yellow-400", bg: "bg-yellow-500/10", link: "/teacher/submissions" },
            { label: "Alerts", value: stats.fraudAlerts, icon: ShieldAlert, color: "text-red-400", bg: "bg-red-500/10", link: "/teacher/monitoring" },
          ].map((card) => (
            <Card
              key={card.label}
              className="glass-panel hover:border-primary/30 transition-colors cursor-pointer"
              onClick={() => navigate(card.link)}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground">{card.label}</CardTitle>
                <div className={`p-1.5 ${card.bg} rounded-lg`}>
                  <card.icon className={`h-3.5 w-3.5 ${card.color}`} />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl font-bold tracking-tighter">{card.value}</div>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recent Classrooms */}
          <motion.div variants={itemVariants} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
                <School className="h-5 w-5 text-primary" /> My Classrooms
              </h2>
              <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate("/teacher/classrooms")}>
                View all <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
            {recentClassrooms.length === 0 ? (
              <Card className="glass-panel">
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground text-sm mb-3">No classrooms yet.</p>
                  <Button size="sm" onClick={() => navigate("/teacher/classrooms")}>Create Classroom</Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {recentClassrooms.map((c) => (
                  <Card
                    key={c.id}
                    className="glass-panel hover:border-primary/30 transition-colors cursor-pointer"
                    onClick={() => navigate(`/teacher/classroom/${c.id}`)}
                  >
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm">{c.classroom_name}</p>
                        <p className="text-xs text-muted-foreground">{c.subject_name}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-primary bg-primary/10 px-2 py-0.5 rounded">{c.classroom_code}</span>
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

          {/* Recent Submissions */}
          <motion.div variants={itemVariants} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" /> Recent Submissions
              </h2>
              <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate("/teacher/submissions")}>
                View all <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
            {recentSubmissions.length === 0 ? (
              <Card className="glass-panel">
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground text-sm">No submissions yet.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {recentSubmissions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-3 glass-panel rounded-lg bg-card/30">
                    <div>
                      <p className="text-sm font-medium">{s.assignments?.title || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground font-mono">{new Date(s.submitted_at).toLocaleString()}</p>
                    </div>
                    <Badge variant={statusVariant(s.status)} className="capitalize text-xs">{s.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>

        {/* Quick Actions */}
        <motion.div variants={itemVariants}>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" /> Quick Actions
          </h2>
          <div className="grid gap-3 md:grid-cols-4">
            {[
              { label: "New Classroom", icon: School, action: () => navigate("/teacher/classrooms"), color: "border-purple-500/30 hover:border-purple-500/60" },
              { label: "View Monitoring", icon: Activity, action: () => navigate("/teacher/monitoring"), color: "border-green-500/30 hover:border-green-500/60" },
              { label: "Review Submissions", icon: FileText, action: () => navigate("/teacher/submissions"), color: "border-blue-500/30 hover:border-blue-500/60" },
              { label: "Fraud Alerts", icon: ShieldAlert, action: () => navigate("/teacher/monitoring"), color: "border-red-500/30 hover:border-red-500/60" },
            ].map((action) => (
              <button
                key={action.label}
                onClick={action.action}
                className={`p-4 rounded-xl border glass-panel text-left transition-all hover:bg-card/60 ${action.color}`}
              >
                <action.icon className="h-5 w-5 text-muted-foreground mb-2" />
                <p className="text-sm font-medium">{action.label}</p>
              </button>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </DashboardLayout>
  );
}
