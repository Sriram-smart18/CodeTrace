// File: src/components/ide/explorer/IdeExplorer.tsx
import React from "react";
import { 
  FilePlus, 
  FolderPlus, 
  Search, 
  Save, 
  Loader2,
} from "lucide-react";
import { useIdeStore } from "../store/ideStore";
import { useShallow } from "zustand/react/shallow";
import { ExplorerItem } from "./ExplorerItem";
import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator
} from "@/components/ui/context-menu";

const EMPTY_ARRAY: string[] = [];

export const IdeExplorer: React.FC = () => {
  const { toast } = useToast();
  const rootChildrenIds = useIdeStore((state) => state.childrenByParentId.root ?? EMPTY_ARRAY);
  const moveNode = useIdeStore((state) => state.moveNode);
  const searchQuery = useIdeStore((state) => state.searchQuery);
  const setSearchQuery = useIdeStore((state) => state.setSearchQuery);
  const saveToSupabase = useIdeStore((state) => state.saveToSupabase);
  const saving = useIdeStore((state) => state.saving);

  // Zustand Dialog triggers
  const openNewFileDialog = useIdeStore((state) => state.openNewFileDialog);
  const openNewFolderDialog = useIdeStore((state) => state.openNewFolderDialog);

  const handleSync = async () => {
    const success = await saveToSupabase(supabase);
    if (success) {
      toast({ title: "Project Synced", description: "All files and session states saved to CodeTrace cloud." });
    } else {
      toast({ title: "Sync Failed", description: "Failed to persist workspace to server. Please try again.", variant: "destructive" });
    }
  };

  // Fuzzy search flat list
  const isSearching = searchQuery.trim().length > 0;
  
  // Select only primitive representations of files to avoid triggering renders on file content changes
  const allFilesMeta = useIdeStore(
    useShallow((state) =>
      Object.values(state.nodesById)
        .filter((node) => node.type === "file")
        .map((node) => `${node.id}::${node.name}`)
    )
  );

  const searchedFiles = useMemo(() => {
    if (!isSearching) return [];
    const q = searchQuery.toLowerCase();
    return allFilesMeta
      .filter(meta => {
        const [, ...nameParts] = meta.split("::");
        return nameParts.join("::").toLowerCase().includes(q);
      })
      .map(meta => {
        const [id, ...nameParts] = meta.split("::");
        return { id, name: nameParts.join("::"), type: "file" };
      });
  }, [allFilesMeta, isSearching, searchQuery]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("text/plain");
    if (draggedId) {
      moveNode(draggedId, null); // Drop to Root!
    }
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 select-none">
      {/* Search Header */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-muted-foreground">Workspace Files</span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-slate-500 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-foreground hover:bg-slate-100 dark:hover:bg-white/5"
              onClick={() => openNewFileDialog(null)}
              title="New File..."
            >
              <FilePlus className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-slate-500 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-foreground hover:bg-slate-100 dark:hover:bg-white/5"
              onClick={() => openNewFolderDialog(null)}
              title="New Folder..."
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-primary hover:text-primary hover:bg-slate-100 dark:hover:bg-white/5"
              onClick={handleSync}
              disabled={saving}
              title="Sync to Server"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400 dark:text-muted-foreground" />
          <Input
            placeholder="Search by file name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-7 text-xs bg-slate-50 dark:bg-black/40 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-muted-foreground/50 focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-0"
          />
        </div>
      </div>

      {/* Explorer Tree List */}
      <ContextMenu>
        <ContextMenuTrigger className="flex-1 flex flex-col min-h-0">
          <div 
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className="flex-1 overflow-y-auto overflow-x-hidden p-1 space-y-0.5 select-none"
          >
            {isSearching ? (
              searchedFiles.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400 dark:text-muted-foreground italic select-none">
                  No files matched query.
                </div>
              ) : (
                searchedFiles.map((node) => (
                  <div key={node.id} className="w-full">
                    <ExplorerItem nodeId={node.id} depth={0} />
                  </div>
                ))
              )
            ) : rootChildrenIds.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-400 dark:text-muted-foreground space-y-2 select-none">
                <p>Empty workspace.</p>
                <p className="text-[10px] text-slate-400 dark:text-muted-foreground/60">Right click or use operations above to create workspace folders and source files.</p>
              </div>
            ) : (
              rootChildrenIds.map((childId) => (
                <ExplorerItem key={childId} nodeId={childId} depth={0} />
              ))
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-850 dark:text-slate-100 font-mono text-xs shadow-md rounded-md p-1 min-w-[140px]">
          <ContextMenuItem onClick={() => openNewFileDialog(null)} className="gap-2 cursor-pointer focus:bg-slate-100 dark:focus:bg-white/5 focus:text-slate-900 dark:focus:text-foreground text-[11px] py-1 px-2 rounded-sm">
            New File
          </ContextMenuItem>
          <ContextMenuItem onClick={() => openNewFolderDialog(null)} className="gap-2 cursor-pointer focus:bg-slate-100 dark:focus:bg-white/5 focus:text-slate-900 dark:focus:text-foreground text-[11px] py-1 px-2 rounded-sm">
            New Folder
          </ContextMenuItem>
          <ContextMenuSeparator className="bg-slate-100 dark:bg-slate-800 my-1" />
          <ContextMenuItem onClick={handleSync} className="gap-2 cursor-pointer focus:bg-slate-100 dark:focus:bg-white/5 focus:text-slate-900 dark:focus:text-foreground text-primary text-[11px] py-1 px-2 rounded-sm">
            Sync Workspace
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
};
