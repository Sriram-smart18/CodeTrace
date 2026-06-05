// File: src/components/ide/preview/IdePreview.tsx
import React, { useMemo, useEffect, useState, useRef } from "react";
import { Eye, AlertTriangle } from "lucide-react";
import { useIdeStore } from "../store/ideStore";
import { Button } from "@/components/ui/button";

// Isolated Error Boundary to prevent preview crashes from white-screening the IDE workspace
class PreviewErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[IDE] Preview panel crashed:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full bg-[#0b0f19] flex flex-col items-center justify-center p-4 text-center select-none border-l border-white/5">
          <AlertTriangle className="h-7 w-7 text-amber-500 mb-2 animate-bounce" />
          <span className="text-xs font-bold text-amber-500/85 font-mono">Preview Sandbox Blocked</span>
          <span className="text-[10px] text-muted-foreground font-mono mt-1 max-w-[220px] break-words">
            {this.state.error?.message || "An isolated compile or runtime crash occurred."}
          </span>
          <Button
            size="sm"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-3 h-7 text-[9px] bg-amber-600 hover:bg-amber-500 text-white font-mono font-bold"
          >
            Reset Sandbox
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export const IdePreview: React.FC = () => {
  console.count('[RENDER] IdePreview');
  const addTerminalLog = useIdeStore((state) => state.addTerminalLog);
  const previewOpen = useIdeStore((state) => state.layoutState.previewOpen);

  // Subscribe only to relevant preview file primitives to prevent full-workspace rerenders
  const compiledProjectKey = useIdeStore((state) => {
    const files = Object.values(state.nodesById)
      .filter((n) => n.type === "file" && (n.name.endsWith(".html") || n.name.endsWith(".css") || n.name.endsWith(".js")))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    return files.map((f) => `${f.name}:${f.content}`).join("||");
  });

  // Re-build preview doc in-memory (READ-ONLY)
  const previewHtml = useMemo(() => {
    void compiledProjectKey;
    try {
      const nodesById = useIdeStore.getState().nodesById;
      const filesList = Object.values(nodesById).filter((n) => n.type === "file");
      const htmlFile = filesList.find((f) => f.name === "index.html");

      if (!htmlFile) {
        return `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { 
                background: #0b0f19; 
                color: #64748b; 
                font-family: monospace; 
                display: flex; 
                justify-content: center; 
                align-items: center; 
                height: 90vh; 
                text-align: center;
                font-size: 13px;
              }
            </style>
          </head>
          <body>
            <div>
              <p>No index.html file found in your workspace.</p>
              <p style="color: #475569; font-size: 10px;">Create a file named "index.html" at root to enable preview.</p>
            </div>
          </body>
          </html>
        `;
      }

      let html = htmlFile.content || "";

      // Inline CSS sheets
      filesList.forEach((file) => {
        if (file.name.endsWith(".css") && file.content) {
          const linkRegex = new RegExp(`<link[^>]*href=["']${file.name}["'][^>]*>`, "gi");
          html = html.replace(linkRegex, `<style>${file.content}</style>`);
        }
      });

      // Inline JavaScript files with custom console interceptors
      filesList.forEach((file) => {
        if (file.name.endsWith(".js") && file.content) {
          const scriptRegex = new RegExp(`<script[^>]*src=["']${file.name}["'][^>]*></script>`, "gi");
          html = html.replace(
            scriptRegex,
            `<script>
              (function() {
                try {
                  const _origLog = console.log;
                  const _origErr = console.error;
                  
                  console.log = function(...args) {
                    _origLog(...args);
                    window.parent.postMessage({ type: 'sandbox-console', level: 'info', msg: args.map(String).join(' ') }, '*');
                  };
                  
                  console.error = function(...args) {
                    _origErr(...args);
                    window.parent.postMessage({ type: 'sandbox-console', level: 'error', msg: args.map(String).join(' ') }, '*');
                  };

                  window.onerror = function(message, source, lineno, colno, error) {
                    window.parent.postMessage({ type: 'sandbox-console', level: 'error', msg: 'RUNTIME ERROR: ' + message + ' (line ' + lineno + ')' }, '*');
                    return false;
                  };

                  ${file.content}
                } catch(err) {
                  window.parent.postMessage({ type: 'sandbox-console', level: 'error', msg: 'COMPILE ERROR: ' + err.message }, '*');
                }
              })();
            </script>`
          );
        }
      });

      return html;
    } catch (e: any) {
      console.error("[IDE] preview generation error:", e);
      return `
        <!DOCTYPE html>
        <html>
        <body style="background: #0b0f19; color: #ef4444; font-family: monospace; padding: 2rem; font-size: 12px;">
          <h3>Preview Compilation Error</h3>
          <p>${e.message || e}</p>
        </body>
        </html>
      `;
    }
  }, [compiledProjectKey]);

  // Local state to hold the debounced Object URL for the iframe
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const iframeUrlRef = useRef<string | null>(null);
  const previousOutputRef = useRef<string | null>(null);

  // Debounce preview updates and manage ObjectURL memory lifecycle
  useEffect(() => {
    console.log('[EFFECT START] IdePreview: debounce timer setup');

    const timer = setTimeout(() => {
      if (previewHtml === previousOutputRef.current && iframeUrlRef.current) {
        console.log("[IDE] preview skipped duplicate");
        return;
      }

      previousOutputRef.current = previewHtml;
      console.log("[IDE] preview regenerating Blob URL");

      setIframeUrl((prevUrl) => {
        if (prevUrl) {
          URL.revokeObjectURL(prevUrl); // Total destruction of old instance
        }
        const blob = new Blob([previewHtml], { type: 'text/html' });
        const newUrl = URL.createObjectURL(blob);
        iframeUrlRef.current = newUrl;
        return newUrl;
      });
    }, 500); // 500ms debounce

    return () => {
      console.log('[EFFECT CLEANUP] IdePreview: debounce timer cleared');
      clearTimeout(timer);
    };
  }, [previewHtml]);

  // Final cleanup on unmount
  useEffect(() => {
    return () => {
      if (iframeUrlRef.current) {
        URL.revokeObjectURL(iframeUrlRef.current);
      }
    };
  }, []);

  // Intercept logs inside parent window with correct event listener cleanup (ONLY ONCE)
  useEffect(() => {
    console.log('[EFFECT START] IdePreview: message listener setup');
    const handleSandboxLog = (e: MessageEvent) => {
      if (e.data?.type === "sandbox-console") {
        const prefix = e.data.level === "error" ? "\x1b[31m[error]\x1b[0m" : "\x1b[32m[console]\x1b[0m";
        addTerminalLog(`${prefix} ${e.data.msg}`);
      }
    };

    window.addEventListener("message", handleSandboxLog);
    return () => {
      console.log('[EFFECT CLEANUP] IdePreview: message listener removed');
      window.removeEventListener("message", handleSandboxLog);
    };
  }, [addTerminalLog]);

  if (!previewOpen) return null;

  return (
    <div className="h-full w-full bg-white dark:bg-slate-950 flex flex-col overflow-hidden select-none border-l border-slate-200 dark:border-slate-800">
      {/* Header operations */}
      <div className="h-8 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-2">
          <Eye className="h-3.5 w-3.5 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-muted-foreground font-mono">Sandbox Preview</span>
        </div>
      </div>

      {/* Embedded Iframe wrapped in Error Boundary */}
      <div className="flex-1 bg-white relative">
        <PreviewErrorBoundary>
          {iframeUrl ? (
            <iframe
              key={iframeUrl} // Force total DOM remount on new Blob
              src={iframeUrl}
              className="w-full h-full border-none bg-white"
              sandbox="allow-scripts" // Strict sandbox (NO allow-same-origin to protect parent DOM)
              title="CodeTrace Preview Sandbox"
            />
          ) : (
            <div className="w-full h-full bg-white animate-pulse" />
          )}
        </PreviewErrorBoundary>
      </div>
    </div>
  );
};
