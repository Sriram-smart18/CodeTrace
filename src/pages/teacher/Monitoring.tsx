import { useEffect, useState, useRef, useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  ScanSearch, 
  Tv, 
  AlertOctagon, 
  Copy, 
  EyeOff, 
  Flame, 
  Laptop,
  CheckCircle,
  FileCode,
  Activity,
  UserCheck
} from "lucide-react";
import { TerminalHeader } from "@/components/monitoring/TerminalHeader";
import { TerminalStats } from "@/components/monitoring/TerminalStats";
import { TerminalEventRow } from "@/components/monitoring/TerminalEventRow";
import { FraudAlerts } from "@/components/monitoring/FraudAlerts";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useLiveMonitoringQuery } from "@/hooks/useAnalyticsQueries";
import { subscriptionManager } from "@/lib/subscriptionManager";

interface ActivityEvent {
  id: string;
  student_id: string;
  assignment_id: string | null;
  event_type: string;
  code_snapshot: string | null;
  language: string | null;
  created_at: string;
}

interface StudentInfo {
  user_id: string;
  name: string;
  uid: string | null;
  email: string;
}

export default function TeacherMonitoring() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [students, setStudents] = useState<Record<string, StudentInfo>>({});
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [connected, setConnected] = useState(false);
  const [scanning, setScanning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 1. Get Teacher Profile Details
  const { data: teacherUser } = useQuery({
    queryKey: ["current-teacher-user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    }
  });

  // 2. Fetch Live Observability Heartbeats via React Query
  const { data: liveSessions, refetch: refetchSessions } = useLiveMonitoringQuery(teacherUser?.id);

  useEffect(() => {
    const loadData = async () => {
      if (!teacherUser?.id) return;

      // Get this teacher's assignment IDs
      const { data: myAssignments } = await supabase
        .from("assignments")
        .select("id")
        .eq("created_by", teacherUser.id);
      const assignmentIds = myAssignments?.map((a) => a.id) || [];

      // Load events only for this teacher's assignments
      let evtQuery = supabase
        .from("activity_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      
      if (assignmentIds.length > 0) {
        evtQuery = evtQuery.in("assignment_id", assignmentIds);
      }

      const { data: evts } = await evtQuery;
      if (evts) setEvents((evts as ActivityEvent[]).reverse());

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, name, uid, email")
        .eq("role", "student");
      if (profiles) {
        const map: Record<string, StudentInfo> = {};
        profiles.forEach((p) => { map[p.user_id] = p; });
        setStudents(map);
      }

      const { data: asgns } = await supabase.from("assignments").select("id, title").eq("created_by", teacherUser.id);
      if (asgns) {
        const map: Record<string, string> = {};
        asgns.forEach((a) => { map[a.id] = a.title; });
        setAssignments(map);
      }
    };
    loadData();
  }, [teacherUser]);

  const initializedRef = useRef(false);

  // 3. Setup central ref-counted subscription manager
  useEffect(() => {
    if (!teacherUser?.id) return;
    if (initializedRef.current) return;
    initializedRef.current = true;

    let isMounted = true;
    let unsubActivity: () => void = () => {};
    let unsubSessions: () => void = () => {};

    const setupRealtime = async () => {
      try {
        const { data: myAssignments } = await supabase
          .from("assignments")
          .select("id")
          .eq("created_by", teacherUser.id);
        
        if (!isMounted) return;

        const teacherAssignmentIds = myAssignments?.map((a) => a.id) || [];
        const channelName = `monitoring-classroom-${teacherUser.id}`;

        // Subscribe to activity_events INSERT
        unsubActivity = subscriptionManager.subscribe(
          channelName,
          "activity_events",
          "INSERT",
          undefined,
          (payload) => {
            const newEvent = payload.new as ActivityEvent;
            if (
              !newEvent.assignment_id ||
              teacherAssignmentIds.length === 0 ||
              teacherAssignmentIds.includes(newEvent.assignment_id)
            ) {
              console.log(`[REALTIME_EVENT_RECEIVED] activity_event: ${newEvent.event_type} from student: ${newEvent.student_id}`);
              setEvents((prev) => [...prev.slice(-199), newEvent]);
              console.log(`[TEACHER_UI_UPDATED] UI updated with activity event: ${newEvent.event_type}`);
            }
          }
        );

        // Subscribe to monitoring_sessions UPDATE/INSERT
        unsubSessions = subscriptionManager.subscribe(
          channelName,
          "monitoring_sessions",
          "*",
          undefined,
          () => {
            console.log(`[REALTIME_EVENT_RECEIVED] monitoring_sessions update received`);
            refetchSessions();
            console.log(`[TEACHER_UI_UPDATED] UI updated with monitoring session update`);
          }
        );

        setConnected(true);
      } catch (err) {
        console.error("[Realtime] Failed to setup realtime monitoring telemetry:", err);
      }
    };

    setupRealtime();

    return () => {
      isMounted = false;
      initializedRef.current = false;
      unsubActivity();
      unsubSessions();
    };
  }, [teacherUser, refetchSessions]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  const getStudentName = (id: string) => {
    const s = students[id];
    return s ? `${s.name} (${s.uid || "—"})` : id.slice(0, 8);
  };

  const filteredEvents = events.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const student = students[e.student_id];
    const assignmentTitle = e.assignment_id ? assignments[e.assignment_id] : "";
    return (
      student?.name?.toLowerCase().includes(q) ||
      student?.uid?.toLowerCase().includes(q) ||
      e.event_type.includes(q) ||
      assignmentTitle?.toLowerCase().includes(q)
    );
  });

  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const recentEvents = events.filter((e) => new Date(e.created_at).getTime() > fiveMinAgo);
  const activeStudentIds = new Set(recentEvents.map((e) => e.student_id));

  const statCounts: Record<string, number> = {};
  recentEvents.forEach((e) => { statCounts[e.event_type] = (statCounts[e.event_type] || 0) + 1; });

  const scanAllStudents = async () => {
    setScanning(true);
    try {
      const studentIds = [...activeStudentIds];
      if (studentIds.length === 0) {
        toast.info("No active students to scan");
        setScanning(false);
        return;
      }
      let scanned = 0;
      for (const sid of studentIds) {
        const { error } = await invokeEdgeFunction("detect-fraud", {
          student_id: sid,
        });
        if (!error) scanned++;
      }
      toast.success(`Scanned ${scanned} active student(s)`);
    } catch (err) {
      toast.error("Fraud scan failed");
    }
    setScanning(false);
  };

  return (
    <DashboardLayout role="teacher">
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
              <Tv className="h-6 w-6 text-primary" /> Live Classroom Observing Terminal
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Real-time student workspace focus & integrity metrics</p>
          </div>
          <Button
            onClick={scanAllStudents}
            disabled={scanning || activeStudentIds.size === 0}
            variant="destructive"
            size="sm"
            className="font-mono text-xs gap-2"
          >
            <ScanSearch className="h-4 w-4 animate-pulse" />
            {scanning ? "Scanning..." : `Audit Integrity (${activeStudentIds.size} active)`}
          </Button>
        </div>

        {/* Fraud alerts bar */}
        <FraudAlerts students={students} assignments={assignments} />

        {/* Live student sessions grid */}
        <div className="space-y-3">
          <h2 className="text-xs uppercase font-mono tracking-wider font-bold text-muted-foreground flex items-center gap-1.5">
            <Laptop className="h-4 w-4 text-primary" /> Active Workspaces Heartbeats ({liveSessions?.length || 0})
          </h2>
          {(!liveSessions || liveSessions.length === 0) ? (
            <Card className="glass-panel border-dashed border-primary/20">
              <CardContent className="py-10 text-center text-xs text-muted-foreground font-mono">
                No active heartbeats recorded. Students must open the Code Editor workspace to report telemetry.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {liveSessions.map((session) => (
                <Card 
                  key={session.id} 
                  className={`glass-panel border ${
                    session.status === "abnormal" 
                      ? "border-red-500/20 bg-red-500/[0.01]" 
                      : session.status === "idle"
                      ? "border-yellow-500/20 bg-yellow-500/[0.01]"
                      : "border-white/5 bg-white/[0.01]"
                  }`}
                >
                  <CardContent className="p-4 space-y-3.5">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-foreground truncate">{session.student_name}</p>
                        <p className="text-[9px] font-mono text-muted-foreground">{session.student_uid || "—"}</p>
                      </div>
                      <Badge 
                        variant="outline" 
                        className={`text-[9px] font-mono uppercase ${
                          session.status === "abnormal"
                            ? "border-red-500/30 text-red-400 bg-red-500/5 animate-pulse"
                            : session.status === "idle"
                            ? "border-yellow-500/30 text-yellow-400 bg-yellow-500/5"
                            : "border-emerald-500/30 text-emerald-400 bg-emerald-500/5"
                        }`}
                      >
                        ● {session.status}
                      </Badge>
                    </div>

                    {/* Current File and Language */}
                    <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground bg-black/20 p-2 rounded-lg border border-white/5">
                      <FileCode className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="truncate flex-1">
                        {session.current_file ? `${session.current_file} (${session.language})` : "No open files"}
                      </span>
                      {session.editor_focus ? (
                        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[8px] h-4">FOCUS</Badge>
                      ) : (
                        <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 text-[8px] h-4">BLUR</Badge>
                      )}
                    </div>

                    {/* Metrics Row */}
                    <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                      <div className="bg-card p-1.5 rounded border border-white/5 flex flex-col items-center">
                        <EyeOff className="h-3.5 w-3.5 text-blue-400 mb-1" />
                        <span className="text-[9px] text-muted-foreground">Switches</span>
                        <span className="font-bold mt-0.5">{session.tab_switch_count}</span>
                      </div>
                      <div className="bg-card p-1.5 rounded border border-white/5 flex flex-col items-center">
                        <Copy className="h-3.5 w-3.5 text-purple-400 mb-1" />
                        <span className="text-[9px] text-muted-foreground">Pastes</span>
                        <span className="font-bold mt-0.5">{session.copy_paste_count}</span>
                      </div>
                      <div className="bg-card p-1.5 rounded border border-white/5 flex flex-col items-center">
                        <Flame className="h-3.5 w-3.5 text-orange-400 mb-1" />
                        <span className="text-[9px] text-muted-foreground">Spikes</span>
                        <span className="font-bold mt-0.5">{session.abnormal_typing_spikes}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Live Grep input */}
        <div className="relative font-mono">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--terminal-muted))]" />
          <Input
            placeholder="grep student name, uid, event, assignment..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-[hsl(var(--terminal-bg))] border-[hsl(var(--terminal-border))] text-[hsl(var(--terminal-fg))] placeholder:text-[hsl(var(--terminal-muted))] font-mono text-xs h-9.5"
          />
        </div>

        {/* Terminal window */}
        <div className="rounded-lg overflow-hidden shadow-lg border border-[hsl(var(--terminal-border))]">
          <TerminalHeader
            connected={connected}
            activeCount={activeStudentIds.size}
            totalEvents={filteredEvents.length}
          />

          <TerminalStats counts={statCounts} />

          {/* Event feed */}
          <div
            ref={scrollRef}
            className="bg-[hsl(var(--terminal-bg))] rounded-b-lg overflow-y-auto"
            style={{ height: 350 }}
          >
            {filteredEvents.length === 0 ? (
              <div className="flex items-center justify-center h-full font-mono text-xs text-[hsl(var(--terminal-muted))]">
                <span className="animate-pulse">▊</span>
                <span className="ml-2">Waiting for student activity...</span>
              </div>
            ) : (
              filteredEvents.map((event) => (
                <TerminalEventRow
                  key={event.id}
                  eventType={event.event_type}
                  studentName={getStudentName(event.student_id)}
                  assignmentTitle={event.assignment_id ? assignments[event.assignment_id] : undefined}
                  language={event.language}
                  codeSnapshot={event.code_snapshot}
                  timestamp={event.created_at}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
