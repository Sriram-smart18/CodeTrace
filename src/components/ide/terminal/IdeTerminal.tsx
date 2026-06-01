// File: src/components/ide/terminal/IdeTerminal.tsx
import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import "xterm/css/xterm.css";
import { Terminal as TerminalIcon, Trash2, Copy, ChevronsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import { useToast } from "@/hooks/use-toast";
import { useIdeStore } from "../store/ideStore";
import { cn } from "@/lib/utils";

export interface IdeTerminalRef {
  write: (data: string) => void;
  clear: () => void;
  focus: () => void;
}

export interface IdeTerminalProps {
  onInput?: (data: string) => void;
}

export const IdeTerminal = forwardRef<IdeTerminalRef, IdeTerminalProps>(({ onInput }, ref) => {
  const { toast } = useToast();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lineBufferRef = useRef<string>("");

  const [autoScroll, setAutoScroll] = useState(true);

  const { theme } = useTheme();
  const resolvedTheme = theme === "system" ? (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme;

  useImperativeHandle(ref, () => ({
    write: (data: string) => {
      if (xtermRef.current) {
        xtermRef.current.write(data);
        if (autoScroll) {
          setTimeout(() => {
            xtermRef.current?.scrollToBottom();
          }, 20);
        }
      }
    },
    clear: () => {
      if (xtermRef.current) {
        xtermRef.current.clear();
      }
    },
    focus: () => {
      if (xtermRef.current) {
        xtermRef.current.focus();
      }
    }
  }));

  // Re-sync theme options when theme changes
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = resolvedTheme === "light" ? {
        background: "#ffffff",
        foreground: "#0f172a",
        cursor: "#2563eb",
        selectionBackground: "rgba(37, 99, 235, 0.3)"
      } : {
        background: "#020617",
        foreground: "#e2e8f0",
        cursor: "#3b82f6",
        selectionBackground: "rgba(59, 130, 246, 0.3)"
      };
    }
  }, [resolvedTheme]);

  // Focus Terminal from key shortcut global event
  useEffect(() => {
    const handleGlobalFocus = () => {
      setTimeout(() => {
        xtermRef.current?.focus();
      }, 50);
    };
    window.addEventListener("focus-terminal", handleGlobalFocus);
    return () => window.removeEventListener("focus-terminal", handleGlobalFocus);
  }, []);

  // Initialize xterm instance
  useEffect(() => {
    if (!terminalRef.current) return;

    const initialTheme = resolvedTheme === "light" ? {
      background: "#ffffff",
      foreground: "#0f172a",
      cursor: "#2563eb",
      selectionBackground: "rgba(37, 99, 235, 0.3)"
    } : {
      background: "#020617",
      foreground: "#e2e8f0",
      cursor: "#3b82f6",
      selectionBackground: "rgba(59, 130, 246, 0.3)"
    };

    const term = new XTerm({
      theme: initialTheme,
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 13,
      cursorBlink: true,
      convertEol: true
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    
    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Output initial welcome messages
    term.clear();
    term.write("\x1b[34m[system] Welcome to CodeTrace Cloud Terminal.\x1b[0m\r\n");
    term.write("\x1b[34m[system] Sandbox virtual engine ready.\x1b[0m\r\n");

    setTimeout(() => {
      try {
        fitAddon.fit();
      } catch (e) {}
    }, 150);

    const handleResize = () => {
      try {
        fitAddon.fit();
      } catch (e) {}
    };

    window.addEventListener("resize", handleResize);

    term.onData((data) => {
      if (data.startsWith("\u001b[")) {
        return; // Block navigation keys from stdin
      }

      if (data === "\r") {
        if (onInput) {
          onInput(lineBufferRef.current + "\n");
        }
        term.write("\r\n");
        lineBufferRef.current = "";
        return;
      }

      if (data === "\u007f" || data === "\b") {
        if (lineBufferRef.current.length > 0) {
          lineBufferRef.current = lineBufferRef.current.slice(0, -1);
          term.write("\b \b");
        }
        return;
      }

      lineBufferRef.current += data;
      term.write(data);
    });

    return () => {
      window.removeEventListener("resize", handleResize);
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [onInput]);

  const handleClear = () => {
    if (xtermRef.current) {
      xtermRef.current.clear();
      xtermRef.current.write("\x1b[33m[system] Terminal logs cleared.\x1b[0m\r\n");
    }
  };

  const handleCopy = () => {
    if (xtermRef.current) {
      xtermRef.current.selectAll();
      const selection = xtermRef.current.getSelection();
      xtermRef.current.clearSelection();
      if (selection) {
        navigator.clipboard.writeText(selection);
        toast({ title: "Copied Output", description: "Successfully copied terminal outputs to clipboard." });
      } else {
        toast({ title: "Copy Failed", description: "Terminal buffer is currently empty.", variant: "destructive" });
      }
    }
  };

  return (
    <div className="h-full w-full bg-white dark:bg-slate-950 flex flex-col overflow-hidden select-text border-t border-slate-200 dark:border-slate-800">
      {/* Terminal Header */}
      <div className="h-8 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-2">
          <TerminalIcon className="h-3.5 w-3.5 text-slate-500 dark:text-muted-foreground" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-muted-foreground font-mono">Terminal Outputs</span>
        </div>
        <div className="flex gap-1 shrink-0 items-center">
          {/* Auto Scroll Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-6 w-6 transition-all rounded hover:bg-slate-200 dark:hover:bg-white/5",
              autoScroll ? "text-primary bg-primary/5" : "text-slate-400 dark:text-muted-foreground"
            )}
            onClick={() => setAutoScroll(!autoScroll)}
            title={autoScroll ? "Auto-Scroll: Locked" : "Auto-Scroll: Unlocked"}
          >
            <ChevronsDown className={cn("h-3.5 w-3.5", autoScroll && "animate-bounce")} />
          </Button>

          {/* Copy Logs */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-slate-500 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-foreground hover:bg-slate-200 dark:hover:bg-white/5 rounded"
            onClick={handleCopy}
            title="Copy entire log output"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>

          {/* Clear Logs */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-slate-500 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-foreground hover:bg-slate-200 dark:hover:bg-white/5 rounded"
            onClick={handleClear}
            title="Clear terminal log"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Xterm container */}
      <div className="flex-1 p-2 bg-white dark:bg-slate-950 overflow-hidden min-h-0 relative">
        <div ref={terminalRef} className="w-full h-full" />
      </div>
    </div>
  );
});

IdeTerminal.displayName = "IdeTerminal";
