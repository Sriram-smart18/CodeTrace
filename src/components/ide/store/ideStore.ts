// File: src/components/ide/store/ideStore.ts
import { create } from "zustand";
import { ProjectNode, IdeLayoutState, EditorSettings, RunHistoryEntry } from "../types";
import { saveProjectToDB, loadProjectFromDB } from "../utils/db";
import { saveQueue } from "@/utils/saveQueue";
import { validateEditorSync } from "@/lib/schemaValidation";
import { getLanguageFromFilename } from "../utils/language";

export interface IdeState {
  projectId: string | null;
  nodesById: Record<string, ProjectNode>;
  childrenByParentId: Record<string, string[]>;
  openTabs: string[];
  activeFileId: string | null;
  cursorPositions: Record<string, { line: number; column: number }>;
  layoutState: IdeLayoutState;
  terminalLogs: string[];
  searchQuery: string;
  loading: boolean;
  saving: boolean;

  // Polished states
  savingStatus: "idle" | "saving" | "saved" | "unsaved";
  dirtyFiles: Record<string, boolean>;
  closeTabConfirmId: string | null;
  execState: "ready" | "running" | "waiting" | "completed" | "error";
  settings: EditorSettings;
  runHistory: RunHistoryEntry[];
  revealRequest: { fileId: string; line: number; column: number; ts: number } | null;

  setLoading: (loading: boolean) => void;
  initializeProject: (projectId: string, name: string, nodes: ProjectNode[]) => void;
  loadProjectFromPersistence: (projectId: string) => Promise<boolean>;
  createFile: (name: string, parentId: string | null, content?: string, language?: string) => string;
  createFolder: (name: string, parentId: string | null) => string;
  renameNode: (id: string, name: string) => void;
  deleteNode: (id: string) => void;
  moveNode: (id: string, newParentId: string | null) => void;
  toggleFolderExpanded: (id: string) => void;
  openFile: (id: string) => void;
  closeTab: (id: string) => void;
  forceCloseTab: (id: string) => void;
  setCursorPosition: (fileId: string, line: number, column: number) => void;
  updateFileContent: (fileId: string, content: string) => void;
  setSearchQuery: (query: string) => void;
  setTerminalLogs: (logs: string[]) => void;
  addTerminalLog: (log: string) => void;
  updateLayout: (updates: Partial<IdeLayoutState>) => void;
  saveToSupabase: (supabaseClient: any) => Promise<boolean>;

  // Polished actions
  setSavingStatus: (status: "idle" | "saving" | "saved" | "unsaved") => void;
  setCloseTabConfirmId: (id: string | null) => void;
  setExecState: (status: "ready" | "running" | "waiting" | "completed" | "error") => void;
  updateSettings: (updates: Partial<EditorSettings>) => void;
  addRunHistory: (run: Omit<RunHistoryEntry, "id" | "timestamp">) => void;
  setRevealRequest: (req: { fileId: string; line: number; column: number; ts: number } | null) => void;
  logAudit: (action: string, metadata?: any) => void;

  // Dialog System States
  activeDialog: "newFile" | "newFolder" | "rename" | "settings" | "history" | null;
  dialogTargetNodeId: string | null;
  openNewFileDialog: (parentId: string | null) => void;
  openNewFolderDialog: (parentId: string | null) => void;
  openRenameDialog: (id: string) => void;
  closeDialog: () => void;
}


function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return false;
  
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (Array.isArray(a) || Array.isArray(b)) return false;
  
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }

  return true;
}

// Rebuild children index helper (folders first, then files, sorted alphabetically)
const rebuildChildren = (nodesById: Record<string, ProjectNode>): Record<string, string[]> => {
  const children: Record<string, string[]> = { root: [] };
  Object.values(nodesById).forEach((node) => {
    const parent = node.parentId || "root";
    if (!children[parent]) {
      children[parent] = [];
    }
    children[parent].push(node.id);
  });

  Object.keys(children).forEach((parent) => {
    children[parent].sort((a, b) => {
      const nodeA = nodesById[a];
      const nodeB = nodesById[b];
      if (!nodeA || !nodeB) return 0;
      if (nodeA.type !== nodeB.type) {
        return nodeA.type === "folder" ? -1 : 1;
      }
      return nodeA.name.localeCompare(nodeB.name);
    });
  });

  return children;
};

