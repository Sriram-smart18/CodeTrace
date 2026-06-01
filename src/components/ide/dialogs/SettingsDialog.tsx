// File: src/components/ide/dialogs/SettingsDialog.tsx
import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIdeStore } from "../store/ideStore";
import { Label } from "@/components/ui/label";

export const SettingsDialog: React.FC = () => {
  const activeDialog = useIdeStore((state) => state.activeDialog);
  const settings = useIdeStore((state) => state.settings);
  const updateSettings = useIdeStore((state) => state.updateSettings);

  const isOpen = activeDialog === "settings";

  const handleClose = () => {
    useIdeStore.setState({ activeDialog: null });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[480px] dark:bg-slate-950 bg-white border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 font-sans">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold tracking-tight uppercase font-mono text-primary">
            Editor Settings
          </DialogTitle>
          <DialogDescription className="text-[11px] text-slate-500 dark:text-muted-foreground/85">
            Configure preference options for the Monaco code editor. Settings are preserved locally.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 font-mono text-xs max-h-[380px] overflow-y-auto pr-1">
          {/* Font Size Row */}
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/40 pb-3">
            <div className="space-y-0.5">
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-350">Font Size (px)</Label>
              <p className="text-[10px] text-slate-400 dark:text-muted-foreground/60">Change the editor's text size scale.</p>
            </div>
            <Input
              type="number"
              min={10}
              max={32}
              value={settings.fontSize}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 12;
                updateSettings({ fontSize: Math.max(10, Math.min(32, val)) });
              }}
              className="w-20 h-8 text-xs text-center bg-slate-50 dark:bg-black/40 border-slate-200 dark:border-slate-850"
            />
          </div>

          {/* Tab Size Row */}
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/40 pb-3">
            <div className="space-y-0.5">
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-350">Tab Spacing Size</Label>
              <p className="text-[10px] text-slate-400 dark:text-muted-foreground/60">Number of space columns for tab indentation.</p>
            </div>
            <Select
              value={String(settings.tabSize)}
              onValueChange={(val) => updateSettings({ tabSize: parseInt(val) })}
            >
              <SelectTrigger className="w-20 h-8 text-xs bg-slate-50 dark:bg-black/40 border-slate-200 dark:border-slate-850">
                <SelectValue placeholder="Size" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-slate-900 border-slate-250 dark:border-slate-800 font-mono text-xs">
                <SelectItem value="2">2 Spaces</SelectItem>
                <SelectItem value="4">4 Spaces</SelectItem>
                <SelectItem value="8">8 Spaces</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Word Wrap Row */}
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/40 pb-3">
            <div className="space-y-0.5">
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-350">Word Wrap</Label>
              <p className="text-[10px] text-slate-400 dark:text-muted-foreground/60">Wrap lines exceeding viewport viewport bounds.</p>
            </div>
            <Switch
              checked={settings.wordWrap === "on"}
              onCheckedChange={(checked) => updateSettings({ wordWrap: checked ? "on" : "off" })}
            />
          </div>

          {/* Minimap Row */}
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/40 pb-3">
            <div className="space-y-0.5">
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-350">Minimap Overlay</Label>
              <p className="text-[10px] text-slate-400 dark:text-muted-foreground/60">Show a outline code preview bar on the right.</p>
            </div>
            <Switch
              checked={settings.minimap}
              onCheckedChange={(checked) => updateSettings({ minimap: checked })}
            />
          </div>

          {/* Line Numbers Row */}
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/40 pb-3">
            <div className="space-y-0.5">
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-350">Line Numbers</Label>
              <p className="text-[10px] text-slate-400 dark:text-muted-foreground/60">Display line coordinates on the left margin gutter.</p>
            </div>
            <Switch
              checked={settings.lineNumbers === "on"}
              onCheckedChange={(checked) => updateSettings({ lineNumbers: checked ? "on" : "off" })}
            />
          </div>

          {/* Format On Paste Row */}
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/40 pb-3">
            <div className="space-y-0.5">
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-350">Format On Paste</Label>
              <p className="text-[10px] text-slate-400 dark:text-muted-foreground/60">Automatically format copied snippets on insertion.</p>
            </div>
            <Switch
              checked={settings.formatOnPaste}
              onCheckedChange={(checked) => updateSettings({ formatOnPaste: checked })}
            />
          </div>

          {/* Format On Type Row */}
          <div className="flex items-center justify-between pb-1">
            <div className="space-y-0.5">
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-350">Format On Type</Label>
              <p className="text-[10px] text-slate-400 dark:text-muted-foreground/60">Trigger quick auto-formatting as you type code.</p>
            </div>
            <Switch
              checked={settings.formatOnType}
              onCheckedChange={(checked) => updateSettings({ formatOnType: checked })}
            />
          </div>
        </div>

        <DialogFooter className="font-mono text-xs">
          <Button
            type="button"
            onClick={handleClose}
            className="text-xs bg-primary text-white hover:bg-primary/95 w-full sm:w-auto"
          >
            Close Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
