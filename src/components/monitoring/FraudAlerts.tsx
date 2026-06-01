import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, ShieldAlert, ShieldCheck, X, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { realtimeManager } from "@/lib/realtimeManager";

interface FraudAlert {
  id: string;
  student_id: string;
  assignment_id: string | null;
  risk_level: string;
  alert_type: string;
  explanation: string;
  event_summary: any;
  dismissed: boolean;
  created_at: string;
}

interface StudentInfo {
  name: string;
  uid: string | null;
}

interface FraudAlertsProps {
  students: Record<string, StudentInfo>;
  assignments: Record<string, string>;
}

const RISK_CONFIG: Record<string, { color: string; icon: typeof AlertTriangle; label: string }> = {
  high: { color: "var(--terminal-red, 0 84% 60%)", icon: ShieldAlert, label: "HIGH" },
  medium: { color: "var(--terminal-yellow)", icon: AlertTriangle, label: "MED" },
  low: { color: "var(--terminal-fg)", icon: ShieldCheck, label: "LOW" },
};

const ALERT_TYPE_LABELS: Record<string, string> = {
  copy_paste: "Copy-Paste Detected",
  large_insertion: "Large Code Insertion",
  ai_generated: "AI-Generated Code",
  abnormal_typing: "Abnormal Typing Pattern",
  multiple_flags: "Multiple Flags",
  clean: "Clean",
};

export function FraudAlerts({ students, assignments }: FraudAlertsProps) {
  const [alerts, setAlerts] = useState<FraudAlert[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const initializedRef = useRef(false);
  const studentsRef = useRef(students);

  useEffect(() => {
    studentsRef.current = students;
  }, [students]);

  useEffect(() => {
    const loadAlerts = async () => {
      const { data } = await supabase
        .from("fraud_alerts")
        .select("*")
        .eq("dismissed", false)
        .order("created_at", { ascending: false })
        .limit(50);
      if (data) setAlerts(data as FraudAlert[]);
    };
    loadAlerts();

    if (initializedRef.current) return;
    initializedRef.current = true;

    const channelName = "fraud-alerts-global";
    const key = "fraud-alerts-sub";

    try {
      realtimeManager.subscribeToChannel({
        key,
        channelName,
        config: {
          event: "INSERT",
          schema: "public",
          table: "fraud_alerts",
        },
        callback: (payload) => {
          const newAlert = payload.new as FraudAlert;
          setAlerts((prev) => [newAlert, ...prev].slice(0, 50));
          const risk = newAlert.risk_level.toUpperCase();
          const studentName = studentsRef.current[newAlert.student_id]?.name || "Unknown";
          toast.warning(`⚠ ${risk} risk detected for ${studentName}`, {
            description: ALERT_TYPE_LABELS[newAlert.alert_type] || newAlert.alert_type,
            duration: 8000,
          });
        }
      });
    } catch (error) {
      console.error("[Realtime] Failed to subscribe to fraud alerts:", error);
    }

    return () => {
      initializedRef.current = false;
      realtimeManager.unsubscribeChannel(key);
    };
  }, []);

  const dismissAlert = async (alertId: string) => {
    await supabase.from("fraud_alerts").update({ dismissed: true }).eq("id", alertId);
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  };

  const getStudentLabel = (id: string) => {
    const s = students[id];
    return s ? `${s.name} (${s.uid || "—"})` : id.slice(0, 8);
  };

  if (alerts.length === 0) return null;

  return (
    <div className="rounded-lg overflow-hidden border border-destructive/30">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-2 bg-destructive/10 text-destructive font-mono text-xs hover:bg-destructive/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" />
          <span className="font-bold uppercase tracking-wider">
            Fraud Alerts ({alerts.length})
          </span>
        </div>
        {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </button>

      {!collapsed && (
        <div className="bg-[hsl(var(--terminal-bg))] max-h-64 overflow-y-auto divide-y divide-[hsl(var(--terminal-border))]">
          {alerts.map((alert) => {
            const config = RISK_CONFIG[alert.risk_level] || RISK_CONFIG.low;
            const Icon = config.icon;
            const isExpanded = expanded === alert.id;

            return (
              <div key={alert.id} className="px-4 py-2 font-mono text-xs">
                <div className="flex items-start gap-2">
                  <Icon
                    className="h-4 w-4 mt-0.5 shrink-0"
                    style={{ color: `hsl(${config.color})` }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 border-current"
                        style={{ color: `hsl(${config.color})` }}
                      >
                        {config.label}
                      </Badge>
                      <span className="text-[hsl(var(--terminal-fg))] font-semibold">
                        {getStudentLabel(alert.student_id)}
                      </span>
                      <span className="text-[hsl(var(--terminal-muted))]">·</span>
                      <span style={{ color: `hsl(${config.color})` }} className="font-semibold">
                        {ALERT_TYPE_LABELS[alert.alert_type] || alert.alert_type}
                      </span>
                      {alert.assignment_id && assignments[alert.assignment_id] && (
                        <>
                          <span className="text-[hsl(var(--terminal-muted))]">on</span>
                          <span className="text-[hsl(var(--terminal-cyan))]">
                            "{assignments[alert.assignment_id]}"
                          </span>
                        </>
                      )}
                    </div>

                    <button
                      onClick={() => setExpanded(isExpanded ? null : alert.id)}
                      className="text-[hsl(var(--terminal-muted))] hover:text-[hsl(var(--terminal-fg))] mt-1 flex items-center gap-1 transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {isExpanded ? "Hide details" : "Show details"}
                    </button>

                    {isExpanded && (
                      <div className="mt-2 space-y-2">
                        <p className="text-[hsl(var(--terminal-fg))] whitespace-pre-wrap leading-relaxed">
                          {alert.explanation}
                        </p>
                        {alert.event_summary?.indicators && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {alert.event_summary.indicators.map((ind: string, i: number) => (
                              <span
                                key={i}
                                className="bg-[hsl(var(--terminal-highlight))] text-[hsl(var(--terminal-muted))] px-1.5 py-0.5 rounded text-[10px]"
                              >
                                {ind}
                              </span>
                            ))}
                          </div>
                        )}
                        {alert.event_summary && (
                          <div className="grid grid-cols-4 gap-2 mt-1">
                            <Stat label="Pastes" value={alert.event_summary.paste_count} />
                            <Stat label="Typing" value={alert.event_summary.typing_count} />
                            <Stat label="Runs" value={alert.event_summary.run_count} />
                            <Stat label="Confidence" value={`${alert.event_summary.confidence}%`} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[hsl(var(--terminal-muted))]">
                      {new Date(alert.created_at).toLocaleTimeString("en-US", {
                        hour12: false,
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-[hsl(var(--terminal-muted))] hover:text-destructive"
                      onClick={() => dismissAlert(alert.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="text-center">
      <div className="text-[hsl(var(--terminal-fg))] font-bold">{value ?? "—"}</div>
      <div className="text-[hsl(var(--terminal-muted))] text-[9px] uppercase">{label}</div>
    </div>
  );
}
