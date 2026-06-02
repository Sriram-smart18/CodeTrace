import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { realtimeManager } from "@/lib/realtimeManager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Circle, Code, User, Loader2 } from "lucide-react";
import MonacoEditor, { loader } from "@monaco-editor/react";
import { io } from "socket.io-client";

import type { Tables } from "@/integrations/supabase/types";

type Assignment = Tables<"assignments">;
type Profile = Tables<"profiles">;

interface ActivityEvent {
  id: string;
  student_id: string;
  assignment_id: string | null;
  event_type: string;
  code_snapshot: string | null;
  language: string | null;
  created_at: string;
}

const LANG_MAP: Record<string, string> = {
  javascript: "javascript",
  python: "python",
  java: "java",
  cpp: "cpp",
  c: "c",
  html: "html",
};

const EXECUTION_SERVER_URL = import.meta.env.VITE_EXECUTION_SERVER_URL || "http://localhost:3001";

export default function TeacherLiveSession() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [students, setStudents] = useState<Profile[]>([]);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [liveCode, setLiveCode] = useState<string | null>(null);

  const teacherSocketRef = useRef<any>(null);
  const selectedStudentRef = useRef<string | null>(null);

  const [socketConnected, setSocketConnected] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0);
  const [latency, setLatency] = useState<number | null>(null);
  const [lastEventName, setLastEventName] = useState<string>("None");

  useEffect(() => {
    selectedStudentRef.current = selectedStudent;
  }, [selectedStudent]);

  const verdictBadge = (verdict: string | null) => {
    if (!verdict) return <Badge variant="secondary" className="text-[9px] font-mono">Pending</Badge>;
    if (verdict === "Accepted") return <Badge className="bg-green-600 hover:bg-green-600 text-white font-mono text-[9px] px-1 py-0 h-4 shrink-0">ACCEPTED</Badge>;
    if (verdict === "Wrong Answer") return <Badge variant="destructive" className="font-mono text-[9px] px-1 py-0 h-4 shrink-0">WRONG ANSWER</Badge>;
    if (verdict === "Compilation Error") return <Badge variant="outline" className="border-red-500 text-red-500 font-mono text-[9px] px-1 py-0 h-4 shrink-0">COMPILATION ERROR</Badge>;
    return <Badge variant="outline" className="border-yellow-500 text-yellow-500 font-mono text-[9px] px-1 py-0 h-4 uppercase shrink-0">{verdict}</Badge>;
  };

  // Load assignment, students, and submissions
  useEffect(() => {
    if (!assignmentId) return;

    supabase.from("assignments").select("*").eq("id", assignmentId).single()
      .then(({ data }) => { if (data) setAssignment(data); });

    supabase.from("submissions").select("*").eq("assignment_id", assignmentId)
      .then(({ data }) => {
        if (data) setSubmissions(data);
      });

    Promise.all([
      supabase.from("activity_events").select("student_id").eq("assignment_id", assignmentId),
      supabase.from("submissions").select("student_id").eq("assignment_id", assignmentId)
    ]).then(([eventsRes, subsRes]) => {
      const idsFromEvents = eventsRes.data?.map((e: any) => e.student_id) || [];
      const idsFromSubs = subsRes.data?.map((s: any) => s.student_id) || [];
      const uniqueIds = [...new Set([...idsFromEvents, ...idsFromSubs])];

      if (uniqueIds.length > 0) {
        supabase.from("profiles").select("*").in("user_id", uniqueIds)
          .then(({ data: profiles }) => {
            if (profiles) setStudents(profiles);
          });
      }
    });

    supabase.from("activity_events").select("*")
      .eq("assignment_id", assignmentId)
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data }) => {
        if (data) setEvents((data as ActivityEvent[]).reverse());
      });
  }, [assignmentId]);

  const [realtimeVersion, setRealtimeVersion] = useState(0);

  // Monitor Supabase Realtime connection
  useEffect(() => {
    let lastState = supabase.realtime.isConnected();
    setRealtimeConnected(lastState);

    const interval = setInterval(() => {
      const currentState = supabase.realtime.isConnected();
      setRealtimeConnected(currentState);
      if (currentState && !lastState) {
        console.log("[SOCKET RECOVERY] Supabase Realtime reconnected. Forcing re-subscribe.");
        setRealtimeVersion(v => v + 1);
        setReconnectCount(c => c + 1);
      }
      lastState = currentState;
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Realtime subscription & Socket.IO monitoring
  useEffect(() => {
    if (!assignmentId) return;

    // 1. Supabase Realtime Setup
    const channelName = `live-session-${assignmentId}`;
    const key = `live-session-sub-${assignmentId}`;

    const subChannelName = `live-submissions-${assignmentId}`;
    const subKey = `live-submissions-sub-${assignmentId}`;

    try {
      realtimeManager.subscribeToChannel({
        key,
        channelName,
        config: {
          event: "INSERT",
          schema: "public",
          table: "activity_events",
        },
        callback: (payload) => {
          const newEvent = payload.new as ActivityEvent;
          if (newEvent.assignment_id === assignmentId) {
            console.log(`[REALTIME_EVENT_RECEIVED] activity_event: ${newEvent.event_type} from student: ${newEvent.student_id}`);
            setLastEventName(`${newEvent.event_type} (${newEvent.student_id.slice(-8)})`);
            
            setEvents((prev) => {
              if (prev.some(e => e.student_id === newEvent.student_id && e.event_type === newEvent.event_type && Math.abs(new Date(e.created_at).getTime() - new Date(newEvent.created_at).getTime()) < 1000)) {
                return prev;
              }
              return [...prev.slice(-499), newEvent];
            });

            setStudents((prevStudents) => {
              if (prevStudents.find((s) => s.user_id === newEvent.student_id)) {
                return prevStudents;
              }
              supabase.from("profiles").select("*").eq("user_id", newEvent.student_id).single()
                .then(({ data }) => {
                  if (data) {
                    setStudents((currentStudents) => {
                      if (currentStudents.find((s) => s.user_id === data.user_id)) return currentStudents;
                      return [...currentStudents, data];
                    });
                  }
                });
              return prevStudents;
            });

            console.log(`[TEACHER_UI_UPDATED] UI updated with activity event: ${newEvent.event_type}`);
          }
        }
      });

      realtimeManager.subscribeToChannel({
        key: subKey,
        channelName: subChannelName,
        config: {
          event: "*",
          schema: "public",
          table: "submissions",
        },
        callback: (payload) => {
          const newSub = payload.new as any;
          if (newSub.assignment_id === assignmentId) {
            console.log(`[REALTIME_EVENT_RECEIVED] submission: ${newSub.status} from student: ${newSub.student_id}`);
            setLastEventName(`submission: ${newSub.status} (${newSub.student_id.slice(-8)})`);
            
            setSubmissions((prev) => {
              const exists = prev.some((s) => s.id === newSub.id);
              if (exists) {
                return prev.map((s) => (s.id === newSub.id ? newSub : s));
              } else {
                return [...prev, newSub];
              }
            });

            setStudents((prevStudents) => {
              if (prevStudents.find((s) => s.user_id === newSub.student_id)) {
                return prevStudents;
              }
              supabase.from("profiles").select("*").eq("user_id", newSub.student_id).single()
                .then(({ data }) => {
                  if (data) {
                    setStudents((currentStudents) => {
                      if (currentStudents.find((s) => s.user_id === data.user_id)) return currentStudents;
                      return [...currentStudents, data];
                    });
                  }
                });
              return prevStudents;
            });

            console.log(`[TEACHER_UI_UPDATED] UI updated with submission event: ${newSub.status}`);
          }
        }
      });
    } catch (error) {
      console.error("[Realtime] Failed to subscribe to LiveSession events:", error);
    }

    // 2. Socket.IO Setup
    console.log("[SOCKET CONNECT] Initiating teacher monitoring socket connection to", EXECUTION_SERVER_URL);
    const socket = io(EXECUTION_SERVER_URL);
    teacherSocketRef.current = socket;

    socket.on("connect", () => {
      const roomId = `room_${assignmentId}`;
      console.log(`[SOCKET CONNECT] Teacher connected to monitoring backend. Joining room: ${roomId}`);
      setSocketConnected(true);
      socket.emit("join_room", roomId);
    });

    socket.on("disconnect", (reason) => {
      console.log("[SOCKET DISCONNECT] Teacher monitoring socket disconnected. Reason:", reason);
      setSocketConnected(false);
      if (reason === "io server disconnect" || reason === "transport close" || reason === "transport error" || reason === "ping timeout") {
        console.log("[SOCKET RECOVERY] Attempting socket reconnection...");
        setReconnectCount(c => c + 1);
        socket.connect();
      }
    });

    socket.on("connect_error", (error) => {
      console.error("[SOCKET ERROR] Teacher connection error:", error.message);
      setSocketConnected(false);
    });

    socket.on("code_update", (data: any) => {
      console.log(`[REALTIME_EVENT_RECEIVED] code_update from student: ${data.studentId}`);
      setLastEventName(`code_update (${data.studentId.slice(-8)})`);
      if (data.studentId === selectedStudentRef.current) {
        setLiveCode(data.code);
        console.log("[TEACHER_UI_UPDATED] UI updated with activity event: code_update");
      }
    });

    socket.on("student_activity", (data: any) => {
      console.log(`[REALTIME_EVENT_RECEIVED] ${data.eventType} from student: ${data.studentId}`);
      setLastEventName(`${data.eventType} (${data.studentId.slice(-8)})`);
      
      const newEvent = {
        id: crypto.randomUUID(),
        student_id: data.studentId,
        assignment_id: data.assignmentId,
        event_type: data.eventType,
        code_snapshot: data.codeSnapshot,
        language: data.language,
        created_at: data.timestamp || new Date().toISOString()
      };

      setEvents((prev) => {
        if (prev.some(e => e.student_id === newEvent.student_id && e.event_type === newEvent.event_type && Math.abs(new Date(e.created_at).getTime() - new Date(newEvent.created_at).getTime()) < 1000)) {
          return prev;
        }
        return [...prev.slice(-499), newEvent];
      });

      if (data.studentId === selectedStudentRef.current && data.codeSnapshot && data.eventType === "typing") {
        setLiveCode(data.codeSnapshot);
      }

      console.log(`[TEACHER_UI_UPDATED] UI updated with activity event: ${data.eventType}`);
    });

    let pingStartTime = Date.now();
    socket.on("pong", () => {
      const lat = Date.now() - pingStartTime;
      setLatency(lat);
      console.log(`[REALTIME_EVENT_RECEIVED] pong received, latency: ${lat}ms`);
      console.log(`[TEACHER_UI_UPDATED] UI updated with latency: ${lat}ms`);
    });

    const heartbeatInterval = setInterval(() => {
      if (socket.connected) {
        pingStartTime = Date.now();
        console.log("[SOCKET HEARTBEAT] Teacher sending ping");
        socket.emit("ping", { teacherId: "teacher", timestamp: new Date().toISOString() });
      }
    }, 15000);

    return () => {
      realtimeManager.unsubscribeChannel(key);
      realtimeManager.unsubscribeChannel(subKey);
      
      console.log("[SOCKET DISCONNECT] Cleaning up teacher monitoring socket.");
      clearInterval(heartbeatInterval);
      socket.disconnect();
      teacherSocketRef.current = null;
    };
  }, [assignmentId, realtimeVersion]);

  // Request code snapshot on student selection change
  useEffect(() => {
    if (!selectedStudent || !teacherSocketRef.current) return;
    
    setLiveCode(null);

    const socket = teacherSocketRef.current;
    if (socket.connected) {
      console.log(`[SOCKET EMIT] Requesting current code snapshot for student: ${selectedStudent}`);
      socket.emit("request_code", {
        roomId: `room_${assignmentId}`,
        studentId: selectedStudent
      });
    }
  }, [selectedStudent, assignmentId]);

  const activeStudentIds = useMemo(() => {
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    return new Set(
      events.filter((e) => new Date(e.created_at).getTime() > fiveMinAgo).map((e) => e.student_id)
    );
  }, [events]);

  const typingStudentIds = useMemo(() => {
    const fifteenSecsAgo = Date.now() - 15 * 1000;
    const typingSet = new Set<string>();
    
    // Sort events to check latest first
    const sorted = [...events].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const seen = new Set<string>();
    
    for (const e of sorted) {
      if (!seen.has(e.student_id)) {
        seen.add(e.student_id);
        if (e.event_type === "typing" && new Date(e.created_at).getTime() > fifteenSecsAgo) {
          typingSet.add(e.student_id);
        }
      }
    }
    return typingSet;
  }, [events]);

  const lastActivityTime = useMemo(() => {
    if (events.length === 0) return null;
    const sorted = [...events].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return sorted[0].created_at;
  }, [events]);

  const totalRunsCount = useMemo(() => {
    return events.filter(e => e.event_type === "run").length;
  }, [events]);

  const getStudentEvents = (studentId: string) =>
    events.filter((e) => e.student_id === studentId);

  const getLatestCode = (studentId: string): string | null => {
    const studentEvents = getStudentEvents(studentId).reverse();
    for (const e of studentEvents) {
      if (e.code_snapshot) return e.code_snapshot;
    }
    return null;
  };

  const getStudentStats = (studentId: string) => {
    const sEvents = getStudentEvents(studentId);
    return {
      typing: sEvents.filter((e) => e.event_type === "typing").length,
      runs: sEvents.filter((e) => e.event_type === "run").length,
      pastes: sEvents.filter((e) => e.event_type === "paste").length,
      submits: sEvents.filter((e) => e.event_type === "submit").length,
    };
  };

  const selectedCode = selectedStudent ? getLatestCode(selectedStudent) : null;
  const selectedProfile = students.find((s) => s.user_id === selectedStudent);
  const selectedStats = selectedStudent ? getStudentStats(selectedStudent) : null;

  const displayedCode = liveCode !== null ? liveCode : selectedCode;

  const monacoLanguage = useMemo(() => {
    if (!selectedStudent) return "javascript";
    const lastEvent = getStudentEvents(selectedStudent).reverse().find((e) => e.language);
    const lang = lastEvent?.language || "javascript";
    return LANG_MAP[lang] || "javascript";
  }, [selectedStudent, events]);

  return (
    <DashboardLayout role="teacher">
      <div className="space-y-4 h-full">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/teacher/assignments")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              Live Session: {assignment?.title || "Loading..."}
            </h1>
            <p className="text-xs text-muted-foreground">
              {students.length} student(s) · {activeStudentIds.size} active now
            </p>
          </div>
        </div>

        {/* Live Proctoring Summary Panel */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <Card className="glass-panel border-white/5 bg-white/[0.01] p-3 text-center">
            <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">Online Students</span>
            <div className="text-xl font-bold font-mono text-[hsl(var(--success))] mt-1">
              {activeStudentIds.size} / {students.length}
            </div>
          </Card>
          <Card className="glass-panel border-white/5 bg-white/[0.01] p-3 text-center">
            <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">Typing Status</span>
            <div className="text-xl font-bold font-mono text-cyan-400 mt-1">
              {typingStudentIds.size} typing
            </div>
          </Card>
          <Card className="glass-panel border-white/5 bg-white/[0.01] p-3 text-center">
            <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">Last Activity</span>
            <div className="text-xs font-semibold font-mono text-yellow-400 mt-2.5 truncate">
              {lastActivityTime ? new Date(lastActivityTime).toLocaleTimeString() : "No activity"}
            </div>
          </Card>
          <Card className="glass-panel border-white/5 bg-white/[0.01] p-3 text-center">
            <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">Run Count</span>
            <div className="text-xl font-bold font-mono text-orange-400 mt-1">
              {totalRunsCount} executions
            </div>
          </Card>
          <Card className="glass-panel border-white/5 bg-white/[0.01] p-3 text-center">
            <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">Submission Status</span>
            <div className="text-xl font-bold font-mono text-purple-400 mt-1">
              {submissions.filter(s => s.status === "submitted" || s.status === "evaluated").length} / {students.length}
            </div>
          </Card>
          <Card className="glass-panel border-white/5 bg-white/[0.01] p-3 text-center flex flex-col justify-between">
            <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">Connection Status</span>
            <div className="flex flex-col gap-0.5 items-center justify-center mt-1">
              <div className="flex items-center gap-1.5 text-[10px] font-mono font-medium">
                <span className={`w-1.5 h-1.5 rounded-full ${socketConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
                <span>Socket: {socketConnected ? "Online" : "Offline"}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-mono font-medium">
                <span className={`w-1.5 h-1.5 rounded-full ${realtimeConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
                <span>Realtime: {realtimeConnected ? "Online" : "Offline"}</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Main layout: student list + code viewer */}
        <div className="grid grid-cols-12 gap-4" style={{ height: "calc(100vh - 180px)" }}>
          {/* Student sidebar */}
          <div className="col-span-3 rounded-lg border bg-card overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b bg-muted/50">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Students ({students.length})
              </span>
            </div>
            <ScrollArea className="flex-1">
              <div className="divide-y">
                {students.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    No students have started yet
                  </div>
                ) : (
                  students.map((student) => {
                    const isActive = activeStudentIds.has(student.user_id);
                    const isSelected = selectedStudent === student.user_id;
                    const stats = getStudentStats(student.user_id);
                    const studentEvents = getStudentEvents(student.user_id);
                    const lastEvent = studentEvents[studentEvents.length - 1];
                    const lastEventTime = lastEvent ? new Date(lastEvent.created_at).toLocaleTimeString() : null;

                    const studentSubmissions = submissions.filter((s) => s.student_id === student.user_id);
                    const highestScore = studentSubmissions.length > 0 
                      ? Math.max(...studentSubmissions.map((s) => s.score || 0)) 
                      : null;
                    const latestSubmission = [...studentSubmissions].sort(
                      (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
                    )[0];
                    const latestVerdict = latestSubmission?.verdict || null;

                    return (
                      <button
                        key={student.user_id}
                        onClick={() => setSelectedStudent(student.user_id)}
                        className={`w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors ${
                          isSelected ? "bg-primary/10 border-l-2 border-primary" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Circle
                            className={`h-2 w-2 shrink-0 ${
                              isActive ? "fill-[hsl(var(--success))] text-[hsl(var(--success))]" : "fill-muted-foreground/30 text-muted-foreground/30"
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <div className="text-sm font-medium truncate flex items-center gap-1.5">
                                {student.name}
                                {typingStudentIds.has(student.user_id) && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                                )}
                              </div>
                              {highestScore !== null && (
                                <span className="text-xs font-mono font-semibold text-primary shrink-0">
                                  {highestScore}%
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-between gap-1 mt-0.5">
                              <div className="text-[10px] font-mono text-muted-foreground truncate">
                                {student.uid || "—"} {lastEventTime ? `· ${lastEventTime}` : ""}
                              </div>
                              {latestVerdict && (
                                <span className="shrink-0 scale-90 origin-right">
                                  {verdictBadge(latestVerdict)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-1 ml-4 flex-wrap items-center">
                          <span className="text-[9px] text-muted-foreground">⌨ {stats.typing}</span>
                          <span className="text-[9px] text-muted-foreground">▶ {stats.runs}</span>
                          {stats.pastes > 0 && (
                            <span className="text-[9px] text-[hsl(var(--warning))]">📋 {stats.pastes}</span>
                          )}
                          {stats.submits > 0 && (
                            <span className="text-[9px] text-[hsl(var(--success))]">✓ {stats.submits}</span>
                          )}
                          {typingStudentIds.has(student.user_id) && (
                            <span className="text-[9px] text-cyan-400 font-mono italic animate-pulse">typing...</span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>

            {/* Diagnostics Panel */}
            <div className="p-3 border-t bg-muted/30 space-y-2 text-[11px] font-mono">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                Telemetry Diagnostics
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Active Peers:</span>
                <span className="text-green-500 font-bold">{activeStudentIds.size}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Event Count:</span>
                <span className="text-blue-400 font-bold">{events.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Latency:</span>
                <span className="text-cyan-400 font-bold">{latency !== null ? `${latency} ms` : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Event:</span>
                <span className="text-yellow-400 font-bold truncate max-w-[120px]" title={lastEventName}>{lastEventName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reconnects:</span>
                <span className="text-red-400 font-bold">{reconnectCount}</span>
              </div>
            </div>
          </div>

          {/* Code viewer - Monaco Editor */}
          <div className="col-span-9 rounded-lg overflow-hidden border flex flex-col bg-[hsl(var(--terminal-bg))]">
            {/* Editor tab bar */}
            <div className="flex items-center gap-1 px-2 py-1 bg-[hsl(220,25%,10%)] border-b border-[hsl(var(--terminal-border))]">
              {selectedProfile ? (
                <div className="flex items-center gap-2 px-3 py-1 bg-[hsl(var(--terminal-bg))] rounded-t text-xs font-mono">
                  <Code className="h-3 w-3 text-[hsl(var(--terminal-cyan))]" />
                  <span className="text-[hsl(var(--terminal-fg))]">{selectedProfile.name}</span>
                  <span className="text-[hsl(var(--terminal-muted))]">({selectedProfile.uid || "—"})</span>
                  {activeStudentIds.has(selectedProfile.user_id) && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-[hsl(var(--success))] text-[hsl(var(--success))]">
                      LIVE
                    </Badge>
                  )}
                </div>
              ) : (
                <span className="text-xs text-[hsl(var(--terminal-muted))] px-3 py-1 font-mono">
                  Select a student →
                </span>
              )}
              {selectedStats && (
                <div className="ml-auto flex items-center gap-3 text-[10px] font-mono text-[hsl(var(--terminal-muted))] mr-2">
                  <span>Keys: {selectedStats.typing}</span>
                  <span>Runs: {selectedStats.runs}</span>
                  <span className={selectedStats.pastes > 2 ? "text-[hsl(var(--terminal-yellow))]" : ""}>
                    Pastes: {selectedStats.pastes}
                  </span>
                </div>
              )}
            </div>

            {/* Monaco Editor */}
            <div className="flex-1 min-h-0">
              {!selectedStudent ? (
                <div className="flex items-center justify-center h-full text-[hsl(var(--terminal-muted))] font-mono text-sm">
                  <div className="text-center space-y-2">
                    <User className="h-8 w-8 mx-auto opacity-30" />
                    <p>Select a student to view their live code</p>
                  </div>
                </div>
              ) : (!selectedCode && liveCode === null) ? (
                <div className="flex items-center justify-center h-full text-[hsl(var(--terminal-muted))] font-mono text-sm">
                  <p>No code snapshot available yet</p>
                </div>
              ) : (
                <MonacoEditor
                  key={`${selectedStudent}-${monacoLanguage}`}
                  height="100%"
                  language={monacoLanguage}
                  value={displayedCode || ""}
                  theme="vs-dark"
                  loading={
                    <div className="flex items-center justify-center h-full w-full bg-[#1e1e1e]">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  }
                  beforeMount={(monaco) => {
                    monaco.editor.defineTheme("codetrace-dark", {
                      base: "vs-dark",
                      inherit: true,
                      rules: [
                        { token: "comment", foreground: "6A9955", fontStyle: "italic" },
                        { token: "keyword", foreground: "C586C0" },
                        { token: "keyword.control", foreground: "C586C0" },
                        { token: "string", foreground: "CE9178" },
                        { token: "number", foreground: "B5CEA8" },
                        { token: "type", foreground: "4EC9B0" },
                        { token: "type.identifier", foreground: "4EC9B0" },
                        { token: "function", foreground: "DCDCAA" },
                        { token: "variable", foreground: "9CDCFE" },
                        { token: "variable.predefined", foreground: "4FC1FF" },
                        { token: "constant", foreground: "4FC1FF" },
                        { token: "delimiter", foreground: "D4D4D4" },
                        { token: "delimiter.bracket", foreground: "FFD700" },
                        { token: "operator", foreground: "D4D4D4" },
                        { token: "tag", foreground: "569CD6" },
                        { token: "attribute.name", foreground: "9CDCFE" },
                        { token: "attribute.value", foreground: "CE9178" },
                        { token: "metatag", foreground: "569CD6" },
                        { token: "annotation", foreground: "DCDCAA" },
                        { token: "regexp", foreground: "D16969" },
                      ],
                      colors: {
                        "editor.background": "#1E1E2E",
                        "editor.foreground": "#D4D4D4",
                        "editorLineNumber.foreground": "#858585",
                        "editorLineNumber.activeForeground": "#C6C6C6",
                        "editor.lineHighlightBackground": "#2A2D3E",
                        "editor.selectionBackground": "#264F78",
                        "editorBracketMatch.background": "#0064001a",
                        "editorBracketMatch.border": "#888888",
                      },
                    });
                  }}
                  onMount={(editorInstance, monaco) => {
                    const model = editorInstance.getModel();
                    if (model) {
                      monaco.editor.setModelLanguage(model, monacoLanguage);
                    }
                    monaco.editor.setTheme("codetrace-dark");
                  }}
                  options={{
                    readOnly: true,
                    minimap: { enabled: true },
                    fontSize: 13,
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                    fontLigatures: true,
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                    padding: { top: 8 },
                    domReadOnly: true,
                    renderLineHighlight: "all",
                    smoothScrolling: true,
                    cursorBlinking: "smooth",
                    bracketPairColorization: { enabled: true },
                    guides: { bracketPairs: true, indentation: true },
                    colorDecorators: true,
                    matchBrackets: "always",
                    "semanticHighlighting.enabled": true,
                  }}
                />
              )}
            </div>

            {/* Status bar */}
            <div className="flex items-center justify-between px-3 py-1 bg-primary text-primary-foreground text-[10px] font-mono">
              <div className="flex items-center gap-3">
                <span>{monacoLanguage}</span>
                <span>UTF-8</span>
              </div>
              <div className="flex items-center gap-3">
                <span>{selectedCode ? `${selectedCode.split("\n").length} lines` : "—"}</span>
                <span>Live View · Read Only</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}