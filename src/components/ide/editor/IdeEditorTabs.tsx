// File: src/components/ide/editor/IdeEditorTabs.tsx
import React from "react";
import { X } from "lucide-react";
import { useIdeStore } from "../store/ideStore";
import { cn } from "@/lib/utils";
import { getFileIcon } from "../utils/icons";

export const IdeEditorTabs: React.FC = () => {
  const openTabs = useIdeStore((state) => state.openTabs);
  const savingStatus = useIdeStore((state) => state.savingStatus);

  if (openTabs.length === 0) return null;

  return (
    <div className="h-9 w-full bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between select-none shrink-0 px-1 overflow-hidden">
      <div className="flex items-center overflow-x-auto overflow-y-hidden h-full scrollbar-none flex-1 min-w-0">
        {openTabs.map((tabId) => (
          <TabItem key={tabId} tabId={tabId} />
        ))}
      </div>
      
      {/* Auto Save Status Indicator */}
      <div className="flex items-center gap-1.5 shrink-0 px-2.5 font-mono text-[10px] select-none border-l border-slate-200 dark:border-slate-800 h-full bg-slate-50/50 dark:bg-slate-950/50">
        {savingStatus === "saving" && (
          <span className="flex items-center gap-1 text-amber-500 font-bold animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping shrink-0" />
            Saving...
          </span>
        )}
        {savingStatus === "saved" && (
          <span className="flex items-center gap-1 text-green-500 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
            Saved
          </span>
        )}
        {savingStatus === "unsaved" && (
          <span className="flex items-center gap-1 text-slate-400 dark:text-muted-foreground/60 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
            Unsaved
          </span>
        )}
      </div>
    </div>
  );
};

const TabItem: React.FC<{ tabId: string }> = React.memo(({ tabId }) => {
  const activeFileId = useIdeStore((state) => state.activeFileId);
  const openFile = useIdeStore((state) => state.openFile);
  const closeTab = useIdeStore((state) => state.closeTab);
  
  // Select primitive values to avoid re-renders
  const name = useIdeStore((state) => state.nodesById[tabId]?.name || "");
  const isActive = activeFileId === tabId;
  const isDirty = useIdeStore((state) => state.dirtyFiles[tabId]);

  const handleTabClick = (e: React.MouseEvent) => {
    e.preventDefault();
    openFile(tabId);
  };

  const handleCloseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    closeTab(tabId);
  };

  return (
    <div
      onClick={handleTabClick}
      className={cn(
        "h-full flex items-center gap-2 px-3 border-r border-slate-200 dark:border-slate-800 cursor-pointer select-none font-mono text-xs transition-colors shrink-0 group/tab",
        isActive 
          ? "bg-white dark:bg-slate-900 text-primary border-t-2 border-t-primary" 
          : "bg-slate-100/50 dark:bg-slate-950/50 text-slate-500 dark:text-muted-foreground hover:bg-slate-200/50 dark:hover:bg-slate-900/50 hover:text-slate-900 dark:hover:text-foreground"
      )}
    >
      {getFileIcon(name)}
      <span className="max-w-[120px] truncate">{name}</span>
      <button
        onClick={handleCloseClick}
        className="p-0.5 rounded hover:bg-slate-250 dark:hover:bg-white/10 shrink-0 text-slate-400 dark:text-muted-foreground/40 hover:text-slate-900 dark:hover:text-foreground transition-all ml-1 w-4 h-4 flex items-center justify-center relative"
      >
        {isDirty ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500 dark:bg-muted-foreground/50 group-hover/tab:hidden transition-all" />
            <X className="h-3 w-3 hidden group-hover/tab:block" />
          </>
        ) : (
          <X className="h-3 w-3" />
        )}
      </button>
    </div>
  );
});

TabItem.displayName = "TabItem";
