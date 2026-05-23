import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Circle, Code, User, Loader2 } from "lucide-react";
import MonacoEditor, { loader } from "@monaco-editor/react";

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

export default function TeacherLiveSession() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [students, setStudents] = useState<Profile[]>([]);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);

  // Load assignment and students
  useEffect(() => {
    if (!assignmentId) return;

    supabase.from("assignments").select("*").eq("id", assignmentId).single()
      .then(({ data }) => { if (data) setAssignment(data); });

    supabase.from("activity_events").select("student_id")
      .eq("assignment_id", assignmentId)
      .then(({ data }) => {
        if (data) {
          const uniqueIds = [...new Set(data.map((e: any) => e.student_id))];
          if (uniqueIds.length > 0) {
            supabase.from("profiles").select("*").in("user_id", uniqueIds)
              .then(({ data: profiles }) => {
                if (profiles) setStudents(profiles);
              });
          }
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

  // Realtime subscription
  useEffect(() => {
    if (!assignmentId) return;

    const channel = supabase
      .channel(`live-session-${assignmentId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_events" },
        (payload) => {
          const newEvent = payload.new as ActivityEvent;
          if (newEvent.assignment_id === assignmentId) {
            setEvents((prev) => [...prev.slice(-499), newEvent]);

            if (!students.find((s) => s.user_id === newEvent.student_id)) {
              supabase.from("profiles").select("*").eq("user_id", newEvent.student_id).single()
                .then(({ data }) => {
                  if (data) setStudents((prev) => {
                    if (prev.find((s) => s.user_id === data.user_id)) return prev;
                    return [...prev, data];
                  });
                });
            }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [assignmentId, students]);

  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const activeStudentIds = new Set(
    events.filter((e) => new Date(e.created_at).getTime() > fiveMinAgo).map((e) => e.student_id)
  );

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
                            <div className="text-sm font-medium truncate">{student.name}</div>
                            <div className="text-[10px] font-mono text-muted-foreground">
                              {student.uid || "—"}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-1 ml-4">
                          <span className="text-[9px] text-muted-foreground">⌨ {stats.typing}</span>
                          <span className="text-[9px] text-muted-foreground">▶ {stats.runs}</span>
                          {stats.pastes > 0 && (
                            <span className="text-[9px] text-[hsl(var(--warning))]">📋 {stats.pastes}</span>
                          )}
                          {stats.submits > 0 && (
                            <span className="text-[9px] text-[hsl(var(--success))]">✓ {stats.submits}</span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>
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
              ) : !selectedCode ? (
                <div className="flex items-center justify-center h-full text-[hsl(var(--terminal-muted))] font-mono text-sm">
                  <p>No code snapshot available yet</p>
                </div>
              ) : (
                <MonacoEditor
                  key={`${selectedStudent}-${monacoLanguage}`}
                  height="100%"
                  language={monacoLanguage}
                  value={selectedCode}
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