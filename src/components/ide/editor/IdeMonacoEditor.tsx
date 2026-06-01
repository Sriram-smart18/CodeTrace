// File: src/components/ide/editor/IdeMonacoEditor.tsx
import React, { useRef, useEffect, useCallback } from "react";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { Loader2 } from "lucide-react";
import { useIdeStore } from "../store/ideStore";
import { telemetry } from "@/utils/runtimeTelemetry";
import { stabilityScorecard } from "@/utils/stabilityScorecard";
import { useTheme } from "next-themes";
import { getLanguageFromFilename } from "../utils/language";

// Initialize Monaco loader config here for code-splitting
loader.config({ monaco });

// Global caches for suspended models to preserve state across suspensions
const viewStateCache = new Map<string, monaco.editor.ICodeEditorViewState | null>();

// Configurable Monaco model cache size (configurable via env variable, defaults to 100)
const MAX_MODELS = parseInt(import.meta.env.VITE_MAX_MODELS || "100") || 100;
let modelAccessQueue: string[] = [];

let activeEditorInstances = 0;

export const IdeMonacoEditor: React.FC = () => {
  console.count('[MONACO RENDER]');
  const activeFileId = useIdeStore((state) => state.activeFileId);
  const settings = useIdeStore((state) => state.settings);
  console.log('[MONACO FILE]', activeFileId);
  
  const { theme } = useTheme();
  const editorTheme = theme === "light" ? "vs" : "vs-dark";

  useEffect(() => {
    console.count('[MONACO MOUNT]');
    return () => {
      console.log('[MONACO UNMOUNT]');
    };
  }, []);

  // Extract only the active file's name dynamically as a primitive to avoid complex object equality issues in Zustand v5.
  const activeFileName = useIdeStore(
    (state) => activeFileId ? state.nodesById[activeFileId]?.name : undefined
  );

  const setCursorPosition = useIdeStore((state) => state.setCursorPosition);
  const updateFileContent = useIdeStore((state) => state.updateFileContent);

  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const activeFileRef = useRef<string | null>(null);
  const onContentChangeRef = useRef<monaco.IDisposable | null>(null);

  // Debouncing refs
  const pendingUpdateRef = useRef<{ fileId: string; content: string } | null>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const pendingCursorRef = useRef<{ fileId: string; line: number; column: number } | null>(null);
  const cursorTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const flushPendingUpdate = useCallback(() => {
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
      updateTimeoutRef.current = null;
    }
    if (pendingUpdateRef.current) {
      const { fileId, content } = pendingUpdateRef.current;
      const currentStoreContent = useIdeStore.getState().nodesById[fileId]?.content;
      if (content !== currentStoreContent) {
        updateFileContent(fileId, content);
      }
      pendingUpdateRef.current = null;
    }
  }, [updateFileContent]);

  const flushPendingCursor = useCallback(() => {
    if (cursorTimeoutRef.current) {
      clearTimeout(cursorTimeoutRef.current);
      cursorTimeoutRef.current = null;
    }
    if (pendingCursorRef.current) {
      const { fileId, line, column } = pendingCursorRef.current;
      const currentPos = useIdeStore.getState().cursorPositions[fileId];
      if (!currentPos || currentPos.line !== line || currentPos.column !== column) {
        setCursorPosition(fileId, line, column);
      }
      pendingCursorRef.current = null;
    }
  }, [setCursorPosition]);

  const debouncedUpdateFileContent = useCallback((fileId: string, content: string) => {
    pendingUpdateRef.current = { fileId, content };
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    updateTimeoutRef.current = setTimeout(() => {
      flushPendingUpdate();
    }, 300); // 300ms debounce
  }, [flushPendingUpdate]);

  const debouncedSetCursorPosition = useCallback((fileId: string, line: number, column: number) => {
    pendingCursorRef.current = { fileId, line, column };
    if (cursorTimeoutRef.current) {
      clearTimeout(cursorTimeoutRef.current);
    }
    cursorTimeoutRef.current = setTimeout(() => {
      flushPendingCursor();
    }, 500); // 500ms debounce
  }, [flushPendingCursor]);

  // Switch model and handle suspension/restoration
  useEffect(() => {
    console.log('[EFFECT START] IdeMonacoEditor: Switch model setup');
    const editor = editorRef.current;
    if (!editor || !activeFileId || !activeFileName) return;

    // Flush any pending updates for the previous file before switching
    flushPendingUpdate();
    flushPendingCursor();

    const previousFileId = activeFileRef.current;
    activeFileRef.current = activeFileId;

    // 1. Suspend previous model
    if (previousFileId && previousFileId !== activeFileId) {
      // Save view state (scroll position, selections, cursor, folds)
      const viewState = editor.saveViewState();
      viewStateCache.set(previousFileId, viewState);
    }

    // 2. Restore or create current model
    const currentModelUri = monaco.Uri.parse(`file:///${activeFileId}`);
    let currentModel = monaco.editor.getModel(currentModelUri);
    const content = useIdeStore.getState().nodesById[activeFileId]?.content || "";
    const language = getLanguageFromFilename(activeFileName);

    if (!currentModel) {
      try {
        currentModel = monaco.editor.createModel(content, language, currentModelUri);
      } catch (err: any) {
        telemetry.logError('MonacoModelCreationError', err, { activeFileId, language });
        return;
      }
    } else {
      // Ensure syntax highlighting language is set correctly on tab activation
      monaco.editor.setModelLanguage(currentModel, language);
    }

    // Update MRU queue for LRU eviction
    modelAccessQueue = modelAccessQueue.filter(id => id !== activeFileId);
    modelAccessQueue.push(activeFileId);

    // Evict oldest models if exceeding the cap
    while (modelAccessQueue.length > MAX_MODELS) {
      const oldestFileId = modelAccessQueue.shift();
      if (oldestFileId && oldestFileId !== activeFileId) {
        const oldestModelUri = monaco.Uri.parse(`file:///${oldestFileId}`);
        const oldestModel = monaco.editor.getModel(oldestModelUri);
        if (oldestModel) {
          console.log(`[MONACO LRU EVICTION] Evicting model to conserve memory: ${oldestFileId}`);
          try {
            // Dispose of decorations/markers to free resources cleanly
            monaco.editor.setModelMarkers(oldestModel, "owner", []);
            // Nullify value to clear tokenization caches inside Monaco
            oldestModel.setValue("");
          } catch (e) {
            console.warn("Failed to clear markers/decorations on evicted model:", e);
          }
          oldestModel.dispose();
        }
        viewStateCache.delete(oldestFileId);
      }
    }

    // Bind current model to the editor
    editor.setModel(currentModel);

    // Clean up previous listeners
    if (onContentChangeRef.current) {
      onContentChangeRef.current.dispose();
      onContentChangeRef.current = null;
    }

    // Set content change listener to collect snapshots and update state
    onContentChangeRef.current = currentModel.onDidChangeContent(() => {
      const value = currentModel?.getValue() || "";
      
      const currentStoreVal = useIdeStore.getState().nodesById[activeFileId]?.content;
      if (value === currentStoreVal) return;

      debouncedUpdateFileContent(activeFileId, value);
    });

    // 3. Restore view state (cursor position, scroll top/left, folding state)
    const savedViewState = viewStateCache.get(activeFileId);
    if (savedViewState) {
      editor.restoreViewState(savedViewState);
    } else {
      // Fallback: restore cursor position from Zustand store dynamically
      const savedPos = useIdeStore.getState().cursorPositions[activeFileId];
      if (savedPos) {
        editor.setPosition({ lineNumber: savedPos.line, column: savedPos.column });
        editor.revealPosition({ lineNumber: savedPos.line, column: savedPos.column });
      }
    }

    editor.focus();

    return () => {
      console.log('[EFFECT CLEANUP] IdeMonacoEditor: Switch model cleanup');
    };
  }, [activeFileId]);

  // Track cursor position changes and sync to state
  useEffect(() => {
    console.log('[EFFECT START] IdeMonacoEditor: Cursor position setup');
    const editor = editorRef.current;
    if (!editor || !activeFileId) return;

    const disposable = editor.onDidChangeCursorPosition((e) => {
      const position = editor.getPosition();
      if (position && activeFileRef.current === activeFileId) {
        debouncedSetCursorPosition(activeFileId, position.lineNumber, position.column);
      }
    });

    return () => {
      console.log('[EFFECT CLEANUP] IdeMonacoEditor: Cursor position cleanup');
      disposable.dispose();
    };
  }, [activeFileId, debouncedSetCursorPosition]);

  // Listen to Global Search reveal requests and scroll Monaco accordingly
  const revealRequest = useIdeStore((state) => state.revealRequest);
  useEffect(() => {
    if (revealRequest && editorRef.current && activeFileId === revealRequest.fileId) {
      const editor = editorRef.current;
      editor.setPosition({ lineNumber: revealRequest.line, column: revealRequest.column });
      editor.revealPositionInCenter({ lineNumber: revealRequest.line, column: revealRequest.column });
      editor.focus();
      // Clear the request to avoid recursive highlights
      useIdeStore.setState({ revealRequest: null });
    }
  }, [revealRequest, activeFileId]);

  // Monaco Health Diagnostic Interval (Development)
  useEffect(() => {
    let previousModelCount = 0;
    
    const healthInterval = setInterval(() => {
      if (typeof window === 'undefined' || !(window as any).monaco) return;
      const monacoInstance = (window as any).monaco;
      const currentModels = monacoInstance.editor.getModels().length;
      
      console.log('[MONACO HEALTH]', {
        models: currentModels,
        editors: activeEditorInstances
      });

      // Simple heuristic: If model count didn't explode since last check, it's stable
      if (currentModels <= previousModelCount + 5) {
        stabilityScorecard.recordSuccess('monacoStability');
      }
      previousModelCount = currentModels;
    }, 30000);

    return () => {
      clearInterval(healthInterval);
    };
  }, []);

  // Clean up on component unmount to prevent leaks, but use reference counting for StrictMode safety
  useEffect(() => {
    console.log('[EFFECT START] IdeMonacoEditor: Unmount cleanup setup');
    activeEditorInstances++;
    return () => {
      console.log('[EFFECT CLEANUP] IdeMonacoEditor: Unmount cleanup executed');
      flushPendingUpdate();
      flushPendingCursor();
      if (onContentChangeRef.current) {
        onContentChangeRef.current.dispose();
      }
      
      activeEditorInstances--;
      if (activeEditorInstances === 0) {
        // Delay aggressive cleanup in case of immediate StrictMode remount
        setTimeout(() => {
          if (activeEditorInstances === 0) {
            console.log('[MONACO CLEANUP] Disposing all models. Active instances: 0');
            monaco.editor.getModels().forEach((model) => {
              model.dispose();
            });
            viewStateCache.clear();
          }
        }, 500);
      }
    };
  }, [flushPendingUpdate, flushPendingCursor]);

  const handleEditorMount = (editor: monaco.editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;

    // Trigger initial load for the currently active file
    if (activeFileId && activeFileName) {
      activeFileRef.current = activeFileId;
      try {
        const currentModelUri = monaco.Uri.parse(`file:///${activeFileId}`);
        let currentModel = monaco.editor.getModel(currentModelUri);
        const initialContent = useIdeStore.getState().nodesById[activeFileId]?.content || "";
        if (!currentModel) {
          currentModel = monaco.editor.createModel(
            initialContent,
            getLanguageFromFilename(activeFileName),
            currentModelUri
          );
        }
        editor.setModel(currentModel);

        // Restore position
        const initialSavedPos = useIdeStore.getState().cursorPositions[activeFileId];
        if (initialSavedPos) {
          editor.setPosition({ lineNumber: initialSavedPos.line, column: initialSavedPos.column });
          editor.revealPosition({ lineNumber: initialSavedPos.line, column: initialSavedPos.column });
        }
        editor.focus();
      } catch (err: any) {
        telemetry.logError('MonacoEditorMountError', err, { activeFileId });
      }
    }
  };

  if (!activeFileName) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center dark:bg-slate-950 bg-white text-slate-500 dark:text-muted-foreground/40 font-mono text-xs select-none">
        <Loader2 className="h-8 w-8 text-slate-300 dark:text-muted-foreground/20 animate-pulse mb-3" />
        No files currently focused.
        <span className="text-[10px] text-slate-400 dark:text-muted-foreground/30 mt-1">Select a file from the tree explorer sidebar.</span>
      </div>
    );
  }

  const safeMode = import.meta.env.VITE_IDE_SAFE_MODE === 'true';

  if (safeMode) {
    return (
      <div className="h-full w-full dark:bg-slate-950 bg-white dark:text-white text-slate-900 p-4 overflow-auto font-mono text-xs">
        <div className="text-yellow-500 mb-4 border-b border-yellow-500/30 pb-2 font-bold">
          [SAFE MODE] Monaco Editor Isolated. 
          <br />
          Editing disabled to prevent render loops.
        </div>
        <pre className="text-muted-foreground whitespace-pre-wrap">{activeFileId ? useIdeStore.getState().nodesById[activeFileId]?.content : ""}</pre>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative">
      <Editor
        height="100%"
        theme={editorTheme}
        onMount={handleEditorMount}
        loading={
          <div className="flex items-center justify-center h-full w-full bg-slate-50 dark:bg-[#1e1e1e]">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }
        options={{
          minimap: { enabled: settings.minimap },
          fontSize: settings.fontSize,
          tabSize: settings.tabSize,
          fontFamily: "'JetBrains Mono', monospace",
          lineNumbers: settings.lineNumbers,
          scrollBeyondLastLine: false,
          wordWrap: settings.wordWrap,
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          padding: { top: 8 },
          formatOnPaste: settings.formatOnPaste,
          formatOnType: settings.formatOnType,
          renderWhitespace: "selection",
        }}
      />
    </div>
  );
};
