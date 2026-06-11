// File: src/components/ide/explorer/ExplorerItem.tsx
import React from "react";
import { 
  Folder, 
  FolderOpen, 
  ChevronRight, 
  ChevronDown, 
  Edit2,
  Trash2,
  FilePlus,
  FolderPlus
} from "lucide-react";
import { ProjectNode } from "../types";
import { useIdeStore } from "../store/ideStore";
import { cn } from "@/lib/utils";
import { getFileIcon } from "../utils/icons";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator
} from "@/components/ui/context-menu";

interface ExplorerItemProps {
  nodeId: string;
  depth: number;
}

const EMPTY_ARRAY: string[] = [];

export const ExplorerItem: React.FC<ExplorerItemProps> = React.memo(({ nodeId, depth }) => {
  const node = useIdeStore((state) => state.nodesById[nodeId]);
  const childrenIds = useIdeStore((state) => state.childrenByParentId[nodeId] ?? EMPTY_ARRAY);
  const activeFileId = useIdeStore((state) => state.activeFileId);
  const openFile = useIdeStore((state) => state.openFile);
  const deleteNode = useIdeStore((state) => state.deleteNode);
  const moveNode = useIdeStore((state) => state.moveNode);
  const toggleFolderExpanded = useIdeStore((state) => state.toggleFolderExpanded);

  // Zustand Dialog triggers
  const openNewFileDialog = useIdeStore((state) => state.openNewFileDialog);
  const openNewFolderDialog = useIdeStore((state) => state.openNewFolderDialog);
  const openRenameDialog = useIdeStore((state) => state.openRenameDialog);
  const isDirty = useIdeStore((state) => state.dirtyFiles[nodeId]);

  if (!node) return null;

  const handleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.type === "file") {
      openFile(node.id);
    } else {
      toggleFolderExpanded(node.id);
    }
  };

  // Drag and drop event handlers
  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.setData("text/plain", node.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (node.type === "folder") {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = e.dataTransfer.getData("text/plain");
    if (draggedId && draggedId !== node.id) {
      moveNode(draggedId, node.id);
    }
  };

  const isFolder = node.type === "folder";
  const isActive = activeFileId === node.id;
  const isExpanded = !!node.isExpanded;

  return (
    <div className="w-full select-none">
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            onClick={handleSelect}
            draggable
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={cn(
              "w-full flex items-center justify-between py-1 px-2 text-xs cursor-pointer group transition-colors select-none font-mono",
              isActive 
                ? "bg-slate-100 dark:bg-white/[0.04] text-primary border-l-2 border-primary pl-[6px]" 
                : "text-slate-600 dark:text-muted-foreground hover:bg-slate-50 dark:hover:bg-white/[0.02] hover:text-slate-900 dark:hover:text-foreground pl-[8px]"
            )}
            style={{ paddingLeft: `${depth * 10 + (isActive ? 6 : 8)}px` }}
          >
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {isFolder ? (
                <div className="flex items-center">
                  {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0 mr-0.5" /> : <ChevronRight className="h-3 w-3 shrink-0 mr-0.5" />}
                  {isExpanded ? <FolderOpen className="h-3.5 w-3.5 text-blue-400 shrink-0" /> : <Folder className="h-3.5 w-3.5 text-blue-400 shrink-0" />}
                </div>
              ) : (
                getFileIcon(node.name)
              )}

              <span className="truncate">{node.name}</span>
            </div>
            {isDirty && !isFolder && (
              <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 ml-auto mr-1 animate-pulse" />
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 font-mono text-xs shadow-md rounded-md p-1 min-w-[140px]">
          {isFolder && (
            <>
              <ContextMenuItem 
                onClick={() => openNewFileDialog(node.id)} 
                className="gap-2 cursor-pointer focus:bg-slate-100 dark:focus:bg-white/5 focus:text-slate-900 dark:focus:text-foreground text-[11px] py-1 px-2 rounded-sm"
              >
                <FilePlus className="h-3.5 w-3.5 text-slate-400" /> New File
              </ContextMenuItem>
              <ContextMenuItem 
                onClick={() => openNewFolderDialog(node.id)} 
                className="gap-2 cursor-pointer focus:bg-slate-100 dark:focus:bg-white/5 focus:text-slate-900 dark:focus:text-foreground text-[11px] py-1 px-2 rounded-sm"
              >
                <FolderPlus className="h-3.5 w-3.5 text-slate-400" /> New Folder
              </ContextMenuItem>
              <ContextMenuSeparator className="bg-slate-100 dark:bg-slate-800 my-1" />
            </>
          )}
          <ContextMenuItem 
            onClick={() => openRenameDialog(node.id)} 
            className="gap-2 cursor-pointer focus:bg-slate-100 dark:focus:bg-white/5 focus:text-slate-900 dark:focus:text-foreground text-[11px] py-1 px-2 rounded-sm"
          >
            <Edit2 className="h-3.5 w-3.5 text-slate-400" /> Rename
          </ContextMenuItem>
          <ContextMenuItem 
            onClick={() => deleteNode(node.id)} 
            className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 gap-2 cursor-pointer focus:bg-red-50 dark:focus:bg-red-500/10 text-[11px] py-1 px-2 rounded-sm"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {isFolder && isExpanded && childrenIds.length > 0 && (
        <div className="w-full">
          {childrenIds.map((childId) => (
            <ExplorerItem key={childId} nodeId={childId} depth={depth + 1} />
          ))}
        </div>
      )}
      {isFolder && isExpanded && childrenIds.length === 0 && (
        <div 
          className="text-[10px] text-slate-400 dark:text-muted-foreground/40 italic py-0.5"
          style={{ paddingLeft: `${(depth + 1) * 10 + 8}px` }}
        >
          Empty folder
        </div>
      )}
    </div>
  );
});

ExplorerItem.displayName = "ExplorerItem";