// Default settings definition
const DEFAULT_SETTINGS: EditorSettings = {
  fontSize: 13,
  tabSize: 4,
  wordWrap: "on",
  minimap: true,
  lineNumbers: "on",
  formatOnPaste: true,
  formatOnType: true
};

const loadSettingsFromStorage = (): EditorSettings => {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem("tracecode-editor-settings");
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error("Failed to load editor settings", e);
  }
  return DEFAULT_SETTINGS;
};

const loadRunHistoryFromStorage = (): RunHistoryEntry[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("tracecode-run-history");
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error("Failed to load run history", e);
  }
  return [];
};

// Auto-save debounce state
let saveDebounceTimer: NodeJS.Timeout | null = null;

const triggerSupabaseSync = (projectId: string, get: () => any) => {
  const state = get();
  saveQueue.enqueue({
    id: `codetrace:v2:sandbox-project-${projectId}`,
    version: Date.now(),
    payload: null,
    persistFn: async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      console.log("[useIdeStore] Syncing changes to Supabase via saveQueue...");
      await state.saveToSupabase(supabase);
    }
  });
};

const triggerAutoSave = (projectId: string, get: () => any) => {
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    // Set status to saving
    useIdeStore.setState({ savingStatus: "saving" });

    const state = get();
    const dataToSave = {
      projectId,
      nodes: state.nodesById,
      openTabs: state.openTabs,
      activeFileId: state.activeFileId,
      cursorPositions: state.cursorPositions,
      layoutState: state.layoutState,
      terminalLogs: [], // Do NOT persist full terminal logs in DB to avoid bloat
      updatedAt: Date.now()
    };
    saveProjectToDB(dataToSave)
      .then(() => {
        // Clear dirty flags upon successful local save
        const currentDirty = { ...useIdeStore.getState().dirtyFiles };
        Object.keys(currentDirty).forEach((key) => {
          currentDirty[key] = false;
        });

        useIdeStore.setState({
          dirtyFiles: currentDirty,
          savingStatus: "saved"
        });
      })
      .catch((err) => {
        console.error("IDB Save error:", err);
        useIdeStore.setState({ savingStatus: "idle" });
      });
  }, 1500); // 1.5s debounce
};


// Reconnect sync listener: Auto-sync buffered changes when network is restored
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    console.log("[useIdeStore] Network connection restored. Performing automatic reconnect sync...");
    const state = useIdeStore.getState();
    if (state.projectId) {
      import("@/integrations/supabase/client").then(({ supabase }) => {
        state.saveToSupabase(supabase);
      });
    }
  });
}

