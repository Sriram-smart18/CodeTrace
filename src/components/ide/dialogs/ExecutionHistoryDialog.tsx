// File: src/components/ide/dialogs/ExecutionHistoryDialog.tsx
import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Play, Calendar, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { useIdeStore } from "../store/ideStore";
import { cn } from "@/lib/utils";

export const ExecutionHistoryDialog: React.FC = () => {
  const activeDialog = useIdeStore((state) => state.activeDialog);
  const runHistory = useIdeStore((state) => state.runHistory);

  const isOpen = activeDialog === "history";

  const handleClose = () => {
    useIdeStore.setState({ activeDialog: null });
  };

  const handleRerun = (fileId: string) => {
    handleClose();
    // Dispatch a global rerun request event
    window.dispatchEvent(
      new CustomEvent("run-code-file", {
        detail: { fileId }
      })
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[500px] dark:bg-slate-950 bg-white border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 font-sans">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold tracking-tight uppercase font-mono text-primary flex items-center gap-2">
            <Clock className="h-4 w-4" /> Execution History
          </DialogTitle>
          <DialogDescription className="text-[11px] text-slate-500 dark:text-muted-foreground/80">
            Review the list of your last 20 execution runs. Click Rerun to quickly execute a file node.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 max-h-[320px] overflow-y-auto pr-1 space-y-2 select-none font-mono text-xs scrollbar-thin">
          {runHistory.length === 0 ? (
            <div className="text-center py-12 text-slate-400 dark:text-muted-foreground/45 italic">
              No recent executions found in history.
            </div>
          ) : (
            runHistory.map((run) => {
              const isSuccess = run.status === "completed";
              return (
                <div
                  key={run.id}
                  className="flex items-center justify-between p-2 rounded-lg border border-slate-100 dark:border-slate-900 bg-slate-50/50 dark:bg-slate-900/30 hover:border-slate-200 dark:hover:border-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {isSuccess ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                    )}
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-semibold truncate text-xs">
                        <span className="truncate">{run.fileName}</span>
                        <span className="text-[9px] bg-slate-100 dark:bg-slate-800/80 px-1 py-0.2 rounded text-slate-500 uppercase shrink-0">
                          {run.language}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-slate-400 dark:text-muted-foreground/60 leading-none">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3 shrink-0" /> {run.timestamp}
                        </span>
                        <span className="font-semibold text-slate-500 dark:text-muted-foreground/80">
                          {run.durationMs}ms
                        </span>
                      </div>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRerun(run.fileId)}
                    className="h-7 px-2 flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-500/10 font-bold shrink-0"
                    title="Rerun file"
                  >
                    <Play className="h-3 w-3 fill-current" /> RERUN
                  </Button>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="font-mono text-xs">
          <Button
            type="button"
            onClick={handleClose}
            className="text-xs bg-slate-100 hover:bg-slate-250 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-350 w-full sm:w-auto"
          >
            Close History
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
