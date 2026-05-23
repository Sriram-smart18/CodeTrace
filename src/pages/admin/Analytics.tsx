import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { Brain, ShieldAlert, FileText, Users } from "lucide-react";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function AdminAnalytics() {
  const [submissionsByStatus, setSubmissionsByStatus] = useState<any[]>([]);
  const [alertsByType, setAlertsByType] = useState<any[]>([]);
  const [submissionsOverTime, setSubmissionsOverTime] = useState<any[]>([]);
  const [topStats, setTopStats] = useState({ evaluations: 0, flagged: 0, plagiarism: 0, activeAlerts: 0 });

  useEffect(() => {
    const load = async () => {
      // Submissions by status
      const { data: subs } = await supabase.from("submissions").select("status, submitted_at");
      if (subs) {
        const statusMap: Record<string, number> = {};
        subs.forEach((s) => { statusMap[s.status] = (statusMap[s.status] || 0) + 1; });
        setSubmissionsByStatus(Object.entries(statusMap).map(([name, value]) => ({ name, value })));

        // Submissions over time (last 7 days)
        const now = Date.now();
        const days: Record<string, number> = {};
        for (let i = 6; i >= 0; i--) {
          const d = new Date(now - i * 86400000);
          days[d.toLocaleDateString("en-US", { month: "short", day: "numeric" })] = 0;
        }
        subs.forEach((s) => {
          const d = new Date(s.submitted_at);
          const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          if (key in days) days[key]++;
        });
        setSubmissionsOverTime(Object.entries(days).map(([date, count]) => ({ date, count })));

        const flagged = subs.filter((s) => s.status === "flagged").length;
        setTopStats((prev) => ({ ...prev, flagged }));
      }

      // Fraud alerts by type
      const { data: alerts } = await supabase.from("fraud_alerts").select("alert_type, dismissed");
      if (alerts) {
        const typeMap: Record<string, number> = {};
        alerts.filter((a) => !a.dismissed).forEach((a) => {
          typeMap[a.alert_type] = (typeMap[a.alert_type] || 0) + 1;
        });
        setAlertsByType(Object.entries(typeMap).map(([name, value]) => ({ name: name.replace(/_/g, " "), value })));
        setTopStats((prev) => ({ ...prev, activeAlerts: alerts.filter((a) => !a.dismissed).length }));
      }

      // AI evaluations count
      const { count: evalCount } = await supabase.from("ai_evaluations").select("*", { count: "exact", head: true });
      setTopStats((prev) => ({ ...prev, evaluations: evalCount ?? 0 }));
    };
    load();
  }, []);

  return (
    <DashboardLayout role="admin">
      <div className="space-y-8 max-w-7xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Platform Analytics</h1>
          <p className="text-sm text-muted-foreground">System-wide usage and integrity metrics</p>
        </div>

        {/* Top stat cards */}
        <div className="grid gap-4 md:grid-cols-4">
          {[
            { label: "AI Evaluations", value: topStats.evaluations, icon: Brain, color: "text-pink-400" },
            { label: "Flagged Submissions", value: topStats.flagged, icon: FileText, color: "text-red-400" },
            { label: "Active Fraud Alerts", value: topStats.activeAlerts, icon: ShieldAlert, color: "text-orange-400" },
            { label: "Total Submissions", value: submissionsByStatus.reduce((a, b) => a + b.value, 0), icon: Users, color: "text-blue-400" },
          ].map((card) => (
            <Card key={card.label} className="glass-panel">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{card.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Submissions over time */}
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle className="text-base">Submissions (Last 7 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={submissionsOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" stroke="#6b7280" fontSize={11} tickLine={false} />
                  <YAxis stroke="#6b7280" fontSize={11} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: "#111827", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }} />
                  <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ fill: "#3b82f6" }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Submissions by status */}
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle className="text-base">Submissions by Status</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={submissionsByStatus}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" stroke="#6b7280" fontSize={11} tickLine={false} />
                  <YAxis stroke="#6b7280" fontSize={11} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: "#111827", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }} />
                  <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Fraud alerts by type */}
          {alertsByType.length > 0 && (
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle className="text-base">Active Fraud Alerts by Type</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-center">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={alertsByType} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false} fontSize={10}>
                      {alertsByType.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: "#111827", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
