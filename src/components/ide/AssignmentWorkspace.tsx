import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Editor from "@monaco-editor/react";
import type { Database, Json } from "@/integrations/supabase/types";
import { useTheme } from "next-themes";
import { Play, Send, ArrowLeft, Loader2, Square, Terminal as TerminalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { saveQueue } from "@/utils/saveQueue";
import { useIdeHealth } from "@/hooks/useIdeHealth";
import { SubsystemErrorBoundary } from "./error-boundaries/SubsystemErrorBoundary";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { useBehavioralLogger, calculateTemplateChars } from "@/hooks/useBehavioralLogger";

import { Terminal as XTerm } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import "xterm/css/xterm.css";
import { io, Socket } from "socket.io-client";

interface AssignmentWorkspaceProps {
  assignmentId?: string;
}

const EXECUTION_SERVER_URL = import.meta.env.VITE_EXECUTION_SERVER_URL || "http://localhost:3001";

export const AssignmentWorkspace: React.FC<AssignmentWorkspaceProps> = ({ assignmentId }) => {
  console.count('[ASSIGNMENT WORKSPACE RENDER]');
  
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, session } = useAuth();
  const { theme } = useTheme();
  
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("python");
  
  type Assignment = Database["public"]["Tables"]["assignments"]["Row"];
  type Submission = Database["public"]["Tables"]["submissions"]["Row"];

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  
  type TerminalMode = 'idle' | 'executing';
  const [execState, setExecState] = useState<TerminalMode>('idle');
  
  const [submitting, setSubmitting] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);
  const lineBufferRef = useRef<string>("");
  
  const editorRef = useRef<Parameters<import("@monaco-editor/react").OnMount>[0] | null>(null);

  const { healthState, isOffline, isRecovering } = useIdeHealth();

  const mountedRef = useRef(false);

  const monitoringSocketRef = useRef<Socket | null>(null);
  const codeRef = useRef(code);
  const languageRef = useRef(language);

  // Keep refs updated to prevent stale closures in event callbacks
  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  const { 
    logChange, 
    logPaste, 
    logTabSwitch, 
    logWindowBlur, 
    logWindowFocus, 
    logRun, 
    getBehavioralSummary, 
    resetLogger 
  } = useBehavioralLogger();
  const lastPasteRef = useRef<{ timestamp: number; chars: number }>({ timestamp: 0, chars: 0 });

  // Reset logger when assignment changes
  useEffect(() => {
    resetLogger();
  }, [assignmentId, resetLogger]);

  // Listen to window/tab focus changes for anti-cheating telemetry
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        logTabSwitch();
        logWindowBlur();
      } else {
        logWindowFocus();
      }
    };
    const handleBlur = () => {
      logWindowBlur();
    };
    const handleFocus = () => {
      logWindowFocus();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, [logTabSwitch, logWindowBlur, logWindowFocus]);

  const { trackTyping, trackRun, trackSubmit, trackSave, trackPaste } = useActivityTracker({
    studentId: user?.id,
    assignmentId,
    language,
    socketRef: monitoringSocketRef
  });

  // Cleanup sockets on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (monitoringSocketRef.current) {
        monitoringSocketRef.current.disconnect();
      }
    };
  }, []);

  // Setup persistent Socket.IO connection for live monitoring
  useEffect(() => {
    if (!assignmentId || !user?.id || !session?.access_token) return;

    const roomId = `room_${assignmentId}`;
    console.log("[SOCKET CONNECT] Initiating student monitoring socket connection to", EXECUTION_SERVER_URL);
    const socket = io(EXECUTION_SERVER_URL, {
      auth: {
        token: session?.access_token
      }
    });
    monitoringSocketRef.current = socket;

    socket.on("connect", () => {
      console.log(`[SOCKET CONNECT] Student connected to monitoring backend. Joining room: ${roomId}`);
      socket.emit("join_room", roomId);
    });

    socket.on("disconnect", (reason) => {
      console.log("[SOCKET DISCONNECT] Student monitoring socket disconnected. Reason:", reason);
      if (reason === "io server disconnect" || reason === "transport close" || reason === "transport error" || reason === "ping timeout") {
        console.log("[SOCKET RECOVERY] Attempting socket reconnection...");
        socket.connect();
      }
    });

    socket.on("connect_error", (error) => {
      console.error("[SOCKET ERROR] Student monitoring connection error:", error.message);
    });

    socket.on("request_code", (data?: { studentId?: string }) => {
      if (!data || !data.studentId || data.studentId === user.id) {
        console.log("[SOCKET RECEIVE] Request code received from teacher. Emitting current code snapshot.");
        socket.emit("code_update", {
          roomId,
          code: codeRef.current,
          language: languageRef.current,
          studentId: user.id
        });
      }
    });

    socket.on("pong", () => {
      console.log("[SOCKET HEARTBEAT] Student received pong from server");
    });

    const heartbeatInterval = setInterval(() => {
      if (socket.connected) {
        console.log(`[STUDENT_EVENT_SENT] ping`);
        socket.emit("ping", { studentId: user.id, timestamp: new Date().toISOString() });
      }
    }, 15000);

    return () => {
      console.log("[SOCKET DISCONNECT] Cleaning up student monitoring socket.");
      clearInterval(heartbeatInterval);
      socket.disconnect();
      monitoringSocketRef.current = null;
    };
  }, [assignmentId, user?.id, session?.access_token]);

  // Emit code updates when code changes
  useEffect(() => {
    if (!assignmentId || !user?.id) return;
    if (!monitoringSocketRef.current) return;

    const roomId = `room_${assignmentId}`;
    const timeout = setTimeout(() => {
      if (monitoringSocketRef.current && monitoringSocketRef.current.connected) {
        console.log("[SOCKET EMIT] Emitting code update. Length:", code.length);
        monitoringSocketRef.current.emit("code_update", {
          roomId,
          code,
          language,
          studentId: user.id
        });
      }
    }, 500); // 500ms debounce to avoid flooding the socket

    return () => clearTimeout(timeout);
  }, [code, language, assignmentId, user?.id]);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      console.log('[WORKSPACE BOOT]', {
        workspaceType: 'editor',
        mode: assignmentId ? 'assignment' : 'practice',
        assignmentId
      });
    }
  }, [assignmentId]);

  // Load persistence
  useEffect(() => {
    const keyPrefix = assignmentId ? `codetrace:v2:assignment-${assignmentId}` : `codetrace:v2:practice-local`;
    const savedCode = localStorage.getItem(`${keyPrefix}-code`);
    const savedLang = localStorage.getItem(`${keyPrefix}-lang`);
    if (savedCode) setCode(savedCode);
    if (savedLang) setLanguage(savedLang);
  }, [assignmentId]);

  // Save persistence using Singleton Queue
  useEffect(() => {
    const keyPrefix = assignmentId ? `codetrace:v2:assignment-${assignmentId}` : `codetrace:v2:practice-local`;
    
    saveQueue.enqueue({
      id: keyPrefix,
      version: Date.now(),
      payload: { code, language },
      persistFn: (payload) => {
        try {
          localStorage.setItem(`${keyPrefix}-code`, payload.code);
          localStorage.setItem(`${keyPrefix}-lang`, payload.language);
          // Trigger save event emission
          trackSave(payload.code);
        } catch (e) {
          console.error("Error saving to localStorage", e);
        }
      }
    });
  }, [code, language, assignmentId, trackSave]);

  useEffect(() => {
    const fetchAssignmentData = async () => {
      if (!assignmentId) return; // Practice mode: no DB queries
      
      const { data: asg } = await supabase.from("assignments").select("*").eq("id", assignmentId).single();
      if (asg) setAssignment(asg);

      if (user?.id) {
        const { data: sub } = await supabase
          .from("submissions")
          .select("*")
          .eq("assignment_id", assignmentId)
          .eq("student_id", user.id)
          .maybeSingle();
        
        if (sub) {
          setSubmission(sub);
          if (sub.status === "evaluated" || sub.status === "flagged") setIsLocked(true);
          // If we haven't touched the code, and there's a submission, load it
          if (!localStorage.getItem(`assignment-${assignmentId}-code`) && sub.code) {
            setCode(sub.code);
          }
        }
      }
    };
    fetchAssignmentData();
  }, [assignmentId, user?.id]);

  // Initialize xterm instance
  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XTerm({
      theme: {
        background: "#0b0f19",
        foreground: "#00ff00",
        cursor: "#00ff00",
        selectionBackground: "rgba(0, 255, 0, 0.3)"
      },
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 13,
      cursorBlink: true,
      convertEol: true
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    
    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    setTimeout(() => {
      try { fitAddon.fit(); } catch (e) { /* ignore fit error */ }
    }, 150);

    const handleResize = () => {
      try { fitAddon.fit(); } catch (e) { /* ignore fit error */ }
    };
    window.addEventListener("resize", handleResize);

    term.onData((data) => {
      console.log("[XTERM KEY]", JSON.stringify(data));

      if (data.startsWith("\u001b[")) {
        return;
      }

      if (data === "\r") {
        console.log("[ENTER PRESSED]", lineBufferRef.current);
        if (socketRef.current && currentSessionIdRef.current) {
          socketRef.current.emit("input", {
            sessionId: currentSessionIdRef.current,
            data: lineBufferRef.current + "\n"
          });
        }
        term.write("\r\n");
        lineBufferRef.current = "";
        return;
      }

      if (data === "\u007f" || data === "\b") {
        if (lineBufferRef.current.length > 0) {
          lineBufferRef.current = lineBufferRef.current.slice(0, -1);
          console.log("[INPUT BUFFER]", lineBufferRef.current);
          term.write("\b \b");
        }
        return;
      }

      lineBufferRef.current += data;
      console.log("[INPUT BUFFER]", lineBufferRef.current);
      term.write(data);
    });

    term.write("Run your code to see output here.\r\n");

    return () => {
      window.removeEventListener("resize", handleResize);
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  const handleRunCode = useCallback(() => {
    if (execState === 'executing') return;
    
    lineBufferRef.current = "";
    if (xtermRef.current) {
      xtermRef.current.clear();
      xtermRef.current.focus();
    }

    if (!session?.access_token) {
      if (xtermRef.current) {
        xtermRef.current.write(`\r\n\x1b[31m[Connection Error: No authentication token found]\x1b[0m\r\n`);
      }
      setExecState('idle');
      return;
    }

    setExecState('executing');
    logRun();
    
    const summary = getBehavioralSummary();
    const pasteSnapshot = {
      pasteCount: summary.paste_count,
      totalPastedChars: summary.total_pasted_chars,
      totalPastedLines: summary.total_pasted_lines,
    };
    trackRun(code, pasteSnapshot);
    
    const sessionId = crypto.randomUUID();
    currentSessionIdRef.current = sessionId;

    const socket = io(EXECUTION_SERVER_URL, {
      auth: {
        token: session.access_token
      }
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[SOCKET CONNECT]");
      socket.emit("run", {
        sessionId,
        language,
        code,
        userId: user?.id
      });
    });

    socket.on("disconnect", () => {
      console.log("[SOCKET DISCONNECT]");
    });

    socket.on("output", (data: string) => {
      console.log("[STDOUT]", data);
      if (xtermRef.current) {
        xtermRef.current.write(data);
      }
    });

    socket.on("exit", (exitCode: number) => {
      console.log("[PROCESS CLOSE]", exitCode);
      setExecState('idle');
      socket.disconnect();
      socketRef.current = null;
    });

    socket.on("status", (status) => {
      if (status === 'killed' || status === 'finished') {
        setExecState('idle');
        socket.disconnect();
        socketRef.current = null;
      }
    });
    
    socket.on("connect_error", (err) => {
      if (xtermRef.current) {
        xtermRef.current.write(`\r\n\x1b[31m[Connection Error: ${err.message}]\x1b[0m\r\n`);
      }
      setExecState('idle');
      socket.disconnect();
      socketRef.current = null;
    });
  }, [code, language, execState, trackRun, getBehavioralSummary, session?.access_token, user]);

  const handleStopExecution = useCallback(() => {
    if (socketRef.current && currentSessionIdRef.current) {
      socketRef.current.emit("stop", {
        sessionId: currentSessionIdRef.current
      });
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setExecState('idle');
  }, []);

  const handleSubmitAssignment = useCallback(async () => {
    if (!assignmentId || !user?.id) return;
    setSubmitting(true);
    toast({ title: "Submitting...", description: "Sending code to server." });

    try {
      const summary = getBehavioralSummary();
      const payload = {
        code,
        status: "submitted",
        submitted_at: new Date().toISOString(),
        behavioral_log: summary as unknown as Json
      };

      const pasteSnapshot = {
        pasteCount: summary.paste_count,
        totalPastedChars: summary.total_pasted_chars,
        totalPastedLines: summary.total_pasted_lines,
      };

      if (submission) {
        const { error } = await supabase.from("submissions").update(payload).eq("id", submission.id);
        if (error) throw error;
        toast({ title: "Submission Updated" });
        trackSubmit(code, pasteSnapshot);
      } else {
        const { data, error } = await supabase.from("submissions").insert({
          assignment_id: assignmentId,
          student_id: user.id,
          ...payload
        }).select().single();
        if (error) throw error;
        if (data) setSubmission(data);
        toast({ title: "Code Submitted!" });
        trackSubmit(code, pasteSnapshot);
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      toast({ title: "Submission Failed", description: errorMessage, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }, [code, assignmentId, user?.id, submission, trackSubmit, toast, getBehavioralSummary]);

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-white dark:bg-[#0b0f19] select-none text-slate-900 dark:text-foreground font-sans">
      {(isOffline || isRecovering) && (
        <div className={`h-6 text-[10px] flex items-center justify-center font-bold tracking-widest uppercase transition-colors ${isOffline ? 'bg-amber-600 text-white' : 'bg-green-600 text-white'}`}>
          {isOffline ? 'Offline Mode Active - Changes Saved Locally' : 'Network Restored - Syncing...'}
        </div>
      )}
      <div className="editor-toolbar flex items-center justify-between gap-3 px-4 py-2 bg-slate-50 dark:bg-[#0f172a] border-b border-slate-200 dark:border-[#1e293b] flex-wrap z-20 relative select-none">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate(assignmentId ? "/student/assignments" : "/student/dashboard")} 
            className="h-8 w-8 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-foreground rounded-lg"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xs font-bold truncate text-slate-900 dark:text-foreground">
              {assignmentId 
                ? (assignment ? assignment.title : "Coding Challenge")
                : "Practice Mode"}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="language-selector-wrapper min-w-[120px] shrink-0 z-20">
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="h-7 w-full text-xs bg-white dark:bg-[#0d1525] border-slate-200 dark:border-white/10 text-slate-900 dark:text-foreground">
                <SelectValue placeholder="Language" />
              </SelectTrigger>
              <SelectContent className="z-[100]">
                <SelectItem value="python">Python</SelectItem>
                <SelectItem value="javascript">JavaScript</SelectItem>
                <SelectItem value="typescript">TypeScript</SelectItem>
                <SelectItem value="java">Java</SelectItem>
                <SelectItem value="cpp">C++</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {submission && (
            <Badge variant={submission.status === "evaluated" ? "default" : "secondary"} className="text-[9px] uppercase">
              {submission.status}
            </Badge>
          )}

          <div className="run-button-wrapper shrink-0 flex items-center gap-2">
            {execState === 'executing' ? (
              <Button size="sm" onClick={handleStopExecution} className="h-7 text-xs bg-red-600 text-white font-bold">
                <Square className="h-3.5 w-3.5 mr-1.5 fill-current" /> STOP
              </Button>
            ) : (
              <Button size="sm" onClick={handleRunCode} className="h-7 text-xs bg-green-600 hover:bg-green-500 text-white font-bold">
                <Play className="h-3.5 w-3.5 mr-1.5 fill-current" /> RUN
              </Button>
            )}

            {assignmentId && (
              <Button 
                size="sm" 
                onClick={handleSubmitAssignment} 
                disabled={isLocked || submitting} 
                className="h-7 text-xs bg-primary text-white font-bold"
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                {submitting ? "Submitting" : "SUBMIT"}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        <ResizablePanelGroup direction="horizontal">
          {assignmentId && (
            <>
              <ResizablePanel defaultSize={40} minSize={20}>
                <div className="h-full bg-slate-50 dark:bg-[#0d1117] text-slate-900 dark:text-slate-100 p-4 overflow-y-auto">
                  <h2 className="text-lg font-bold mb-4">{assignment?.title || "Problem Statement"}</h2>
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {assignment?.description || "Loading description..."}
                  </div>
                </div>
              </ResizablePanel>
              <ResizableHandle className="bg-border w-[1px]" />
            </>
          )}
          
          <ResizablePanel defaultSize={assignmentId ? 60 : 100}>
            <ResizablePanelGroup direction="vertical">
              <ResizablePanel defaultSize={70} minSize={20}>
                <SubsystemErrorBoundary subsystemName="Coding Challenge Editor">
                  <Editor
                    height="100%"
                    language={language}
                    theme={theme === "light" ? "vs" : "vs-dark"}
                    value={code}
                    onMount={(editor) => {
                      editorRef.current = editor;

                      editor.onDidPaste((e) => {
                        if (!e || !e.range) return;
                        const model = editor.getModel();
                        if (!model) return;
                        
                        const pastedText = model.getValueInRange(e.range) || "";
                        const pastedChars = pastedText.length;
                        const pastedLines = e.range.endLineNumber - e.range.startLineNumber + 1;

                        // 1. Client-side duplicate event protection
                        const now = Date.now();
                        if (now - lastPasteRef.current.timestamp < 200 && lastPasteRef.current.chars === pastedChars) {
                          console.log("[DUPLICATE PASTE BLOCKED] Duplicate paste event detected.");
                          return;
                        }
                        lastPasteRef.current = { timestamp: now, chars: pastedChars };

                        // 2. Log in-memory behavioral stats with template checks
                        const templateChars = calculateTemplateChars(pastedText, languageRef.current);
                        logPaste(pastedChars, pastedLines, templateChars);

                        // 3. Prepare metadata payload for live alerts & DB logs
                        const summary = getBehavioralSummary();
                        const fileName = (() => {
                          switch (languageRef.current) {
                            case "python": return "main.py";
                            case "javascript": return "index.js";
                            case "typescript": return "index.ts";
                            case "java": return "Main.java";
                            case "cpp": return "main.cpp";
                            case "c": return "main.c";
                            default: return `solution.${languageRef.current}`;
                          }
                        })();

                        // Determine eventType based on paste sizes
                        let eventType: "paste" | "large_paste" | "massive_paste" = "paste";
                        if (pastedChars > 1000 || pastedLines > 50) {
                          eventType = "massive_paste";
                        } else if (pastedChars > 30 || pastedLines > 3) {
                          eventType = "large_paste";
                        }

                        const pasteStats = {
                          pasteCount: summary.paste_count,
                          pastedChars,
                          pastedLines,
                          largestPasteChars: summary.largest_paste_size,
                          largestPasteLines: summary.largest_paste_lines,
                          fileName,
                          timestamp: new Date().toISOString()
                        };

                        // 4. Emit event (inserts detailed paste log into Supabase + Socket.IO)
                        trackPaste(JSON.stringify(pasteStats), eventType, pasteStats);
                      });
                    }}
                    onChange={(val) => {
                      if (!isLocked) {
                        const newCode = val || "";
                        logChange(newCode, code);
                        setCode(newCode);
                        trackTyping(newCode);
                      }
                    }}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 14,
                      fontFamily: "'JetBrains Mono', monospace",
                      scrollBeyondLastLine: false,
                      padding: { top: 16 },
                      readOnly: isLocked,
                      wordWrap: "on",
                    }}
                    loading={
                      <div className="flex items-center justify-center h-full w-full">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    }
                  />
                </SubsystemErrorBoundary>
              </ResizablePanel>
              <ResizableHandle className="bg-slate-200 dark:bg-white/5 h-[1px]" />
              <ResizablePanel defaultSize={30} minSize={15}>
                <SubsystemErrorBoundary subsystemName="Execution Engine Console">
                  <div className="h-full flex flex-col bg-white dark:bg-[#0b0f19]">
                    <div className="px-3 py-1.5 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#0d1525] flex items-center z-10 shadow-sm shrink-0">
                      <TerminalIcon className="h-3 w-3 mr-2 text-muted-foreground" />
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-muted-foreground font-mono">Console Output</span>
                      {execState === 'executing' && (
                        <span className="ml-3 text-[10px] text-amber-500 animate-pulse font-mono flex items-center">
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Executing...
                        </span>
                      )}
                    </div>
                    {/* Xterm container */}
                    <div className="flex-1 p-2 overflow-hidden min-h-0 relative" onClick={() => { if (xtermRef.current) xtermRef.current.focus(); }}>
                      <div ref={terminalRef} className="w-full h-full" />
                    </div>
                  </div>
                </SubsystemErrorBoundary>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
};
