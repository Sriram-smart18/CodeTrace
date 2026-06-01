// File: src/components/ide/types/index.ts

export interface ProjectNode {
  id: string;
  name: string;
  type: "file" | "folder";
  parentId: string | null;
  language?: string;
  content?: string; // Standard file text content
  createdAt: string;
  updatedAt: string;
  isExpanded?: boolean; // Expanded folder tracking state
}

export interface IdeLayoutState {
  sidebarOpen: boolean;
  terminalOpen: boolean;
  previewOpen: boolean;
  activeSidebarTab: "explorer" | "search";
  sidebarWidth: number;
  terminalHeight: number;
}

export interface EditorSettings {
  fontSize: number;
  tabSize: number;
  wordWrap: "on" | "off";
  minimap: boolean;
  lineNumbers: "on" | "off";
  formatOnPaste: boolean;
  formatOnType: boolean;
}

export interface RunHistoryEntry {
  id: string;
  timestamp: string;
  fileName: string;
  language: string;
  status: "completed" | "error";
  durationMs: number;
  fileId: string;
}

export interface EditorSession {
  projectId: string;
  studentId: string;
  activeFileId: string | null;
  openTabs: string[]; // List of open file ids
  cursorPositions: Record<string, { line: number; column: number }>;
}

export interface TerminalSession {
  id: string;
  historyLogs: string[];
}

