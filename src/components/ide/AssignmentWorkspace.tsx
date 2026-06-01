import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Editor from "@monaco-editor/react";
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
  const { user } = useAuth();
  
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("python");
  
  const [assignment, setAssignment] = useState<any>(null);
  const [submission, setSubmission] = useState<any>(null);
  
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
  
  const editorRef = useRef<any>(null);

  const { healthState, isOffline, isRecovering } = useIdeHealth();

  const mountedRef = useRef(false);

  // Cleanup socket on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

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
        } catch (e) {
          console.error("Error saving to localStorage", e);
        }
      }
    });
  }, [code, language, assignmentId]);

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
      try { fitAddon.fit(); } catch (e) {}
    }, 150);

    const handleResize = () => {
      try { fitAddon.fit(); } catch (e) {}
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

  const handleRunCode = () => {
    if (execState === 'executing') return;
    
    lineBufferRef.current = "";
    if (xtermRef.current) {
      xtermRef.current.clear();
      xtermRef.current.focus();
    }

    setExecState('executing');
    
    const sessionId = crypto.randomUUID();
    currentSessionIdRef.current = sessionId;

    const socket = io(EXECUTION_SERVER_URL);
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[SOCKET CONNECT]");
      socket.emit("run", {
        sessionId,
        language,
        code
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
  };

  const handleStopExecution = () => {
    if (socketRef.current && currentSessionIdRef.current) {
      socketRef.current.emit("stop", {
        sessionId: currentSessionIdRef.current
      });
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setExecState('idle');
  };

  const handleSubmitAssignment = async () => {
    if (!assignmentId || !user?.id) return;
    setSubmitting(true);
    toast({ title: "Submitting...", description: "Sending code to server." });

    try {
      const payload = {
        code,
        status: "submitted",
        submitted_at: new Date().toISOString(),
      };

      if (submission) {
        const { error } = await supabase.from("submissions").update(payload).eq("id", submission.id);
        if (error) throw error;
        toast({ title: "Submission Updated" });
      } else {
        const { data, error } = await supabase.from("submissions").insert({
          assignment_id: assignmentId,
          student_id: user.id,
          ...payload
        }).select().single();
        if (error) throw error;
        if (data) setSubmission(data);
        toast({ title: "Code Submitted!" });
      }
    } catch (e: any) {
      toast({ title: "Submission Failed", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-[#0b0f19] select-none text-foreground font-sans">
      {(isOffline || isRecovering) && (
        <div className={`h-6 text-[10px] flex items-center justify-center font-bold tracking-widest uppercase transition-colors ${isOffline ? 'bg-amber-600 text-white' : 'bg-green-600 text-white'}`}>
          {isOffline ? 'Offline Mode Active - Changes Saved Locally' : 'Network Restored - Syncing...'}
        </div>
      )}
      <div className="editor-toolbar flex items-center justify-between gap-3 px-4 py-2 bg-[#0f172a] border-b border-[#1e293b] flex-wrap z-20 relative select-none">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate(assignmentId ? "/student/assignments" : "/student/dashboard")} 
            className="h-8 w-8 hover:bg-white/5 text-muted-foreground hover:text-foreground rounded-lg"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xs font-bold truncate text-foreground">
              {assignmentId 
                ? (assignment ? assignment.title : "Coding Challenge")
                : "Practice Mode"}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="language-selector-wrapper min-w-[120px] shrink-0 z-20">
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="h-7 w-full text-xs bg-[#0d1525] border-white/10">
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
                <div className="h-full bg-[#0d1117] p-4 overflow-y-auto">
                  <h2 className="text-lg font-bold mb-4">{assignment?.title || "Problem Statement"}</h2>
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {assignment?.description || "Loading description..."}
                  </div>
                </div>
              </ResizablePanel>
              <ResizableHandle className="bg-white/5 w-[1px]" />
            </>
          )}
          
          <ResizablePanel defaultSize={assignmentId ? 60 : 100}>
            <ResizablePanelGroup direction="vertical">
              <ResizablePanel defaultSize={70} minSize={20}>
                <SubsystemErrorBoundary subsystemName="Coding Challenge Editor">
                  <Editor
                    height="100%"
                    language={language}
                    theme="vs-dark"
                    value={code}
                    onMount={(editor) => {
                      editorRef.current = editor;
                    }}
                    onChange={(val) => {
                      if (!isLocked) setCode(val || "");
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
              <ResizableHandle className="bg-white/5 h-[1px]" />
              <ResizablePanel defaultSize={30} minSize={15}>
                <SubsystemErrorBoundary subsystemName="Execution Engine Console">
                  <div className="h-full flex flex-col bg-[#0b0f19]">
                    <div className="px-3 py-1.5 border-b border-white/5 bg-[#0d1525] flex items-center z-10 shadow-sm shrink-0">
                      <TerminalIcon className="h-3 w-3 mr-2 text-muted-foreground" />
                      <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground font-mono">Console Output</span>
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
