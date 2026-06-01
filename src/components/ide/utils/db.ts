// File: src/components/ide/utils/db.ts
import { ProjectNode, IdeLayoutState } from "../types";

interface SavedProjectState {
  projectId: string;
  nodes: Record<string, ProjectNode>;
  openTabs: string[];
  activeFileId: string | null;
  cursorPositions: Record<string, { line: number; column: number }>;
  layoutState?: IdeLayoutState;
  terminalLogs?: string[];
  updatedAt: number;
}

const DB_NAME = "codetrace_ide_db";
const STORE_NAME = "project_states";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "projectId" });
      }
    };
  });
}

export async function saveProjectToDB(state: SavedProjectState): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(state);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn("IndexedDB not available, writing to localStorage fallback", err);
    try {
      const key = `codetrace_fallback_project:${state.projectId}`;
      localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {
      console.error("LocalStorage fallback failed", e);
    }
  }
}

export async function loadProjectFromDB(projectId: string): Promise<SavedProjectState | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(projectId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn("IndexedDB load failed, trying localStorage fallback", err);
    try {
      const key = `codetrace_fallback_project:${projectId}`;
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error("LocalStorage fallback load failed", e);
      return null;
    }
  }
}

export async function clearProjectFromDB(projectId: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(projectId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn("IndexedDB clear failed, trying localStorage fallback", err);
    try {
      const key = `codetrace_fallback_project:${projectId}`;
      localStorage.removeItem(key);
    } catch (e) {
      console.error("LocalStorage fallback clear failed", e);
    }
  }
}