export const useIdeStore = create<IdeState>()((rawSet, get) => {
  const set = (
    newPartialState: Partial<IdeState> | ((state: IdeState) => Partial<IdeState>)
  ) => {
    const currentState = get();
    const updates = typeof newPartialState === "function" ? newPartialState(currentState) : newPartialState;
    
    // Check if updates actually change any values in the state
    const hasChanges = Object.keys(updates).some((key) => {
      const k = key as keyof IdeState;
      return !deepEqual(currentState[k], updates[k]);
    });

    if (!hasChanges) {
      console.log("[IDE] recursive update prevented: duplicate state set");
      return;
    }

    console.log("[STORE UPDATE]", Object.keys(updates));
    console.trace("[STORE WRITE]", Object.keys(updates));
    rawSet(updates);
  };

  return {
    projectId: null,
    nodesById: {},
    childrenByParentId: { root: [] },
    openTabs: [],
    activeFileId: null,
    cursorPositions: {},
    layoutState: {
      sidebarOpen: true,
      terminalOpen: true,
      previewOpen: true,
      activeSidebarTab: "explorer",
      sidebarWidth: 260,
      terminalHeight: 250,
    },
    terminalLogs: ["[system] Welcome to CodeTrace Cloud Terminal.", "[system] Sandbox virtual engine ready."],
    searchQuery: "",
    loading: false,
    saving: false,
    activeDialog: null,
    dialogTargetNodeId: null,

    // Polished states initialization
    savingStatus: "idle",
    dirtyFiles: {},
    closeTabConfirmId: null,
    execState: "ready",
    settings: loadSettingsFromStorage(),
    runHistory: loadRunHistoryFromStorage(),
    revealRequest: null,

    openNewFileDialog: (parentId) => {
      set({ activeDialog: "newFile", dialogTargetNodeId: parentId });
    },
    openNewFolderDialog: (parentId) => {
      set({ activeDialog: "newFolder", dialogTargetNodeId: parentId });
    },
    openRenameDialog: (id) => {
      set({ activeDialog: "rename", dialogTargetNodeId: id });
    },
    closeDialog: () => {
      set({ activeDialog: null, dialogTargetNodeId: null });
    },

    setLoading: (loading) => {
      console.log('[STORE ACTION] setLoading ->', loading);
      set({ loading });
    },

    initializeProject: (projectId, name, nodes) => {
      console.log('[STORE ACTION] initializeProject ->', projectId, name);
      const nodesById: Record<string, ProjectNode> = {};
      nodes.forEach((node) => {
        nodesById[node.id] = node;
      });

      const childrenByParentId = rebuildChildren(nodesById);

      let initialActiveFileId = get().activeFileId;
      if (!initialActiveFileId || !nodesById[initialActiveFileId]) {
        console.error('[IDE ERROR] Invalid activeFileId', initialActiveFileId);
        const firstFile = Object.values(nodesById).find(n => n.type === 'file');
        if (firstFile) {
          initialActiveFileId = firstFile.id;
          console.log('[IDE RECOVERY] Recovered active file', firstFile.id);
        } else {
          initialActiveFileId = null;
        }
      }

      // Initialize periodic 60s cloud-sync save to prevent Supabase spamming
      if (typeof window !== "undefined") {
        if ((window as any).supabaseSyncInterval) {
          clearInterval((window as any).supabaseSyncInterval);
        }
        (window as any).supabaseSyncInterval = setInterval(() => {
          console.log("[useIdeStore] Periodic 60s cloud sync triggered...");
          triggerSupabaseSync(projectId, get);
        }, 60000);
      }

      set({
        projectId,
        nodesById,
        childrenByParentId,
        activeFileId: initialActiveFileId,
        loading: false,
        savingStatus: "idle",
        dirtyFiles: {}
      });
    },


    loadProjectFromPersistence: async (projectId) => {
      console.log('[STORE ACTION] loadProjectFromPersistence ->', projectId);
      const saved = await loadProjectFromDB(projectId);
      if (!saved) {
        console.log('[STORE ACTION] loadProjectFromPersistence -> no saved state found');
        return false;
      }

      // Schema corruption detection for indexedDB payload
      if (!saved.nodes || typeof saved.nodes !== "object" || Array.isArray(saved.nodes)) {
        console.warn("[IDE] Corrupted DB persistence state detected (invalid nodes payload) for project:", projectId);
        return false;
      }

      // Additional integrity check: ensure nodes have required fields
      const hasCorruptedNodes = Object.values(saved.nodes).some((n: any) => !n.id || !n.type || typeof n.name !== 'string');
      if (hasCorruptedNodes) {
         console.warn("[IDE] Corrupted DB persistence state detected (malformed nodes) for project:", projectId);
         return false;
      }

      const childrenByParentId = rebuildChildren(saved.nodes);

      let activeFileId = saved.activeFileId;
      if (!activeFileId || !saved.nodes[activeFileId]) {
        console.error('[IDE ERROR] Invalid activeFileId', activeFileId);
        const firstFile = Object.values(saved.nodes).find((n: any) => n.type === 'file');
        if (firstFile) {
          activeFileId = (firstFile as any).id;
          console.log('[IDE RECOVERY] Recovered active file', activeFileId);
        } else {
          activeFileId = null;
        }
      }

      set({
        projectId,
        nodesById: saved.nodes,
        childrenByParentId,
        openTabs: saved.openTabs || [],
        activeFileId,
        cursorPositions: saved.cursorPositions || {},
        layoutState: saved.layoutState || get().layoutState,
        terminalLogs: saved.terminalLogs || get().terminalLogs,
      });

      return true;
    },

    createFile: (name, parentId, content = "", language) => {
      const { projectId, nodesById } = get();
      const id = crypto.randomUUID();
      
      // Auto-detect language if not provided
      const detectedLang = language || getLanguageFromFilename(name);

      const newNode: ProjectNode = {
        id,
        name,
        type: "file",
        parentId,
        content,
        language: detectedLang,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const nextNodes = { ...nodesById, [id]: newNode };
      const nextChildren = rebuildChildren(nextNodes);

      set({
        nodesById: nextNodes,
        childrenByParentId: nextChildren,
      });

      // Auto-open file in tab
      get().openFile(id);

      get().logAudit("File Created", { id, name, parentId });

      if (projectId) triggerAutoSave(projectId, get);
      return id;
    },

    createFolder: (name, parentId) => {
      const { projectId, nodesById } = get();
      const id = crypto.randomUUID();

      const newNode: ProjectNode = {
        id,
        name,
        type: "folder",
        parentId,
        isExpanded: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const nextNodes = { ...nodesById, [id]: newNode };
      const nextChildren = rebuildChildren(nextNodes);

      set({
        nodesById: nextNodes,
        childrenByParentId: nextChildren,
      });

      get().logAudit("Folder Created", { id, name, parentId });

      if (projectId) triggerAutoSave(projectId, get);
      return id;
    },

    renameNode: (id, name) => {
      const { projectId, nodesById } = get();
      const node = nodesById[id];
      if (!node) return;

      // Detect new language if extension changes
      let nextLanguage = node.language;
      if (node.type === "file") {
        nextLanguage = getLanguageFromFilename(name);
      }

      const nextNodes = {
        ...nodesById,
        [id]: {
          ...node,
          name,
          language: nextLanguage,
          updatedAt: new Date().toISOString(),
        },
      };
      const nextChildren = rebuildChildren(nextNodes);

      set({
        nodesById: nextNodes,
        childrenByParentId: nextChildren,
      });

      if (projectId) triggerAutoSave(projectId, get);
    },

    deleteNode: (id) => {
      const { projectId, nodesById, openTabs, activeFileId } = get();
      const nextNodes = { ...nodesById };
      
      // Recursive descendant deletion helper
      const gatherDescendantIds = (targetId: string): string[] => {
        const ids = [targetId];
        Object.values(nextNodes).forEach((n) => {
          if (n.parentId === targetId) {
            ids.push(...gatherDescendantIds(n.id));
          }
        });
        return ids;
      };

      const idsToDelete = gatherDescendantIds(id);
      idsToDelete.forEach((delId) => {
        delete nextNodes[delId];
      });

      const nextChildren = rebuildChildren(nextNodes);
      const nextTabs = openTabs.filter(t => !idsToDelete.includes(t));
      let nextActive = activeFileId;

      if (activeFileId && idsToDelete.includes(activeFileId)) {
        nextActive = nextTabs.length > 0 ? nextTabs[nextTabs.length - 1] : null;
      }

      set({
        nodesById: nextNodes,
        childrenByParentId: nextChildren,
        openTabs: nextTabs,
        activeFileId: nextActive,
      });

      get().logAudit("Node Deleted", { id, gatheredIdsToDelete: idsToDelete });

      if (projectId) triggerAutoSave(projectId, get);
    },

    moveNode: (id, newParentId) => {
      const { projectId, nodesById } = get();
      const node = nodesById[id];
      if (!node) return;

      // Guard against moving folder into its own children descendants
      if (node.type === "folder") {
        let tempParent = newParentId;
        while (tempParent !== null) {
          if (tempParent === id) {
            console.warn("Invalid placement: cannot move a directory inside its own child subtree.");
            return;
          }
          tempParent = nodesById[tempParent]?.parentId || null;
        }
      }

      const nextNodes = {
        ...nodesById,
        [id]: {
          ...node,
          parentId: newParentId,
          updatedAt: new Date().toISOString(),
        },
      };
      const nextChildren = rebuildChildren(nextNodes);

      set({
        nodesById: nextNodes,
        childrenByParentId: nextChildren,
      });

      if (projectId) triggerAutoSave(projectId, get);
    },

    toggleFolderExpanded: (id) => {
      const { projectId, nodesById } = get();
      const node = nodesById[id];
      if (!node || node.type !== "folder") return;

      set({
        nodesById: {
          ...nodesById,
          [id]: {
            ...node,
            isExpanded: !node.isExpanded,
          },
        },
      });

      if (projectId) triggerAutoSave(projectId, get);
    },

    openFile: (id) => {
      const { projectId, openTabs } = get();
      const nextTabs = openTabs.includes(id) ? openTabs : [...openTabs, id];
      set({
        openTabs: nextTabs,
        activeFileId: id,
      });

      if (projectId) triggerAutoSave(projectId, get);
    },

    closeTab: (id) => {
      const { openTabs, dirtyFiles } = get();
      if (dirtyFiles[id]) {
        // Intercept dirty file closes
        set({ closeTabConfirmId: id });
        return;
      }
      get().forceCloseTab(id);
    },

    forceCloseTab: (id) => {
      const { projectId, openTabs, activeFileId } = get();
      const nextTabs = openTabs.filter(t => t !== id);
      let nextActive = activeFileId;

      if (activeFileId === id) {
        nextActive = nextTabs.length > 0 ? nextTabs[nextTabs.length - 1] : null;
      }

      set({
        openTabs: nextTabs,
        activeFileId: nextActive,
        closeTabConfirmId: null
      });

      if (projectId) triggerAutoSave(projectId, get);
    },

    setCursorPosition: (fileId, line, column) => {
      console.log('[STORE ACTION] setCursorPosition ->', fileId, line, column);
      const { projectId, cursorPositions } = get();
      set({
        cursorPositions: {
          ...cursorPositions,
          [fileId]: { line, column },
        },
      });

      if (projectId) triggerAutoSave(projectId, get);
    },

    updateFileContent: (fileId, content) => {
      console.log('[STORE ACTION] updateFileContent ->', fileId, `length=${content?.length}`);
      const { projectId, nodesById, dirtyFiles } = get();
      const node = nodesById[fileId];
      if (!node) return;

      const nextNodes = {
        ...nodesById,
        [fileId]: {
          ...node,
          content,
          updatedAt: new Date().toISOString(),
        },
      };

      set({
        nodesById: nextNodes,
        dirtyFiles: {
          ...dirtyFiles,
          [fileId]: true
        },
        savingStatus: "unsaved"
      });

      if (projectId) triggerAutoSave(projectId, get);
    },

    setSearchQuery: (searchQuery) => set({ searchQuery }),

    setTerminalLogs: (terminalLogs) => set({ terminalLogs }),

    addTerminalLog: (log) => {
      const { projectId, terminalLogs } = get();
      const nextLogs = [...terminalLogs, log].slice(-100);
      set({ terminalLogs: nextLogs });
      if (projectId) triggerAutoSave(projectId, get);
    },

    updateLayout: (updates) => {
      console.log('[STORE ACTION] updateLayout ->', updates);
      const { projectId, layoutState } = get();
      set({
        layoutState: {
          ...layoutState,
          ...updates,
        },
      });

      if (projectId) triggerAutoSave(projectId, get);
    },

    // Polished actions
    setSavingStatus: (savingStatus) => set({ savingStatus }),
    setCloseTabConfirmId: (closeTabConfirmId) => set({ closeTabConfirmId }),
    setExecState: (execState) => set({ execState }),
    updateSettings: (updates) => {
      const nextSettings = { ...get().settings, ...updates };
      set({ settings: nextSettings });
      if (typeof window !== "undefined") {
        localStorage.setItem("tracecode-editor-settings", JSON.stringify(nextSettings));
      }
    },
    addRunHistory: (run) => {
      const history = get().runHistory;
      const newEntry: RunHistoryEntry = {
        id: crypto.randomUUID(),
        timestamp: new Date().toLocaleTimeString(),
        ...run
      };
      const nextHistory = [newEntry, ...history];
      if (typeof window !== "undefined") {
        localStorage.setItem("tracecode-run-history", JSON.stringify(nextHistory.slice(0, 100)));
      }
      set({ runHistory: nextHistory.slice(0, 20) });
    },
    setRevealRequest: (revealRequest) => set({ revealRequest }),
    logAudit: (action, metadata = {}) => {
      let userId = "anonymous";
      try {
        const rawUser = localStorage.getItem("supabase.auth.token");
        if (rawUser) {
          const parsed = JSON.parse(rawUser);
          userId = parsed?.currentSession?.user?.id || "anonymous";
        }
      } catch (e) {
        // Ignore JSON parsing or token retrieval errors
      }

      const logs = JSON.parse(localStorage.getItem("tracecode-audit-logs") || "[]");
      const newEntry = {
        id: crypto.randomUUID(),
        userId,
        action,
        timestamp: new Date().toISOString(),
        metadata
      };
      
      logs.push(newEntry);
      
      localStorage.setItem("tracecode-audit-logs", JSON.stringify(logs.slice(-500)));
      console.log(`[AUDIT LOG] [${newEntry.timestamp}] [User: ${userId}] Action: ${action}`, metadata);
    },

    saveToSupabase: async (supabaseClient) => {
      const { projectId, nodesById, openTabs, activeFileId, cursorPositions, layoutState } = get();
      if (!projectId) return false;

      set({ saving: true, savingStatus: "saving" });
      try {
        // 1. Fetch current files from DB to compute additions and deletions
        const { data: dbFiles } = await supabaseClient
          .from("project_files")
          .select("id")
          .eq("project_id", projectId);

        const dbFileIds = (dbFiles || []).map((f: any) => f.id);
        const localNodes = Object.values(nodesById);
        const localNodeIds = localNodes.map(n => n.id);

        // Deletes nodes not present locally
        const idsToDelete = dbFileIds.filter((id: string) => !localNodeIds.includes(id));
        if (idsToDelete.length > 0) {
          await supabaseClient.from("project_files").delete().in("id", idsToDelete);
        }

        // Upsert local nodes
        if (localNodes.length > 0) {
          const filePayloads = localNodes.map((n) => ({
            id: n.id,
            project_id: projectId,
            name: n.name,
            type: n.type,
            parent_id: n.parentId,
            content: n.content || null,
            language: n.language || null,
            created_at: n.createdAt,
            updated_at: n.updatedAt,
          }));
          
          await supabaseClient.from("project_files").upsert(filePayloads);
        }

        // 2. Validate and Upsert Editor Sessions
        const { data: profile } = await supabaseClient.auth.getUser();
        const studentId = profile?.user?.id;
        if (studentId) {
          const sessionPayload = {
            project_id: projectId,
            student_id: studentId,
            active_file_id: activeFileId,
            open_tabs: openTabs,
            cursor_positions: cursorPositions,
            layout_state: layoutState
          };

          // Strict validation gate
          const validatedPayload = validateEditorSync(sessionPayload);

          await supabaseClient.from("editor_sessions").upsert({
            ...validatedPayload,
            updated_at: new Date().toISOString()
          });

          // 3. Upsert Terminal Sessions
          await supabaseClient.from("terminal_sessions").upsert({
            project_id: projectId,
            student_id: studentId,
            history_logs: ["[system] Interactive terminal logs."],
            updated_at: new Date().toISOString()
          });
        }

        // Clear all dirty files on database sync success
        const currentDirty = { ...get().dirtyFiles };
        Object.keys(currentDirty).forEach((key) => {
          currentDirty[key] = false;
        });

        get().logAudit("Workspace Synced to Cloud", { projectId });

        set({
          saving: false,
          savingStatus: "saved",
          dirtyFiles: currentDirty
        });
        return true;
      } catch (e) {
        console.error("Failed to sync project payload to Supabase database:", e);
        set({ saving: false, savingStatus: "idle" });
        return false;
      }
    }
  };
});

