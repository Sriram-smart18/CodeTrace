// File: src/components/ide/editor/CommandPalette.tsx
import React, { useState, useEffect, useMemo } from "react";
import { Search, FileCode, Terminal, Save, Sliders, Play, Trash2, Moon, Sun } from "lucide-react";
import { useIdeStore } from "../store/ideStore";
import { useShallow } from "zustand/react/shallow";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { getFileIcon } from "../utils/icons";
import { useTheme } from "next-themes";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode: "file" | "command";
  extraCommands?: Array<{
    name: string;
    icon: React.ReactNode;
    action: () => void;
  }>;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, defaultMode, extraCommands = [] }) => {
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();

  const openFile = useIdeStore((state) => state.openFile);
  const sidebarOpen = useIdeStore((state) => state.layoutState.sidebarOpen);
  const terminalOpen = useIdeStore((state) => state.layoutState.terminalOpen);
  const updateLayout = useIdeStore((state) => state.updateLayout);
  const setTerminalLogs = useIdeStore((state) => state.setTerminalLogs);
  const saveToSupabase = useIdeStore((state) => state.saveToSupabase);

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reset query and selection index on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const allFilesMeta = useIdeStore(
    useShallow((state) => {
      if (!state.nodesById) return [];
      return Object.values(state.nodesById)
        .filter((n) => n?.type === "file")
        .map((n) => `${n.id}::${n.name}`);
    })
  );

  const fileList = useMemo(() => {
    return allFilesMeta.map((meta) => {
      const [id, ...nameParts] = meta.split("::");
      return { id, name: nameParts.join("::"), type: "file" };
    });
  }, [allFilesMeta]);

  // Operational command options
  const commandList = useMemo(() => {
    return [
      {
        icon: <Save className="h-4 w-4 text-primary" />,
        name: "Workspace: Save and Sync to Cloud",
        action: async () => {
          const ok = await saveToSupabase(supabase);
          if (ok) toast({ title: "Workspace Synced" });
        }
      },
      {
        icon: theme === "dark" ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-indigo-500" />,
        name: `Theme: Toggle Light/Dark Mode (Current: ${theme === "dark" ? "Dark" : "Light"})`,
        action: () => setTheme(theme === "dark" ? "light" : "dark")
      },
      {
        icon: <Sliders className="h-4 w-4 text-purple-400" />,
        name: `Layout: Toggle Sidebar Panel (${sidebarOpen ? "Hide" : "Show"})`,
        action: () => updateLayout({ sidebarOpen: !sidebarOpen })
      },
      {
        icon: <Terminal className="h-4 w-4 text-green-400" />,
        name: `Layout: Toggle Terminal Drawer (${terminalOpen ? "Hide" : "Show"})`,
        action: () => updateLayout({ terminalOpen: !terminalOpen })
      },
      {
        icon: <Trash2 className="h-4 w-4 text-red-400" />,
        name: "Terminal: Clear Terminal Log Console",
        action: () => setTerminalLogs([])
      },
      ...extraCommands
    ];
  }, [sidebarOpen, terminalOpen, updateLayout, setTerminalLogs, saveToSupabase, toast, extraCommands, theme, setTheme]);

  // Filter items based on mode and query
  const filteredItems = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (defaultMode === "file") {
      if (!q) return fileList.slice(0, 8);
      return fileList.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 8);
    } else {
      if (!q) return commandList;
      return commandList.filter((c) => c.name.toLowerCase().includes(q));
    }
  }, [defaultMode, query, fileList, commandList]);

  // Handle keys inside Command Palette
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = filteredItems[selectedIndex];
      if (selected) {
        handleTriggerAction(selected);
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  const handleTriggerAction = (item: any) => {
    if (defaultMode === "file") {
      openFile(item.id);
    } else {
      item.action();
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-0 overflow-hidden shadow-2xl rounded-xl animate-fadeIn text-slate-900 dark:text-slate-100 font-sans">
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2.5">
          <Search className="h-4 w-4 text-slate-400 dark:text-muted-foreground" />
          <Input
            placeholder={defaultMode === "file" ? "Type filename to switch tabs..." : "Search matching editor commands..."}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="border-none bg-transparent placeholder:text-slate-400 dark:placeholder:text-muted-foreground/40 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 h-9 pl-0 font-mono text-slate-900 dark:text-slate-100"
            autoFocus
          />
        </div>

        {/* Results Stream */}
        <div className="max-h-[300px] overflow-y-auto p-1.5 space-y-0.5 select-none font-mono text-xs">
          {filteredItems.length === 0 ? (
            <div className="text-center py-8 text-slate-400 dark:text-muted-foreground/60 italic">
              No matching records found.
            </div>
          ) : (
            filteredItems.map((item: any, index: number) => {
              const isSelected = selectedIndex === index;
              return (
                <div
                  key={item.id || item.name}
                  onClick={() => handleTriggerAction(item)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors select-none",
                    isSelected 
                      ? "bg-primary/10 text-primary font-bold" 
                      : "text-slate-600 dark:text-muted-foreground hover:bg-slate-100 dark:hover:bg-white/[0.01] hover:text-slate-900 dark:hover:text-foreground"
                  )}
                >
                  {defaultMode === "file" ? getFileIcon(item.name) : item.icon}
                  <span className="truncate">{item.name}</span>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
