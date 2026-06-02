import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Activity, ShieldAlert, Monitor, Terminal as TermIcon, Play, Save, CheckCircle, RefreshCw, Send, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";

const EXECUTION_SERVER_URL = import.meta.env.VITE_EXECUTION_SERVER_URL || "http://localhost:3001";

interface LogMessage {
  id: string;
  timestamp: string;
  type: "student" | "server" | "realtime" | "ui" | "info";
  content: string;
}

export default function TeacherMonitoringTest() {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  
  // Selected simulation params
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>("");
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [simulatedCode, setSimulatedCode] = useState<string>(
    "function helloWorld() {\n  console.log('Hello from student simulator!');\n}"
  );

  // Connection & metrics
  const [studentConnected, setStudentConnected] = useState(false);
  const [teacherConnected, setTeacherConnected] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  
  const [eventCount, setEventCount] = useState(0);
  const [latency, setLatency] = useState<number | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);

  // Diagnostics logs
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Sockets references
  const studentSocketRef = useRef<Socket | null>(null);
  const teacherSocketRef = useRef<Socket | null>(null);
  const realtimeChannelRef = useRef<any>(null);

  const addLog = (type: LogMessage["type"], prefix: string, message: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        timestamp: time,
        type,
        content: `${prefix} ${message}`,
      },
    ]);
    setEventCount((prev) => prev + 1);
  };

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // Load initial options
  useEffect(() => {
    const loadOptions = async () => {
      const { data: asgns } = await supabase.from("assignments").select("id, title").limit(10);
      if (asgns && asgns.length > 0) {
        setAssignments(asgns);
        setSelectedAssignmentId(asgns[0].id);
      }
      
      const { data: profiles } = await supabase.from("profiles").select("user_id, name").eq("role", "student").limit(10);
      if (profiles && profiles.length > 0) {
        setStudents(profiles);
        setSelectedStudentId(profiles[0].user_id);
      }
    };
    loadOptions();
  }, []);

  // Connect sockets and realtime when selection changes
  useEffect(() => {
    if (!selectedAssignmentId || !selectedStudentId) return;

    const roomId = `room_${selectedAssignmentId}`;
    addLog("info", "[INFO]", `Configuring simulation room: ${roomId}`);

    // --- Student Socket.IO Connection ---
    const studentSocket = io(EXECUTION_SERVER_URL);
    studentSocketRef.current = studentSocket;

    studentSocket.on("connect", () => {
      setStudentConnected(true);
      addLog("info", "[INFO]", `Student simulator socket connected. Joining ${roomId}`);
      studentSocket.emit("join_room", roomId);
    });

    studentSocket.on("disconnect", () => {
      setStudentConnected(false);
      addLog("info", "[INFO]", "Student simulator socket disconnected.");
    });

    // --- Teacher Socket.IO Connection ---
    const teacherSocket = io(EXECUTION_SERVER_URL);
    teacherSocketRef.current = teacherSocket;

    teacherSocket.on("connect", () => {
      setTeacherConnected(true);
      addLog("info", "[INFO]", `Teacher listener socket connected. Joining ${roomId}`);
      teacherSocket.emit("join_room", roomId);
    });

    teacherSocket.on("disconnect", () => {
      setTeacherConnected(false);
      addLog("info", "[INFO]", "Teacher listener socket disconnected.");
    });

    // Teacher listeners
    teacherSocket.on("student_activity", (data: any) => {
      // Simulate server logging and realtime relay
      addLog("server", "[SERVER_EVENT_RECEIVED]", `${data.eventType} from student: ${data.studentId}`);
      addLog("realtime", "[REALTIME_EVENT_RECEIVED]", `received via socket: ${data.eventType} from ${data.studentId.slice(-8)}`);
      addLog("ui", "[TEACHER_UI_UPDATED]", `UI updated with activity event: ${data.eventType}`);
    });

    teacherSocket.on("code_update", (data: any) => {
      addLog("server", "[SERVER_EVENT_RECEIVED]", `code_update from student: ${data.studentId}`);
      addLog("realtime", "[REALTIME_EVENT_RECEIVED]", `received via socket: code_update (${data.code.length} chars)`);
      addLog("ui", "[TEACHER_UI_UPDATED]", "UI updated with activity event: code_update");
    });

    let pingStart = 0;
    teacherSocket.on("pong", () => {
      const lat = Date.now() - pingStart;
      setLatency(lat);
      addLog("realtime", "[REALTIME_EVENT_RECEIVED]", `pong received from socket server, latency: ${lat}ms`);
      addLog("ui", "[TEACHER_UI_UPDATED]", `UI updated with latency: ${lat}ms`);
    });

    // Teacher Socket.IO heartbeat (15s)
    const socketHeartbeat = setInterval(() => {
      if (teacherSocket.connected) {
        pingStart = Date.now();
        addLog("info", "[HEARTBEAT]", "Teacher sending ping to Socket.IO");
        teacherSocket.emit("ping", { teacherId: "teacher" });
      }
    }, 15000);

    // --- Supabase Realtime Setup ---
    const channelName = `live-session-test-${selectedAssignmentId}`;
    const channel = supabase.channel(channelName);
    realtimeChannelRef.current = channel;

    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activity_events",
          filter: `assignment_id=eq.${selectedAssignmentId}`,
        },
        (payload) => {
          const newEvent = payload.new as any;
          addLog("realtime", "[REALTIME_EVENT_RECEIVED]", `received via Supabase Realtime: DB activity ${newEvent.event_type}`);
          addLog("ui", "[TEACHER_UI_UPDATED]", `UI updated with DB activity: ${newEvent.event_type}`);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeConnected(true);
          addLog("info", "[INFO]", "Supabase Realtime channel SUBSCRIBED successfully.");
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          setRealtimeConnected(false);
          addLog("info", "[INFO]", `Supabase Realtime channel disconnected or status is ${status}.`);
        }
      });

    // Supabase Realtime reconnection checker
    const realtimeReconnector = setInterval(() => {
      const state = supabase.realtime.isConnected();
      setRealtimeConnected(state);
    }, 5000);

    return () => {
      clearInterval(socketHeartbeat);
      clearInterval(realtimeReconnector);
      
      studentSocket.disconnect();
      teacherSocket.disconnect();
      supabase.removeChannel(channel);
      
      studentSocketRef.current = null;
      teacherSocketRef.current = null;
      realtimeChannelRef.current = null;
      
      addLog("info", "[INFO]", "Cleaned up simulator room sockets and realtime channel.");
    };
  }, [selectedAssignmentId, selectedStudentId]);

  // Simulate emitting student events
  const emitSimulatedEvent = async (eventType: "typing" | "run" | "save" | "submit") => {
    if (!selectedAssignmentId || !selectedStudentId) {
      toast.error("Please configure Student and Assignment IDs first.");
      return;
    }

    const payload = {
      eventType,
      studentId: selectedStudentId,
      assignmentId: selectedAssignmentId,
      codeSnapshot: simulatedCode,
      language: "javascript",
      timestamp: new Date().toISOString(),
    };

    // 1. Emit STUDENT_EVENT_SENT
    addLog("student", "[STUDENT_EVENT_SENT]", `Emitted activity event: ${eventType} from student simulator`);

    // 2. Emit via Socket.IO
    if (studentSocketRef.current && studentSocketRef.current.connected) {
      studentSocketRef.current.emit("student_activity", payload);
      // If code change, also emit code_update
      if (eventType === "typing" || eventType === "save") {
        studentSocketRef.current.emit("code_update", {
          roomId: `room_${selectedAssignmentId}`,
          code: simulatedCode,
          language: "javascript",
          studentId: selectedStudentId,
        });
      }
    } else {
      toast.warning("Student Socket.IO disconnected. Emitting via database only.");
    }

    // 3. Write to Supabase Database (triggers Supabase Realtime)
    try {
      const dbEventType = eventType === "save" ? "typing" : eventType;
      const { error } = await supabase.from("activity_events").insert({
        student_id: selectedStudentId,
        assignment_id: selectedAssignmentId,
        event_type: dbEventType,
        code_snapshot: simulatedCode,
        language: "javascript",
      });

      if (!error) {
        addLog("student", "[STUDENT_EVENT_SENT]", `Event persisted to database table activity_events: ${dbEventType}`);
      } else {
        addLog("info", "[DB ERROR]", error.message);
      }
    } catch (err: any) {
      addLog("info", "[DB ERROR]", err.message || "Unknown db exception");
    }
  };

  const handleClearTerminal = () => {
    setLogs([]);
    setEventCount(0);
  };

  return (
    <DashboardLayout role="teacher">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-white/5">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Radio className="h-5 w-5 text-primary animate-pulse" />
              Live Monitoring End-to-End Test Mode
            </h1>
            <p className="text-xs text-muted-foreground">
              Simulate student coding IDE behaviors, monitor WebSocket relay, and observe real-time diagnostics.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleClearTerminal} className="text-xs">
            Clear Logs
          </Button>
        </div>

        {/* Configuration Bar */}
        <Card className="glass-panel border-white/5 bg-white/[0.01]">
          <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Select Assignment Profile</Label>
              <Select value={selectedAssignmentId} onValueChange={setSelectedAssignmentId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select Assignment" />
                </SelectTrigger>
                <SelectContent>
                  {assignments.map((a) => (
                    <SelectItem key={a.id} value={a.id} className="text-xs">
                      {a.title} ({a.id.slice(0, 8)})
                    </SelectItem>
                  ))}
                  {assignments.length === 0 && (
                    <SelectItem value="manual" disabled className="text-xs">No assignments loaded</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-1">
              <Label className="text-xs">Select Student Avatar</Label>
              <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select Student" />
                </SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.user_id} value={s.user_id} className="text-xs">
                      {s.name} ({s.user_id.slice(0, 8)})
                    </SelectItem>
                  ))}
                  {students.length === 0 && (
                    <SelectItem value="manual" disabled className="text-xs">No students loaded</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-2 items-end">
              <div className="flex flex-col items-center justify-center p-2 rounded bg-slate-900/40 border border-white/5 h-9">
                <span className="text-[8px] uppercase tracking-wider text-muted-foreground">Student IO</span>
                <span className={`text-[10px] font-bold mt-0.5 ${studentConnected ? "text-emerald-500" : "text-red-500"}`}>
                  {studentConnected ? "ONLINE" : "OFFLINE"}
                </span>
              </div>
              <div className="flex flex-col items-center justify-center p-2 rounded bg-slate-900/40 border border-white/5 h-9">
                <span className="text-[8px] uppercase tracking-wider text-muted-foreground">Teacher IO</span>
                <span className={`text-[10px] font-bold mt-0.5 ${teacherConnected ? "text-emerald-500" : "text-red-500"}`}>
                  {teacherConnected ? "ONLINE" : "OFFLINE"}
                </span>
              </div>
              <div className="flex flex-col items-center justify-center p-2 rounded bg-slate-900/40 border border-white/5 h-9">
                <span className="text-[8px] uppercase tracking-wider text-muted-foreground">Realtime DB</span>
                <span className={`text-[10px] font-bold mt-0.5 ${realtimeConnected ? "text-emerald-500" : "text-red-500"}`}>
                  {realtimeConnected ? "ONLINE" : "OFFLINE"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dashboard Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          
          {/* Student Simulator Panel */}
          <Card className="lg:col-span-4 border-slate-800 bg-slate-950 text-slate-100 flex flex-col justify-between">
            <CardHeader className="pb-3 border-b border-slate-800">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-cyan-400">
                <Activity className="h-4 w-4" />
                Student Code Simulator
              </CardTitle>
              <CardDescription className="text-[10px] text-slate-400">
                Simulate editor behavior and mock coding keystrokes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4 flex-1">
              <div className="space-y-1">
                <Label className="text-[11px] text-slate-400">Mock Editor Code Snapshot</Label>
                <Textarea
                  value={simulatedCode}
                  onChange={(e) => setSimulatedCode(e.target.value)}
                  rows={8}
                  className="font-mono text-xs bg-slate-900 border-slate-800 text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => emitSimulatedEvent("typing")} 
                  className="text-xs bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-200"
                >
                  <TermIcon className="h-3.5 w-3.5 mr-1 text-cyan-400" />
                  Emit typing
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => emitSimulatedEvent("run")} 
                  className="text-xs bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-200"
                >
                  <Play className="h-3.5 w-3.5 mr-1 text-orange-400 animate-pulse" />
                  Emit run
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => emitSimulatedEvent("save")} 
                  className="text-xs bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-200"
                >
                  <Save className="h-3.5 w-3.5 mr-1 text-yellow-400" />
                  Emit save
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => emitSimulatedEvent("submit")} 
                  className="text-xs bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-200"
                >
                  <CheckCircle className="h-3.5 w-3.5 mr-1 text-emerald-400" />
                  Emit submit
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Diagnostics Console Panel */}
          <Card className="lg:col-span-8 border-slate-800 bg-slate-950 text-slate-100 flex flex-col min-h-[450px]">
            <CardHeader className="pb-3 border-b border-slate-800 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-red-400">
                  <Monitor className="h-4 w-4" />
                  Diagnostics Telemetry Terminal
                </CardTitle>
                <CardDescription className="text-[10px] text-slate-400">
                  Captured packet events and round-trip socket diagnostics.
                </CardDescription>
              </div>
              <div className="flex items-center gap-4 text-xs font-mono text-slate-400 shrink-0">
                <div>Events: <span className="text-primary font-bold">{eventCount}</span></div>
                <div>Latency: <span className="text-cyan-400 font-bold">{latency !== null ? `${latency}ms` : "—"}</span></div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col overflow-hidden p-0 bg-black/40">
              {/* Terminal Logs View */}
              <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] space-y-1.5 min-h-[300px] max-h-[380px]">
                {logs.map((log) => {
                  let colorClass = "text-slate-300";
                  if (log.content.includes("[STUDENT_EVENT_SENT]")) colorClass = "text-cyan-400";
                  else if (log.content.includes("[SERVER_EVENT_RECEIVED]")) colorClass = "text-green-400";
                  else if (log.content.includes("[REALTIME_EVENT_RECEIVED]")) colorClass = "text-yellow-500 font-semibold";
                  else if (log.content.includes("[TEACHER_UI_UPDATED]")) colorClass = "text-purple-400 animate-pulse";
                  else if (log.content.includes("[HEARTBEAT]")) colorClass = "text-slate-500";
                  
                  return (
                    <div key={log.id} className="flex gap-2 leading-relaxed">
                      <span className="text-slate-600 select-none shrink-0">[{log.timestamp}]</span>
                      <span className={`${colorClass} whitespace-pre-wrap`}>{log.content}</span>
                    </div>
                  );
                })}
                {logs.length === 0 && (
                  <div className="h-full flex items-center justify-center text-slate-600 italic select-none">
                    No diagnostics captured. Trigger student events to verify the event chain.
                  </div>
                )}
                <div ref={terminalEndRef} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
