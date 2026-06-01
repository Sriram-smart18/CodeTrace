// File: src/components/ide/dialogs/CloseTabProtectionDialog.tsx
import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useIdeStore } from "../store/ideStore";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const CloseTabProtectionDialog: React.FC = () => {
  const { toast } = useToast();
  const closeTabConfirmId = useIdeStore((state) => state.closeTabConfirmId);
  const setCloseTabConfirmId = useIdeStore((state) => state.setCloseTabConfirmId);
  const forceCloseTab = useIdeStore((state) => state.forceCloseTab);
  const saveToSupabase = useIdeStore((state) => state.saveToSupabase);

  const filename = useIdeStore(
    (state) => closeTabConfirmId ? state.nodesById[closeTabConfirmId]?.name : ""
  );

  const isOpen = closeTabConfirmId !== null;

  const handleCancel = () => {
    setCloseTabConfirmId(null);
  };

  const handleDiscard = () => {
    if (closeTabConfirmId) {
      // Discard dirtiness flag for this file
      useIdeStore.setState((prev) => {
        const nextDirty = { ...prev.dirtyFiles };
        delete nextDirty[closeTabConfirmId];
        return { dirtyFiles: nextDirty };
      });
      forceCloseTab(closeTabConfirmId);
      toast({
        title: "Changes Discarded",
        description: `Closed tab for "${filename}" without saving.`,
      });
    }
  };

  const handleSave = async () => {
    if (closeTabConfirmId) {
      const targetId = closeTabConfirmId;
      
      // Set saving status to saving
      useIdeStore.setState({ savingStatus: "saving" });
      
      // Reset dirty status instantly for this file
      useIdeStore.setState((prev) => {
        const nextDirty = { ...prev.dirtyFiles };
        delete nextDirty[targetId];
        return { dirtyFiles: nextDirty };
      });

      // Force close tab instantly
      forceCloseTab(targetId);

      // Trigger cloud database sync
      toast({ title: "Saving changes...", description: `Saving and syncing "${filename}".` });
      const success = await saveToSupabase(supabase);
      if (success) {
        toast({
          title: "File Saved & Synced",
          description: `Successfully saved and synced changes for "${filename}" to cloud.`,
        });
      } else {
        toast({
          title: "Local Save Successful",
          description: `Saved "${filename}" locally. Cloud sync will retry automatically.`,
        });
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="sm:max-w-[425px] dark:bg-slate-950 bg-white border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 font-sans">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold tracking-tight uppercase font-mono text-red-500">
            Unsaved Changes
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-muted-foreground font-sans pt-2 leading-relaxed">
            Do you want to save the changes you made to <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">"{filename}"</span>?
            Your changes will be lost if you don't save them.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-0 font-mono text-xs pt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={handleCancel}
            className="text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/50"
          >
            Cancel
          </Button>
          <div className="flex gap-2 sm:ml-auto">
            <Button
              type="button"
              variant="outline"
              onClick={handleDiscard}
              className="text-xs border-slate-200 dark:border-slate-800 text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 font-bold"
            >
              Don't Save
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              className="text-xs bg-primary text-white hover:bg-primary/95 font-bold"
            >
              Save Changes
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
