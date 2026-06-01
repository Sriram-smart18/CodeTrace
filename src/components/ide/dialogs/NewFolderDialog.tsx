// File: src/components/ide/dialogs/NewFolderDialog.tsx
import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useIdeStore } from "../store/ideStore";
import { validateFileName } from "../utils/validation";
import { useToast } from "@/hooks/use-toast";

export const NewFolderDialog: React.FC = () => {
  const { toast } = useToast();
  const activeDialog = useIdeStore((state) => state.activeDialog);
  const dialogTargetNodeId = useIdeStore((state) => state.dialogTargetNodeId);
  const closeDialog = useIdeStore((state) => state.closeDialog);
  const createFolder = useIdeStore((state) => state.createFolder);

  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isOpen = activeDialog === "newFolder";

  // Reset inputs when opened
  useEffect(() => {
    if (isOpen) {
      setName("");
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const trimmed = name.trim();
    const validationError = validateFileName(trimmed);
    if (validationError) {
      setError(validationError);
      return;
    }

    createFolder(trimmed, dialogTargetNodeId);
    toast({
      title: "Folder Created",
      description: `Successfully created folder "${trimmed}".`,
    });
    closeDialog();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent className="sm:max-w-[425px] dark:bg-slate-950 bg-white border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 font-sans">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold tracking-tight uppercase font-mono">Create New Folder</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null); // clear error on type
              }}
              placeholder="Folder name"
              className="col-span-3 text-xs bg-slate-50 dark:bg-black/40 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-0 font-mono"
              autoFocus
            />
            {error && (
              <p className="text-[10px] text-red-500 font-mono font-medium leading-none mt-1">
                {error}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0 font-mono text-xs">
            <Button
              type="button"
              variant="ghost"
              onClick={closeDialog}
              className="text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/50"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="text-xs bg-primary text-white hover:bg-primary/95"
            >
              Create Folder
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
