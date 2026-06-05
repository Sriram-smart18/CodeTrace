import { useCallback, useRef, useEffect, useState } from "react";
import { useStore } from "zustand";
import { useIdeStore } from "@/components/ide/store/ideStore";
import { saveQueue } from "@/utils/saveQueue";

interface EditorState {
  code: string;
  language: string;
  cursorPosition?: { lineNumber: number; column: number };
  execMode?: "normal" | "interactive";
  timestamp: number;
}

export function useEditorPersistence(userId: string | undefined, assignmentId: string | undefined) {
  console.count('[RENDER] useEditorPersistence');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Hydration refs & flags to prevent load-save loops
  const hydratedRef = useRef<boolean>(false);
  const initializedRef = useRef<boolean>(false);
  const skipInitialSave = useRef<boolean>(false);
  const hydratingRef = useRef<boolean>(false);
  const [hydrationCompleted, setHydrationCompleted] = useState<boolean>(false);

  const activeFileId = useIdeStore((state) => state.activeFileId);
  const updateFileContent = useIdeStore((state) => state.updateFileContent);
  const setCursorPosition = useIdeStore((state) => state.setCursorPosition);

  // Subscribed to active file's details as primitive selections to avoid complex object equality checks
  const activeFileContent = useIdeStore((state) => activeFileId ? state.nodesById[activeFileId]?.content : undefined);
  const activeFileLanguage = useIdeStore((state) => activeFileId ? state.nodesById[activeFileId]?.language : undefined);
  const activeCursorLine = useIdeStore((state) => activeFileId ? state.cursorPositions[activeFileId]?.line : undefined);
  const activeCursorColumn = useIdeStore((state) => activeFileId ? state.cursorPositions[activeFileId]?.column : undefined);

  // Scoped key helper (v2 storage versioning)
  const getStorageKey = useCallback(() => {
    const keyUser = userId || "anonymous";
    const keyAssignment = assignmentId || "sandbox";
    return `codetrace:v2:editor:${keyUser}:${keyAssignment}`;
  }, [userId, assignmentId]);

  // Load state safely
  const loadState = useCallback((): EditorState | null => {
    try {
      const key = getStorageKey();
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      
      const parsed = JSON.parse(raw);
      
      // Corruption detection schema validation
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        typeof parsed.code !== "string" ||
        typeof parsed.language !== "string" ||
        typeof parsed.timestamp !== "number"
      ) {
        console.warn("[IDE] Corrupted persistence state detected, wiping local storage for key:", key);
        localStorage.removeItem(key);
        return null;
      }
      
      return parsed as EditorState;
    } catch (e) {
      console.error("Error loading editor state from localStorage", e);
      try {
        localStorage.removeItem(getStorageKey());
      } catch (wipeErr) {
        // Ignore potential localStorage errors on write-blocked environments
      }
      return null;
    }
  }, [getStorageKey]);

  // Save state using singleton saveQueue
  const persistState = useCallback((
    code: string,
    language: string,
    cursorPosition?: { lineNumber: number; column: number },
    execMode?: "normal" | "interactive"
  ) => {
    if (!userId) return; // Only persist for logged-in users

    const key = getStorageKey();
    const state: EditorState = {
      code,
      language,
      cursorPosition,
      execMode,
      timestamp: Date.now(),
    };

    saveQueue.enqueue({
      id: key,
      version: state.timestamp, // Use timestamp as version
      payload: state,
      persistFn: (payload) => {
        try {
          localStorage.setItem(key, JSON.stringify(payload));
        } catch (e) {
          console.error("Error saving editor state to localStorage", e);
        }
      }
    });
  }, [userId, getStorageKey]);

  // Explicit clear state (e.g. after submission if required, or let it stay for local history)
  const clearState = useCallback(() => {
    try {
      const key = getStorageKey();
      localStorage.removeItem(key);
    } catch (e) {
      console.error("Error clearing editor state", e);
    }
  }, [getStorageKey]);

  // Step 1 & 2: Hydrate local state once on mount or when dependencies become available
  useEffect(() => {
    console.log('[EFFECT START] useEditorPersistence: hydration effect');
    if (!userId || !activeFileId || initializedRef.current) {
      console.log('[EFFECT BYPASS] useEditorPersistence: hydration skipped', { userId, activeFileId, initialized: initializedRef.current });
      return;
    }

    initializedRef.current = true;
    hydratingRef.current = true;
    console.log("[IDE] hydration start");

    const saved = loadState();
    if (saved && saved.code) {
      // Step 3: Set skipInitialSave flag to skip first autosave
      skipInitialSave.current = true;
      
      updateFileContent(activeFileId, saved.code);
      if (saved.cursorPosition) {
        setCursorPosition(activeFileId, saved.cursorPosition.lineNumber, saved.cursorPosition.column);
      }
    }

    hydratedRef.current = true;
    console.log("[STATE UPDATE] useEditorPersistence: hydrationCompleted -> true");
    setHydrationCompleted(true);
    console.log("[IDE] hydration complete");
    hydratingRef.current = false;

    return () => {
      console.log('[EFFECT CLEANUP] useEditorPersistence: hydration cleanup');
    };
  }, [userId, activeFileId, loadState, updateFileContent, setCursorPosition]);

  // Step 4: Debounced persistence on subsequent state changes
  useEffect(() => {
    console.log('[EFFECT START] useEditorPersistence: autosave check effect');
    if (hydratingRef.current) {
      console.log('[EFFECT BYPASS] useEditorPersistence: autosave check bypassed (hydrating)');
      return;
    }
    if (!hydratedRef.current || !activeFileId || activeFileContent === undefined) {
      console.log('[EFFECT BYPASS] useEditorPersistence: autosave check skipped', { hydrated: hydratedRef.current, activeFileId, activeFileContentUndefined: activeFileContent === undefined });
      return;
    }

    if (skipInitialSave.current) {
      skipInitialSave.current = false;
      console.log("[IDE] autosave skipped");
      return;
    }

    console.log("[IDE] autosave triggered");
    persistState(
      activeFileContent || "",
      activeFileLanguage || "javascript",
      activeCursorLine !== undefined && activeCursorColumn !== undefined
        ? { lineNumber: activeCursorLine, column: activeCursorColumn }
        : undefined
    );

    return () => {
      console.log('[EFFECT CLEANUP] useEditorPersistence: autosave check cleanup');
    };
  }, [activeFileId, activeFileContent, activeFileLanguage, activeCursorLine, activeCursorColumn, persistState]);

  return { 
    loadState, 
    persistState, 
    clearState, 
    hydrationCompleted, 
    hydratedRef, 
    initializedRef, 
    skipInitialSave 
  };
}

