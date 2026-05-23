import { useEffect, useState, useRef } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ScanSearch } from "lucide-react";
import { TerminalHeader } from "@/components/monitoring/TerminalHeader";
import { TerminalStats } from "@/components/monitoring/TerminalStats";
import { TerminalEventRow } from "@/components/monitoring/TerminalEventRow";
import { FraudAlerts } from "@/components/monitoring/FraudAlerts";
import { toast } from "sonner";

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

  useEffect(() => {
    const loadData = async () => {
      // Get this teacher's assignment IDs
      const { data: { user } } = await supabase.auth.getUser();
      const { data: myAssignments } = await supabase
        .from("assignments")
        .select("id")
        .eq("created_by", user?.id || "");
      const assignmentIds = myAssignments?.map((a: any) => a.id) || [];

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
        profiles.forEach((p: any) => { map[p.user_id] = p; });
        setStudents(map);
      }

      const { data: asgns } = await supabase.from("assignments").select("id, title").eq("created_by", user?.id || "");
      if (asgns) {
        const map: Record<string, string> = {};
        asgns.forEach((a: any) => { map[a.id] = a.title; });
        setAssignments(map);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    let teacherAssignmentIds: string[] = [];
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch teacher's assignment IDs for scoping
      const { data: myAssignments } = await supabase
        .from("assignments")
        .select("id")
        .eq("created_by", user.id);
      teacherAssignmentIds = myAssignments?.map((a: any) => a.id) || [];

      // Set up a single scoped realtime subscription
      channel = supabase
        .channel(`activity-monitor-${user.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "activity_events" },
          (payload) => {
            const newEvent = payload.new as ActivityEvent;
            // Only surface events for this teacher's assignments
            if (
              !newEvent.assignment_id ||
              teacherAssignmentIds.length === 0 ||
              teacherAssignmentIds.includes(newEvent.assignment_id)
            ) {
              setEvents((prev) => [...prev.slice(-199), newEvent]);
            }
          }
        )
        .subscribe((status) => {
          setConnected(status === "SUBSCRIBED");
        });
    };

    init();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

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
        await supabase.functions.invoke("detect-fraud", {
          body: { student_id: sid },
        });
        scanned++;
      }
      toast.success(`Scanned ${scanned} active student(s)`);
    } catch (err) {
      toast.error("Fraud scan failed");
    }
    setScanning(false);
  };

  return (
    <DashboardLayout role="teacher">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Live Monitoring</h1>
            <p className="text-sm text-muted-foreground">Real-time student activity terminal</p>
          </div>
          <Button
            onClick={scanAllStudents}
            disabled={scanning || activeStudentIds.size === 0}
            variant="destructive"
            size="sm"
            className="font-mono text-xs gap-2"
          >
            <ScanSearch className="h-4 w-4" />
            {scanning ? "Scanning..." : `Scan ${activeStudentIds.size} Active`}
          </Button>
        </div>

        {/* Fraud Alerts */}
        <FraudAlerts students={students} assignments={assignments} />

        {/* Search */}
        <div className="relative font-mono">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--terminal-muted))]" />
          <Input
            placeholder="grep student, uid, event, assignment..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-[hsl(var(--terminal-bg))] border-[hsl(var(--terminal-border))] text-[hsl(var(--terminal-fg))] placeholder:text-[hsl(var(--terminal-muted))] font-mono text-xs"
          />
        </div>

        {/* Terminal window */}
        <div className="rounded-lg overflow-hidden shadow-lg">
          <TerminalHeader
            connected={connected}
            activeCount={activeStudentIds.size}
            totalEvents={filteredEvents.length}
          />

          <TerminalStats counts={statCounts} />

          {/* Event feed */}
          <div
            ref={scrollRef}
            className="bg-[hsl(var(--terminal-bg))] border-x border-b border-[hsl(var(--terminal-border))] rounded-b-lg overflow-y-auto"
            style={{ height: 420 }}
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
