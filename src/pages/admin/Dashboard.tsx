import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, GraduationCap, BookOpen, FileText, ShieldAlert, Brain, Activity, UserCheck } from "lucide-react";
import { motion } from "framer-motion";
import type { Tables } from "@/integrations/supabase/types";

interface PlatformStats {
  totalTeachers: number;
  totalStudents: number;
  totalAssignments: number;
  totalSubmissions: number;
  totalClassrooms: number;
  totalAiEvaluations: number;
  totalPlagiarismAlerts: number;
  recentUsers: Tables<"profiles">[];
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<PlatformStats>({
    totalTeachers: 0,
    totalStudents: 0,
    totalAssignments: 0,
    totalSubmissions: 0,
    totalClassrooms: 0,
    totalAiEvaluations: 0,
    totalPlagiarismAlerts: 0,
    recentUsers: [],
  });

  useEffect(() => {
    const load = async () => {
      const [
        { count: teachers },
        { count: students },
        { count: assignments },
        { count: submissions },
        { count: classrooms },
        { count: evaluations },
        { count: alerts },
        { data: recentUsers },
      ] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "teacher"),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "student"),
        supabase.from("assignments").select("*", { count: "exact", head: true }),
        supabase.from("submissions").select("*", { count: "exact", head: true }),
        supabase.from("classrooms").select("*", { count: "exact", head: true }),
        supabase.from("ai_evaluations").select("*", { count: "exact", head: true }),
        supabase.from("fraud_alerts").select("*", { count: "exact", head: true }).eq("dismissed", false),
        supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(10),
      ]);

      setStats({
        totalTeachers: teachers ?? 0,
        totalStudents: students ?? 0,
        totalAssignments: assignments ?? 0,
        totalSubmissions: submissions ?? 0,
        totalClassrooms: classrooms ?? 0,
        totalAiEvaluations: evaluations ?? 0,
        totalPlagiarismAlerts: alerts ?? 0,
        recentUsers: recentUsers ?? [],
      });
    };
    load();
  }, []);

  const statCards = [
    { label: "Total Teachers", value: stats.totalTeachers, icon: GraduationCap, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "Total Students", value: stats.totalStudents, icon: Users, color: "text-green-400", bg: "bg-green-500/10" },
    { label: "Classrooms", value: stats.totalClassrooms, icon: BookOpen, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "Assignments", value: stats.totalAssignments, icon: FileText, color: "text-yellow-400", bg: "bg-yellow-500/10" },
    { label: "Submissions", value: stats.totalSubmissions, icon: Activity, color: "text-cyan-400", bg: "bg-cyan-500/10" },
    { label: "AI Evaluations", value: stats.totalAiEvaluations, icon: Brain, color: "text-pink-400", bg: "bg-pink-500/10" },
    { label: "Active Alerts", value: stats.totalPlagiarismAlerts, icon: ShieldAlert, color: "text-red-400", bg: "bg-red-500/10" },
    { label: "Total Users", value: stats.totalTeachers + stats.totalStudents, icon: UserCheck, color: "text-orange-400", bg: "bg-orange-500/10" },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
  } as const;
  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { type: "spring" as const, stiffness: 300, damping: 24 } },
  };

  return (
    <DashboardLayout role="admin">
      <motion.div className="space-y-8 max-w-7xl mx-auto" initial="hidden" animate="visible" variants={containerVariants}>
        <motion.div variants={itemVariants}>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Platform Overview
            <Badge variant="outline" className="ml-2 border-primary/50 text-primary text-xs">Admin</Badge>
          </h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">Full platform visibility and control</p>
        </motion.div>

        {/* Stats Grid */}
        <motion.div variants={itemVariants} className="grid gap-4 md:grid-cols-4">
          {statCards.map((card) => (
            <Card key={card.label} className="glass-panel hover:border-primary/30 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
                <div className={`p-2 ${card.bg} rounded-lg`}>
                  <card.icon className={`h-4 w-4 ${card.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold tracking-tighter">{card.value}</div>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        {/* Recently Registered Users */}
        <motion.div variants={itemVariants}>
          <h2 className="text-lg font-semibold mb-4">Recently Registered Users</h2>
          <Card className="glass-panel">
            <CardContent className="pt-4">
              <div className="space-y-2">
                {stats.recentUsers.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-4">No users yet.</p>
                ) : (
                  stats.recentUsers.map((u) => (
                    <div key={u.id} className="flex items-center justify-between p-3 rounded-lg bg-card/40 border border-white/5">
                      <div>
                        <p className="text-sm font-medium">{u.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{u.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {u.uid && <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">{u.uid}</span>}
                        <Badge
                          variant={u.role === "teacher" ? "default" : u.role === "admin" ? "destructive" : "secondary"}
                          className="capitalize text-xs"
                        >
                          {u.role}
                        </Badge>
                        {u.is_suspended && <Badge variant="destructive" className="text-xs">Suspended</Badge>}
                        <span className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </DashboardLayout>
  );
}
