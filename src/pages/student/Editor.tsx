import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Play, Send, ArrowLeft, Calendar, FileText, Loader2, Activity, Keyboard, Copy, Terminal, Square } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Editor from "@monaco-editor/react";
import type { Tables } from "@/integrations/supabase/types";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { useBehavioralLogger } from "@/hooks/useBehavioralLogger";
import { motion } from "framer-motion";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import "xterm/css/xterm.css";
import { io, Socket } from "socket.io-client";

type Assignment = Tables<"assignments">;
type Submission = Tables<"submissions">;

const LANGUAGES = [
  { value: "javascript", label: "JavaScript", monacoLang: "javascript", defaultCode: '// Write your JavaScript code here\nconsole.log("Hello, CodeTrace!");\n' },
  { value: "python", label: "Python", monacoLang: "python", defaultCode: '# Write your Python code here\nprint("Hello, CodeTrace!")\n' },
  { value: "java", label: "Java", monacoLang: "java", defaultCode: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, CodeTrace!");\n    }\n}\n' },
  { value: "c", label: "C", monacoLang: "c", defaultCode: '#include <stdio.h>\n\nint main() {\n    printf("Hello, CodeTrace!\\n");\n    return 0;\n}\n' },
  { value: "cpp", label: "C++", monacoLang: "cpp", defaultCode: '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, CodeTrace!" << endl;\n    return 0;\n}\n' },
  { value: "html", label: "HTML/CSS", monacoLang: "html", defaultCode: '<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    body { font-family: sans-serif; text-align: center; padding: 2rem; }\n    h1 { color: #3b82f6; }\n  </style>\n</head>\n<body>\n  <h1>Hello, CodeTrace!</h1>\n</body>\n</html>\n' },
];

export default function StudentEditor() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [language, setLanguage] = useState("javascript");
  const [code, setCode] = useState(LANGUAGES[0].defaultCode);
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [execStatus, setExecStatus] = useState<string>("");
  const [loading, setLoading] = useState(!!assignmentId);
  const [submitting, setSubmitting] = useState(false);
  const [pasteCount, setPasteCount] = useState(0);
  const [status, setStatus] = useState("Idle");
  
  const [execMode, setExecMode] = useState<"normal" | "interactive">("normal");
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  
  const typingTimer = useRef<NodeJS.Timeout | null>(null);

  const { logChange, getBehavioralSummary, resetLogger } = useBehavioralLogger();

  useEffect(() => {
    if (terminalRef.current && !xtermRef.current) {
      const term = new XTerm({
        theme: { background: "#0d1117" },
        fontFamily: "monospace",
        fontSize: 14,
        cursorBlink: true,
        convertEol: true // Automatically converts \n to \r\n
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalRef.current);
      
      // Short delay to let container layout stabilize
      setTimeout(() => fitAddon.fit(), 50);

      const handleResize = () => fitAddon.fit();
      window.addEventListener("resize", handleResize);

      term.onData((data) => {
        if (socketRef.current && execMode === "interactive") {
          const sendData = data === '\r' ? '\n' : data;
          socketRef.current.emit("input", { sessionId: sessionIdRef.current, data: sendData });
          
          // Local echo
          if (data === '\r') {
            term.write('\r\n');
          } else if (data === '\x7F') { // Backspace
            term.write('\b \b');
          } else {
            term.write(data);
          }
        }
      });

      xtermRef.current = term;

      return () => {
        window.removeEventListener("resize", handleResize);
        term.dispose();
        xtermRef.current = null;
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
        }
      };
    }
  }, [execMode]);

  const { trackTyping, trackRun, trackSubmit, trackPaste, trackFocus, trackBlur } = useActivityTracker({
    studentId: user?.id,
    assignmentId,
    language,
  });

  useEffect(() => {
    if (!assignmentId || !user) return;
    const loadData = async () => {
      setLoading(true);
      resetLogger(); // Reset behavioral timer when assignment loads
      const { data: aData } = await supabase.from("assignments").select("*").eq("id", assignmentId).single();
      if (aData) setAssignment(aData);
      const { data: sData } = await supabase.from("submissions").select("*").eq("assignment_id", assignmentId).eq("student_id", user.id).maybeSingle();
      if (sData) {
        setSubmission(sData);
        if (sData.code) setCode(sData.code);
      }
      setLoading(false);
    };
    loadData();
  }, [assignmentId, user, resetLogger]);

  const handleLanguageChange = (val: string) => {
    setLanguage(val);
    if (!submission?.code) {
      const lang = LANGUAGES.find((l) => l.value === val);
      if (lang) setCode(lang.defaultCode);
    }
  };

  const currentLang = LANGUAGES.find((l) => l.value === language);

  const handleRun = async () => {
    trackRun(code);
    setOutput("Executing...");
    setRunning(true);

    if (xtermRef.current) {
      xtermRef.current.clear();
      xtermRef.current.write("\x1b[32m$ Running...\x1b[0m\r\n");
      xtermRef.current.focus();
    }

    if (language === "html") {
      setOutput("__HTML_PREVIEW__");
      setRunning(false);
      return;
    }

    if (execMode === "interactive") {
      if (!socketRef.current) {
        socketRef.current = io("http://localhost:3001");
        
        socketRef.current.on("connect", () => {
          console.log("Socket connected:", socketRef.current?.connected);
          socketRef.current?.emit("join_session", sessionIdRef.current);
        });

        socketRef.current.on("output", (data) => {
          if (xtermRef.current) xtermRef.current.write(data);
        });

        socketRef.current.on("status", (newStatus) => {
          setExecStatus(newStatus);
          if (newStatus === "finished" || newStatus === "killed") {
            setRunning(false);
          } else {
            setRunning(true);
          }
        });

        socketRef.current.on("exit", (exitCode) => {
          if (xtermRef.current) xtermRef.current.write("\r\n$ Ready\r\n");
          setRunning(false);
        });
        
        socketRef.current.on("disconnect", () => {
          // Don't auto-set running=false immediately to allow graceful reconnects
        });
      }

      console.log("RUN EVENT SENT");
      socketRef.current.emit("run", { sessionId: sessionIdRef.current, language, code });
      return;
    }

    const WANDBOX_COMPILERS: Record<string, string> = {
      python: "cpython-3.10.15",
      java: "openjdk-jdk-21+35",
      cpp: "gcc-head",
      c: "gcc-head-c",
      javascript: "nodejs-20.17.0",
    };

    try {
      const compiler = WANDBOX_COMPILERS[language];
      if (!compiler) throw new Error(`Unsupported language: ${language}`);
      
      const res = await fetch("https://wandbox.org/api/compile.json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ compiler, code, stdin: "", save: false }),
      });
      const data = await res.json();
      
      if (data.status !== "0" && data.compiler_error) {
        const out = `Compilation Error:\n${data.compiler_error}\n${data.program_error || ""}`;
        setOutput(out);
        if (xtermRef.current) xtermRef.current.write(out);
      } else {
        const out = (data.program_error || "") + (data.program_output || "");
        setOutput(out || "Program executed successfully (no output).");
        if (xtermRef.current) xtermRef.current.write(out || "Program executed successfully (no output).");
      }
    } catch (err: any) {
      setOutput(`Error: ${err.message}`);
      if (xtermRef.current) xtermRef.current.write(`Error: ${err.message}`);
    }
    setRunning(false);
  };

  const handleStop = () => {
    if (socketRef.current && execMode === "interactive") {
      socketRef.current.emit("stop");
      setRunning(false);
    }
  };

  const handleSubmit = async () => {
    if (!user || !assignmentId) return;
    trackSubmit(code);
    setSubmitting(true);
    const behavioralLog = getBehavioralSummary();
    const payload = {
      code,
      status: "submitted",
      submitted_at: new Date().toISOString(),
      behavioral_log: behavioralLog,
    };

    if (submission) {
      const { error } = await supabase.from("submissions").update(payload).eq("id", submission.id);
      if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
      else { toast({ title: "Submission updated" }); setSubmission({ ...submission, ...payload }); }
    } else {
      const { data, error } = await supabase
        .from("submissions")
        .insert({ assignment_id: assignmentId, student_id: user.id, ...payload })
        .select()
        .single();
      if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
      else { toast({ title: "Code submitted" }); if (data) setSubmission(data); }
    }
    setSubmitting(false);
  };

  const handleEditorChange = (val: string | undefined) => {
    const v = val || "";
    const isPaste = Math.abs(v.length - code.length) > 10;
    logChange(v, code); // behavioral summary accumulator (in-memory)
    setCode(v);
    trackTyping(v);
    setStatus("Active");
    
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setStatus("Idle"), 2000);

    if (isPaste) {
      setPasteCount(prev => prev + 1);
      trackPaste(v);
    }
  };

  const isLocked = submission?.status === "evaluated" || submission?.status === "flagged";

  if (loading) {
    return (
      <DashboardLayout role="student">
        <div className="flex items-center justify-center h-full text-muted-foreground"><Loader2 className="animate-spin h-8 w-8" /></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="student">
      <div className="h-[calc(100vh-6rem)] flex flex-col gap-4 overflow-hidden">
        {/* Top Bar */}
        <div className="flex-shrink-0 flex items-center justify-between glass-panel p-3 px-5">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(assignmentId ? "/student/assignments" : "/student/dashboard")} className="h-8 w-8 hover:bg-white/10">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-base font-bold text-foreground">
                {assignment ? assignment.title : "Code Workspace"}
              </h1>
              {assignment?.due_date && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1 uppercase tracking-wider font-semibold">
                  <Calendar className="h-3 w-3" /> Due: {new Date(assignment.due_date).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {submission && (
              <Badge variant={submission.status === "evaluated" ? "default" : submission.status === "flagged" ? "destructive" : "secondary"} className="uppercase tracking-widest text-[10px]">
                {submission.status}
              </Badge>
            )}
            <Select value={execMode} onValueChange={(val: any) => setExecMode(val)}>
              <SelectTrigger className="w-[120px] h-8 text-xs bg-background/50 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal Mode</SelectItem>
                <SelectItem value="interactive">Interactive</SelectItem>
              </SelectContent>
            </Select>
            <Select value={language} onValueChange={handleLanguageChange}>
              <SelectTrigger className="w-[130px] h-8 text-xs bg-background/50 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {running && execMode === "interactive" ? (
              <Button size="sm" onClick={handleStop} className="h-8 bg-destructive hover:bg-destructive/90 text-white font-medium">
                <Square className="h-3 w-3 mr-2 fill-current" /> Stop
              </Button>
            ) : (
              <Button size="sm" onClick={handleRun} disabled={running} className="h-8 bg-success hover:bg-success/90 text-white font-medium">
                {running ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <Play className="h-3 w-3 mr-2" />}
                {running ? "Running" : "Run Code"}
              </Button>
            )}
            {assignmentId && (
              <Button size="sm" onClick={handleSubmit} disabled={isLocked || submitting} className="h-8 bg-primary hover:bg-primary/90 text-white font-medium">
                <Send className="h-3 w-3 mr-2" />
                {submitting ? "..." : submission ? "Resubmit" : "Submit"}
              </Button>
            )}
          </div>
        </div>

        {/* Main Workspace */}
        <div className="flex-1 flex gap-4 min-h-0">
          {/* Editor & Terminal Column */}
          <div className="flex-1 flex flex-col gap-4 min-w-0">
            {/* Editor Container */}
            <div className="flex-1 glass-panel flex flex-col min-h-0 relative group">
              <div className="h-8 border-b border-white/5 bg-black/20 flex items-center px-4">
                <FileText className="h-3 w-3 text-muted-foreground mr-2" />
                <span className="text-xs text-muted-foreground font-mono">main.{language === "python" ? "py" : language === "javascript" ? "js" : language === "java" ? "java" : language === "cpp" ? "cpp" : language === "c" ? "c" : "html"}</span>
                {isLocked && <span className="ml-auto text-[10px] text-warning uppercase tracking-widest">Read Only</span>}
              </div>
              <div className="flex-1 p-1 h-[500px] w-full relative">
                <Editor
                  height="100%"
                  language={currentLang?.monacoLang || "javascript"}
                  value={code}
                  onChange={handleEditorChange}
                  theme="vs-dark"
                  loading={
                    <div className="flex items-center justify-center h-full w-full bg-[#1e1e1e]">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  }
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    fontFamily: "'JetBrains Mono', monospace",
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                    readOnly: isLocked,
                    padding: { top: 12 },
                    cursorBlinking: "smooth",
                    cursorSmoothCaretAnimation: "on",
                    formatOnPaste: true,
                  }}
                />
              </div>
            </div>

            {/* Bottom Panel (Terminal) */}
            <div className="h-[350px] glass-panel flex min-h-0">
              <div className="flex-1 flex flex-col bg-[#0d1117]">
                <div className="h-8 border-b border-white/5 bg-black/20 flex items-center justify-between px-4">
                  <div className="flex items-center">
                    <Terminal className="h-3 w-3 text-muted-foreground mr-2" />
                    <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Terminal</span>
                  </div>
                  {execMode === "interactive" && execStatus && (
                    <Badge variant="outline" className={`text-[9px] uppercase tracking-wider ${execStatus === "waiting-input" ? "border-warning text-warning" : execStatus === "running" ? "border-success text-success" : "border-muted text-muted-foreground"}`}>
                      {execStatus}
                    </Badge>
                  )}
                </div>
                <div className="flex-1 p-0 overflow-hidden relative group">
                  {output === "__HTML_PREVIEW__" ? (
                    <iframe srcDoc={code} className="w-full h-full rounded border-0 bg-white" sandbox="allow-scripts" title="Preview" />
                  ) : (
                    <div ref={terminalRef} className="w-full h-full p-2 bg-[#0d1117] overflow-hidden" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel (Live Tracker) */}
          <div className="w-64 glass-panel flex flex-col flex-shrink-0 bg-card/40 hidden lg:flex">
            <div className="h-8 border-b border-white/5 bg-black/20 flex items-center px-4">
              <Activity className="h-3 w-3 text-muted-foreground mr-2" />
              <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Live Tracker</span>
            </div>
            <div className="p-5 flex flex-col gap-6">
              <div>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2 block">Status</span>
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${status === "Active" ? "bg-success animate-pulse" : "bg-muted-foreground"}`} />
                  <span className="text-sm font-medium text-foreground">{status}</span>
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2 block">Activity Level</span>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-primary/10 border border-primary/20">
                    <Keyboard className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="text-lg font-bold">{code.length} <span className="text-xs font-normal text-muted-foreground">chars</span></div>
                  </div>
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2 block">Security Events</span>
                <div className="flex items-center justify-between p-3 rounded-lg border border-warning/20 bg-warning/5">
                  <div className="flex items-center gap-2">
                    <Copy className="h-4 w-4 text-warning" />
                    <span className="text-xs font-medium text-warning">Paste Count</span>
                  </div>
                  <span className="font-mono font-bold text-warning">{pasteCount}</span>
                </div>
              </div>

              {assignment?.description && (
                <div className="mt-auto border-t border-white/5 pt-4">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2 block">Instructions</span>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-6">{assignment.description}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
