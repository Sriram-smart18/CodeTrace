// File: src/components/ide/SandboxWorkspace.tsx
import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { 
  Play, 
  Send, 
  ArrowLeft, 
  Calendar, 
  Loader2, 
  Code, 
  Square,
  Eye,
  Settings,
  HelpCircle,
  Terminal as TerminalIcon,
  Sun,
  Moon,
  FolderPlus,
  Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

import { useAuth } from "@/contexts/AuthContext";
import { useEditorPersistence } from "@/hooks/useEditorPersistence";
import { useIdeHealth } from "@/hooks/useIdeHealth";
import * as monaco from "monaco-editor";

// IDE Subsystems
import { useIdeStore } from "./store/ideStore";
import { IdeExplorer } from "./explorer/IdeExplorer";
import { SubsystemErrorBoundary } from "./error-boundaries/SubsystemErrorBoundary";
import { IdeEditorTabs } from "./editor/IdeEditorTabs";
import { IdeBreadcrumbs } from "./editor/IdeBreadcrumbs";
import { IdeTerminal, IdeTerminalRef } from "./terminal/IdeTerminal";
import { IdePreview } from "./preview/IdePreview";
import { useIdeShortcuts } from "./hooks/useIdeShortcuts";
import { io, Socket } from "socket.io-client";
import { FilePlus, Edit2, Trash2, AlignLeft, Keyboard, Code2 } from "lucide-react";
import { useTheme } from "next-themes";

// Lazy-Loaded heavy components to optimize initial JS bundle size (< 1.5MB target)
const IdeMonacoEditor = React.lazy(() => import("./editor/IdeMonacoEditor").then(m => ({ default: m.IdeMonacoEditor })));
const CommandPalette = React.lazy(() => import("./editor/CommandPalette").then(m => ({ default: m.CommandPalette })));
const GlobalSearch = React.lazy(() => import("./explorer/GlobalSearch").then(m => ({ default: m.GlobalSearch })));

// Lazy-Loaded heavy dialog panels
const NewFileDialog = React.lazy(() => import("./dialogs/NewFileDialog").then(m => ({ default: m.NewFileDialog })));
const NewFolderDialog = React.lazy(() => import("./dialogs/NewFolderDialog").then(m => ({ default: m.NewFolderDialog })));
const RenameFileDialog = React.lazy(() => import("./dialogs/RenameFileDialog").then(m => ({ default: m.RenameFileDialog })));
const CloseTabProtectionDialog = React.lazy(() => import("./dialogs/CloseTabProtectionDialog").then(m => ({ default: m.CloseTabProtectionDialog })));
const SettingsDialog = React.lazy(() => import("./dialogs/SettingsDialog").then(m => ({ default: m.SettingsDialog })));
const ExecutionHistoryDialog = React.lazy(() => import("./dialogs/ExecutionHistoryDialog").then(m => ({ default: m.ExecutionHistoryDialog })));

const EXECUTION_SERVER_URL = import.meta.env.VITE_EXECUTION_SERVER_URL || "http://localhost:3001";

interface SandboxWorkspaceProps {
  assignmentId?: string;
  projectId: string;
  initialMode?: "editor" | "builder";
  onBack?: () => void;
}

import { useShallow } from "zustand/react/shallow";

export const SandboxWorkspace: React.FC<SandboxWorkspaceProps> = ({ 
  assignmentId, 
  projectId,
  initialMode = "editor",
  onBack
}) => {
  console.count('[SANDBOX WORKSPACE RENDER]');
  console.log('[IDE MODE] SANDBOX');
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, session } = useAuth();
  
  const { healthState, isOffline, isRecovering } = useIdeHealth();

  const mountedRef = React.useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      console.log('[WORKSPACE BOOT]', {
        workspaceType: 'sandbox',
        mode: assignmentId ? 'assignment' : 'practice',
        assignmentId
      });
    }
    console.log('[SANDBOX WORKSPACE MOUNT]');
    console.log('[EDITOR READY]');
    return () => {
      console.log('[SANDBOX WORKSPACE UNMOUNT]');
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [assignmentId]);

  // Initialize persistence to handle local autosaving & hydration safely
  useEditorPersistence(user?.id, assignmentId);

  const { theme, setTheme } = useTheme();
  const openNewFileDialog = useIdeStore((state) => state.openNewFileDialog);
  const openNewFolderDialog = useIdeStore((state) => state.openNewFolderDialog);
  const openRenameDialog = useIdeStore((state) => state.openRenameDialog);
  const updateLayout = useIdeStore((state) => state.updateLayout);

  // Responsive sidebar collapse under 1024px
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        updateLayout({ sidebarOpen: false });
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [updateLayout]);

  // We do not subscribe to nodesById to prevent typing in one file from rerendering the entire workspace.
  const activeFileId = useIdeStore((state) => state.activeFileId);
  const sidebarOpen = useIdeStore((state) => state.layoutState.sidebarOpen);
  const terminalOpen = useIdeStore((state) => state.layoutState.terminalOpen);
  const previewOpen = useIdeStore((state) => state.layoutState.previewOpen);
  const addTerminalLog = useIdeStore((state) => state.addTerminalLog);
  const setTerminalLogs = useIdeStore((state) => state.setTerminalLogs);
  const saveToSupabase = useIdeStore((state) => state.saveToSupabase);
  const createFile = useIdeStore((state) => state.createFile);
  const deleteNode = useIdeStore((state) => state.deleteNode);

  // Zustand Polished States & Settings
  const activeCursor = useIdeStore((state) => activeFileId ? state.cursorPositions[activeFileId] : undefined);
  const activeNode = useIdeStore((state) => activeFileId ? state.nodesById[activeFileId] : undefined);
  const settings = useIdeStore((state) => state.settings);
  const activeSidebarTab = useIdeStore((state) => state.layoutState.activeSidebarTab);
  
  const execState = useIdeStore((state) => state.execState);
  const setExecState = useIdeStore((state) => state.setExecState);

  // Hydration session recovery toast
  const { hydrationCompleted } = useEditorPersistence(user?.id, assignmentId);
  useEffect(() => {
    if (hydrationCompleted) {
      toast({
        title: "Workspace Restored",
        description: "Previous editor session and file tree recovered successfully.",
      });
    }
  }, [hydrationCompleted, toast]);

  // Local IDE Execution States
  const terminalRef = useRef<IdeTerminalRef>(null);
  const socketRef = useRef<Socket | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);
  
  const [execMode, setExecMode] = useState<"normal" | "interactive">("normal");
  const [assignment, setAssignment] = useState<Tables<"assignments"> | null>(null);
  const [submission, setSubmission] = useState<Tables<"submissions"> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  // Command Palette states
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<"file" | "command">("file");

  // Mode Selection (Code Editor Mode vs Project Builder Mode)
  const [ideMode, setIdeMode] = useState<"editor" | "builder">(initialMode);

  // Keybindings listener hook
  useIdeShortcuts({
    onOpenPalette: (mode) => {
      console.log("[STATE UPDATE] SandboxWorkspace: setPaletteMode ->", mode, "setPaletteOpen -> true");
      setPaletteMode(mode);
      setPaletteOpen(true);
    }
  });

  // Global code rerun listener
  useEffect(() => {
    const handleRerunEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      const targetFileId = customEvent.detail?.fileId;
      if (targetFileId) {
        useIdeStore.getState().openFile(targetFileId);
        setTimeout(() => {
          handleRunCode();
        }, 120);
      }
    };
    window.addEventListener("run-code-file", handleRerunEvent);
    return () => window.removeEventListener("run-code-file", handleRerunEvent);
  }, [activeFileId, handleRunCode]);

  // Sync mode layout state on change
  useEffect(() => {
    console.log('[EFFECT START] SandboxWorkspace: Sync layout mode');
    const shouldBeOpen = ideMode !== "editor";
    if (previewOpen !== shouldBeOpen) {
      updateLayout({ previewOpen: shouldBeOpen });
    }
    return () => {
      console.log('[EFFECT CLEANUP] SandboxWorkspace: Sync layout mode cleanup');
    };
  }, [ideMode, updateLayout, previewOpen]);

  // Load assignment details and submissions if present
  useEffect(() => {
    console.log('[EFFECT START] SandboxWorkspace: Load assignment data');
    const fetchAssignmentData = async () => {
      if (!assignmentId) return;
      
      const { data: asg } = await supabase
        .from("assignments")
        .select("*")
        .eq("id", assignmentId)
        .single();
      
      if (asg) {
        console.log("[STATE UPDATE] SandboxWorkspace: setAssignment");
        setAssignment(asg);
      }

      const { data: userProfile } = await supabase.auth.getUser();
      const studentId = userProfile?.user?.id;
      if (studentId) {
        const { data: sub } = await supabase
          .from("submissions")
          .select("*")
          .eq("assignment_id", assignmentId)
          .eq("student_id", studentId)
          .maybeSingle();
        
        if (sub) {
          console.log("[STATE UPDATE] SandboxWorkspace: setSubmission");
          setSubmission(sub);
          if (sub.status === "evaluated" || sub.status === "flagged") {
            console.log("[STATE UPDATE] SandboxWorkspace: setIsLocked -> true");
            setIsLocked(true);
          }
        }
      }
    };
    fetchAssignmentData();
    return () => {
      console.log('[EFFECT CLEANUP] SandboxWorkspace: Load assignment data cleanup');
    };
  }, [assignmentId]);

  const syncMonacoModelsToStore = () => {
    try {
      monaco.editor.getModels().forEach((model) => {
        const uriStr = model.uri.toString();
        const nodes = useIdeStore.getState().nodesById;
        Object.keys(nodes).forEach((fileId) => {
          const expectedUri = monaco.Uri.parse(`file:///${fileId}`).toString();
          if (expectedUri === uriStr) {
            const currentVal = model.getValue();
            if (nodes[fileId]?.content !== currentVal) {
              useIdeStore.getState().updateFileContent(fileId, currentVal);
            }
          }
        });
      });
    } catch (e) {
      console.warn("Failed to sync Monaco models to store", e);
    }
  };

  // Code Execution Logic (using Socket.IO endpoint)
  const handleRunCode = useCallback(async () => {
    if (!activeFileId || execState === 'running') {
      if (!activeFileId) toast({ title: "No File Focused", description: "Select a script file in explorer sidebar to execute.", variant: "destructive" });
      return;
    }

    const startTime = Date.now();
    try {
      syncMonacoModelsToStore();

      const currentNodes = useIdeStore.getState().nodesById;
      const fileNode = currentNodes[activeFileId];
      if (!fileNode || fileNode.type !== "file") return;

      // Sync changes to cloud before running to keep cloud sync strategies up to date
      saveToSupabase(supabase);

      setExecState('running');
      if (terminalRef.current) {
        terminalRef.current.clear();
        terminalRef.current.write("\x1b[32m$ Connecting to execution engine...\x1b[0m\r\n");
      }

      const modelUri = monaco.Uri.parse(`file:///${activeFileId}`);
      const model = monaco.editor.getModel(modelUri);
      const codeContent = model ? model.getValue() : (fileNode.content || "");
      const fileLanguage = fileNode.language || "javascript";

      if (fileLanguage === "html") {
        if (terminalRef.current) {
          terminalRef.current.write("[system] Running HTML layout in preview engine.\r\n");
        }
        setIdeMode("builder");
        setExecState('completed');
        useIdeStore.getState().addRunHistory({
          fileName: fileNode.name,
          language: "html",
          status: "completed",
          durationMs: Date.now() - startTime,
          fileId: activeFileId
        });
        return;
      }

      const sessionId = crypto.randomUUID();
      currentSessionIdRef.current = sessionId;

      const socket = io(EXECUTION_SERVER_URL, {
        auth: {
          token: session?.access_token
        }
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        socket.emit("run", {
          sessionId,
          language: fileLanguage,
          code: codeContent,
          userId: user?.id
        });
      });

      socket.on("disconnect", () => {
        // Ignored
      });

      socket.on("output", (data: string) => {
        // Check if script is requesting stdin / console prompt
        if (data.toLowerCase().includes("input(") || data.includes("?") || data.toLowerCase().includes("enter ") || data.toLowerCase().includes("type ")) {
          setExecState('waiting');
        }
        if (terminalRef.current) {
          terminalRef.current.write(data);
        }
      });

      socket.on("exit", (exitCode: number) => {
        const duration = Date.now() - startTime;
        setExecState('completed');
        
        useIdeStore.getState().addRunHistory({
          fileName: fileNode.name,
          language: fileLanguage,
          status: "completed",
          durationMs: duration,
          fileId: activeFileId
        });

        socket.disconnect();
        socketRef.current = null;
      });

      socket.on("status", (status) => {
        if (status === 'killed' || status === 'finished') {
          setExecState('ready');
          socket.disconnect();
          socketRef.current = null;
        }
      });
      
      socket.on("connect_error", (err) => {
        const duration = Date.now() - startTime;
        if (terminalRef.current) {
          terminalRef.current.write(`\r\n\x1b[31m[Connection Error: ${err.message}]\x1b[0m\r\n`);
        }
        setExecState('error');
        
        useIdeStore.getState().addRunHistory({
          fileName: fileNode.name,
          language: fileLanguage,
          status: "error",
          durationMs: duration,
          fileId: activeFileId
        });

        socket.disconnect();
        socketRef.current = null;
      });

    } catch (err) {
      const duration = Date.now() - startTime;
      if (terminalRef.current) {
        terminalRef.current.write(`\r\n\x1b[31m[Error: ${err instanceof Error ? err.message : String(err)}]\x1b[0m\r\n`);
      }
      setExecState('error');
      
      const currentNodes = useIdeStore.getState().nodesById;
      const fileNode = currentNodes[activeFileId];
      if (fileNode) {
        useIdeStore.getState().addRunHistory({
          fileName: fileNode.name,
          language: fileNode.language || "unknown",
          status: "error",
          durationMs: duration,
          fileId: activeFileId
        });
      }
    }
  }, [activeFileId, execState, toast, saveToSupabase, session, user, setExecState, setIdeMode]);

  const handleTerminalInput = (data: string) => {
    setExecState('running');
    if (socketRef.current && currentSessionIdRef.current) {
      socketRef.current.emit("input", {
        sessionId: currentSessionIdRef.current,
        data
      });
    }
  };

  const handleStopExecution = () => {
    if (socketRef.current && currentSessionIdRef.current) {
      socketRef.current.emit("stop", {
        sessionId: currentSessionIdRef.current
      });
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setExecState('ready');
    if (terminalRef.current) {
      terminalRef.current.write("\r\n\x1b[31m$ Execution halted by operator.\x1b[0m\r\n");
    }
  };

  // Submit project files to classroom submissions
  const handleSubmitAssignment = async () => {
    if (!assignmentId) return;
    setSubmitting(true);
    toast({ title: "Archiving project...", description: "Bundling workspace files for classroom submission." });

    try {
      // Sync any unsaved editor keystrokes to store before submitting
      syncMonacoModelsToStore();

      // Sync state to Supabase first
      await saveToSupabase(supabase);

      const { data: userProfile } = await supabase.auth.getUser();
      const studentId = userProfile?.user?.id;
      if (!studentId) throw new Error("Unauthenticated");

      // Extract a summary metadata payload or serialize the entry file for legacy compatibility
      const currentNodes = useIdeStore.getState().nodesById;
      const entryFile = Object.values(currentNodes).find(n => n.name === "main.py" || n.name === "index.html" || n.name.endsWith(".js"));
      const codeValue = entryFile?.content || "// Project Workspace Submitted successfully.";

      const payload = {
        code: codeValue,
        status: "submitted",
        submitted_at: new Date().toISOString(),
      };

      if (submission) {
        const { error } = await supabase
          .from("submissions")
          .update(payload)
          .eq("id", submission.id);
        if (error) throw error;
        toast({ title: "Submission Updated", description: "Successfully updated your project classroom submission." });
      } else {
        const { data, error } = await supabase
          .from("submissions")
          .insert({
            assignment_id: assignmentId,
            student_id: studentId,
            ...payload
          })
          .select()
          .single();
        if (error) throw error;
        if (data) setSubmission(data);
        toast({ title: "Code Submitted!", description: "Successfully submitted project files for grading." });
      }
    } catch (e) {
      toast({ title: "Submission Failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(assignmentId ? "/student/assignments" : "/student/dashboard");
    }
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-800 select-none font-sans">
      {(isOffline || isRecovering) && (
        <div className={`h-6 text-[10px] flex items-center justify-center font-bold tracking-widest uppercase transition-colors ${isOffline ? 'bg-amber-600 text-white' : 'bg-green-600 text-white'}`}>
          {isOffline ? 'Offline Mode Active - Changes Saved Locally' : 'Network Restored - Syncing...'}
        </div>
      )}
      {/* IDE Top Control Toolbar Bar */}
      <div className="h-11 flex-shrink-0 flex items-center justify-between bg-slate-50/80 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800 px-4 select-none">
        {/* Back and title info */}
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleBack} 
            className="h-8 w-8 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-foreground rounded-lg"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xs font-bold truncate text-slate-900 dark:text-foreground">
              {assignment ? assignment.title : "Workspace IDE"}
            </h1>
            {assignment?.due_date && (
              <span className="text-[9px] text-slate-400 dark:text-muted-foreground/60 flex items-center gap-1 font-mono leading-none mt-0.5">
                <Calendar className="h-3 w-3 shrink-0" /> DUE: {new Date(assignment.due_date).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        {/* Central Mode Toggle Switches */}
        <div className="flex bg-slate-100 dark:bg-[#0d1525] border border-slate-200 dark:border-slate-850 p-0.5 rounded-lg select-none">
          <button
            onClick={() => setIdeMode("editor")}
            className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${
              ideMode === "editor"
                ? "bg-primary text-white shadow-sm"
                : "text-slate-500 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-foreground"
            }`}
          >
            Code Workspace
          </button>
          <button
            onClick={() => setIdeMode("builder")}
            className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${
              ideMode === "builder"
                ? "bg-primary text-white shadow-sm"
                : "text-slate-500 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-foreground"
            }`}
          >
            Project Labs
          </button>
        </div>

        {/* Operations Right Controls */}
        <div className="flex items-center gap-2">
          {submission && (
            <Badge 
              variant={submission.status === "evaluated" ? "default" : "secondary"}
              className="text-[9px] tracking-wider uppercase font-bold"
            >
              {submission.status}
            </Badge>
          )}

          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="h-7 w-7 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-foreground hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg shrink-0"
            title="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-indigo-500" />}
          </Button>

          {/* Execution triggers */}
          {execState === 'running' ? (
            <Button 
              size="sm" 
              onClick={handleStopExecution} 
              className="h-7 text-xs bg-red-600 hover:bg-red-500 text-white font-bold"
            >
              <Square className="h-3.5 w-3.5 mr-1.5 fill-current" /> STOP
            </Button>
          ) : (
            <Button 
              size="sm" 
              onClick={handleRunCode} 
              className="h-7 text-xs bg-green-600 hover:bg-green-500 text-white font-bold"
            >
              <Play className="h-3.5 w-3.5 mr-1.5 fill-current" /> RUN CODE
            </Button>
          )}

          {/* Submission Trigger */}
          {assignmentId && (
            <Button 
              size="sm" 
              onClick={handleSubmitAssignment} 
              disabled={isLocked || submitting} 
              className="h-7 text-xs bg-primary hover:bg-primary/90 text-white font-bold"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
              {submitting ? "Submitting" : submission ? "RESUBMIT" : "SUBMIT"}
            </Button>
          )}
        </div>
      </div>

      {/* Primary Panels splits */}
      <div className="flex-1 min-h-0 flex relative bg-white dark:bg-slate-950">
        {/* Vertical Activity Bar */}
        <div className="w-12 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between items-center py-3 shrink-0 select-none">
          <div className="flex flex-col gap-4 w-full items-center">
            {/* Explorer button */}
            <button
              onClick={() => {
                if (sidebarOpen && activeSidebarTab === "explorer") {
                  updateLayout({ sidebarOpen: false });
                } else {
                  updateLayout({ sidebarOpen: true, activeSidebarTab: "explorer" });
                }
              }}
              className={cn(
                "p-2 rounded-lg transition-colors relative group",
                sidebarOpen && activeSidebarTab === "explorer"
                  ? "text-primary bg-primary/10"
                  : "text-slate-400 hover:text-slate-800 dark:text-slate-500 dark:hover:text-slate-200"
              )}
              title="File Explorer (Ctrl+B)"
            >
              <FolderPlus className="h-5 w-5" />
            </button>
            {/* Search button */}
            <button
              onClick={() => {
                if (sidebarOpen && activeSidebarTab === "search") {
                  updateLayout({ sidebarOpen: false });
                } else {
                  updateLayout({ sidebarOpen: true, activeSidebarTab: "search" });
                }
              }}
              className={cn(
                "p-2 rounded-lg transition-colors relative group",
                sidebarOpen && activeSidebarTab === "search"
                  ? "text-primary bg-primary/10"
                  : "text-slate-400 hover:text-slate-800 dark:text-slate-500 dark:hover:text-slate-200"
              )}
              title="Global Search (Ctrl+Shift+F)"
            >
              <Search className="h-5 w-5" />
            </button>
            {/* Git button placeholder */}
            <button
              className="p-2 rounded-lg text-slate-300 dark:text-slate-800 cursor-not-allowed group relative"
              title="Source Control (Disabled)"
            >
              <Code className="h-5 w-5 opacity-35 dark:opacity-20" />
              <span className="absolute left-14 bg-black text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">Coming Soon</span>
            </button>
            {/* Extensions button placeholder */}
            <button
              className="p-2 rounded-lg text-slate-300 dark:text-slate-800 cursor-not-allowed group relative"
              title="Extensions Marketplace (Disabled)"
            >
              <Settings className="h-5 w-5 opacity-35 dark:opacity-20" />
              <span className="absolute left-14 bg-black text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">Extensions Hub</span>
            </button>
          </div>
          {/* Settings at the bottom */}
          <button
            onClick={() => useIdeStore.setState({ activeDialog: "settings" })}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-800 dark:text-slate-500 dark:hover:text-slate-200 transition-colors"
            title="Editor Settings"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>

        {/* Resizable Split Panels for Sidebar & Editor Pane */}
        <ResizablePanelGroup direction="horizontal" className="flex-1">
          {/* File Explorer / Global Search Sidebar Panel */}
          {sidebarOpen && (
            <>
              <ResizablePanel 
                defaultSize={20} 
                minSize={12} 
                maxSize={30}
              >
                {activeSidebarTab === "explorer" ? (
                  <IdeExplorer />
                ) : (
                  <React.Suspense fallback={
                    <div className="flex flex-col items-center justify-center h-full space-y-2 text-slate-400 font-mono text-xs dark:bg-slate-950 bg-white">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span>Loading Search Engine...</span>
                    </div>
                  }>
                    <GlobalSearch />
                  </React.Suspense>
                )}
              </ResizablePanel>
              <ResizableHandle className="dark:bg-slate-800 bg-slate-200 w-[1px]" />
            </>
          )}

          {/* Center Space: Editor & Terminal Drawer */}
          <ResizablePanel defaultSize={ideMode === "editor" ? 80 : 50}>
            <ResizablePanelGroup direction="vertical">
              {/* Monaco Code editor split */}
              <ResizablePanel defaultSize={70} minSize={40}>
                <div className="h-full flex flex-col bg-white dark:bg-slate-950 min-h-0 relative">
                  <IdeEditorTabs />
                  <IdeBreadcrumbs />
                  <div className="flex-1 bg-white dark:bg-slate-950 overflow-hidden min-h-0 relative">
                    <SubsystemErrorBoundary subsystemName="Monaco Editor">
                      <React.Suspense fallback={
                        <div className="flex flex-col items-center justify-center h-full space-y-2 text-slate-400 font-mono text-xs dark:bg-slate-950 bg-white">
                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          <span>Spinning up Monaco Editor...</span>
                        </div>
                      }>
                        <IdeMonacoEditor />
                      </React.Suspense>
                    </SubsystemErrorBoundary>
                  </div>
                </div>
              </ResizablePanel>

              {/* Terminal Drawer split */}
              {terminalOpen && (
                <>
                  <ResizableHandle className="dark:bg-slate-850 bg-slate-200 h-[1px]" />
                  <ResizablePanel defaultSize={30} minSize={15}>
                    <IdeTerminal ref={terminalRef} onInput={handleTerminalInput} />
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          </ResizablePanel>

          {/* Right Space: Live Preview (Only in Project Builder mode) */}
          {previewOpen && (
            <>
              <ResizableHandle className="dark:bg-slate-800 bg-slate-200 w-[1px]" />
              <ResizablePanel defaultSize={30} minSize={20}>
                <SubsystemErrorBoundary subsystemName="Sandbox Preview">
                  <IdePreview />
                </SubsystemErrorBoundary>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>

      {/* VS Code Style Status Bar Footer */}
      <div className="h-6 shrink-0 bg-slate-100 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-3 flex items-center justify-between text-[10px] text-slate-500 dark:text-muted-foreground select-none font-mono leading-none">
        {/* Left Status Indicators */}
        <div className="flex items-center gap-3">
          {execState === "ready" && (
            <span className="flex items-center gap-1.5 text-slate-400 dark:text-muted-foreground/60">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-muted-foreground/40 shrink-0" />
              Ready
            </span>
          )}
          {execState === "running" && (
            <span className="flex items-center gap-1.5 text-amber-500 font-bold animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping shrink-0" />
              Running script...
            </span>
          )}
          {execState === "waiting" && (
            <span className="flex items-center gap-1.5 text-indigo-500 font-bold animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping shrink-0" />
              Awaiting console input...
            </span>
          )}
          {execState === "completed" && (
            <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
              Completed successfully
            </span>
          )}
          {execState === "error" && (
            <span className="flex items-center gap-1.5 text-red-500 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
              Execution aborted
            </span>
          )}

          {/* Collapsible history logs drawer trigger */}
          <button
            onClick={() => useIdeStore.setState({ activeDialog: "history" })}
            className="ml-3 text-slate-400 dark:text-muted-foreground/60 hover:text-primary transition-colors hover:underline"
          >
            Show Run History ({useIdeStore.getState().runHistory.length})
          </button>
        </div>

        {/* Right Session Details */}
        <div className="flex items-center gap-3">
          {activeFileId && activeNode && (
            <>
              <span>Ln {activeCursor?.line || 1}, Col {activeCursor?.column || 1}</span>
              <span className="opacity-30 dark:opacity-20 font-sans">|</span>
              <span>Spaces: {settings.tabSize}</span>
              <span className="opacity-30 dark:opacity-20 font-sans">|</span>
              <span>UTF-8</span>
              <span className="opacity-30 dark:opacity-20 font-sans">|</span>
              <span className="font-bold text-slate-700 dark:text-slate-350">
                {activeNode.language ? activeNode.language.toUpperCase() : "PLAIN TEXT"}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Command Palette Overlays */}
      <React.Suspense fallback={null}>
        <CommandPalette
          isOpen={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          defaultMode={paletteMode}
          extraCommands={[
            {
              name: "Execution: Run Code",
              icon: <Play className="h-4 w-4 text-green-400" />,
              action: handleRunCode
            },
            {
              name: "Execution: Stop Execution",
              icon: <Square className="h-4 w-4 text-red-400 fill-current" />,
              action: handleStopExecution
            },
            {
              name: "Assignment: Submit Code",
              icon: <Send className="h-4 w-4 text-primary" />,
              action: handleSubmitAssignment
            },
            {
              name: "Workspace: New File",
              icon: <FilePlus className="h-4 w-4 text-slate-400" />,
              action: () => openNewFileDialog(null)
            },
            {
              name: "Workspace: New Folder",
              icon: <FolderPlus className="h-4 w-4 text-slate-400" />,
              action: () => openNewFolderDialog(null)
            },
            {
              name: "Workspace: Rename Current Node",
              icon: <Edit2 className="h-4 w-4 text-slate-400" />,
              action: () => {
                if (activeFileId) openRenameDialog(activeFileId);
              }
            },
            {
              name: "Workspace: Delete Current File",
              icon: <Trash2 className="h-4 w-4 text-red-500" />,
              action: () => {
                if (activeFileId) deleteNode(activeFileId);
              }
            },
            {
              name: "Editor: Format Document",
              icon: <AlignLeft className="h-4 w-4 text-slate-400" />,
              action: () => {
                monaco.editor.getEditors()[0]?.getAction('editor.action.formatDocument')?.run();
              }
            },
            {
              name: "Focus: Editor",
              icon: <Code2 className="h-4 w-4 text-blue-400" />,
              action: () => {
                monaco.editor.getEditors()[0]?.focus();
              }
            },
            {
              name: "Focus: Terminal",
              icon: <TerminalIcon className="h-4 w-4 text-slate-400" />,
              action: () => {
                terminalRef.current?.focus();
              }
            }
          ]}
        />

        {/* Custom Dialog Subcomponents */}
        <NewFileDialog />
        <NewFolderDialog />
        <RenameFileDialog />
        <CloseTabProtectionDialog />
        <SettingsDialog />
        <ExecutionHistoryDialog />
      </React.Suspense>
    </div>
  );
};
