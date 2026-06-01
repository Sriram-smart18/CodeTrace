// File: src/components/ide/hooks/useIdeShortcuts.ts
import { useEffect } from "react";
import { useIdeStore } from "../store/ideStore";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ShortcutsProps {
  onOpenPalette: (mode: "file" | "command") => void;
}

export const useIdeShortcuts = ({ onOpenPalette }: ShortcutsProps) => {
  const { toast } = useToast();
  const saveToSupabase = useIdeStore((state) => state.saveToSupabase);
  const sidebarOpen = useIdeStore((state) => state.layoutState.sidebarOpen);
  const updateLayout = useIdeStore((state) => state.updateLayout);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Detect command palette: Ctrl+P or Ctrl+Shift+P
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        if (e.shiftKey) {
          onOpenPalette("command");
        } else {
          onOpenPalette("file");
        }
        return;
      }

      // 2. Detect sidebar toggle: Ctrl+B
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        updateLayout({ sidebarOpen: !sidebarOpen });
        return;
      }

      // 3. Detect manually sync workspace save: Ctrl+S
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        toast({ title: "Syncing...", description: "Syncing workspace to cloud database." });
        saveToSupabase(supabase).then((ok) => {
          if (ok) {
            toast({ title: "Workspace Saved", description: "Successfully synced with Supabase cloud." });
          } else {
            toast({ title: "Save Failed", description: "Could not sync edits. Cached locally.", variant: "destructive" });
          }
        });
        return;
      }

      // 4. Detect Global Search: Ctrl+Shift+F
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        updateLayout({ sidebarOpen: true, activeSidebarTab: "search" });
        return;
      }

      // 5. Focus Terminal: Ctrl+` (backtick)
      if ((e.ctrlKey || e.metaKey) && e.key === "`") {
        e.preventDefault();
        updateLayout({ terminalOpen: true });
        window.dispatchEvent(new CustomEvent("focus-terminal"));
        return;
      }
    };
 
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sidebarOpen, updateLayout, saveToSupabase, onOpenPalette, toast]);
};
