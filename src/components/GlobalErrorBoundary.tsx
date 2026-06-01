// File: src/components/GlobalErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, LogOut, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error("[GlobalErrorBoundary] Caught rendering crash:", error, errorInfo);
  }

  private handleReset = () => {
    // Clear potentially corrupted workspace local storage/IDB states
    try {
      const keys = ["activeFileId", "openTabs", "cursorPositions"];
      keys.forEach((k) => localStorage.removeItem(k));
    } catch (e) {
      console.error("Failed to clear corrupted IDE local states:", e);
    }
    // Hard reload the browser session
    window.location.reload();
  };

  private handleLogout = () => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = "/";
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-[#070a13] p-4 font-sans select-none relative overflow-hidden">
          {/* Animated decorative grid background */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:24px_24px]" />
          
          {/* Neon radial ambient blur */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full bg-primary/10 blur-[120px] pointer-events-none" />

          <div className="max-w-md w-full glass-panel border border-white/5 bg-card/60 backdrop-blur-xl rounded-2xl p-6 shadow-2xl relative z-10 space-y-6 text-center">
            {/* Warning Icon Banner */}
            <div className="mx-auto h-12 w-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-red-400" />
            </div>

            {/* Error messaging */}
            <div className="space-y-2">
              <h2 className="text-lg font-bold tracking-tight text-foreground">Workspace Session Suspended</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                CodeTrace encountered an unexpected scripting crash in the render thread. Restoring your session layout now.
              </p>
            </div>

            {/* Diagnostics details */}
            {this.state.error && (
              <div className="text-left bg-black/40 border border-white/5 rounded-xl p-3.5 space-y-2 font-mono text-[10px]">
                <div className="flex items-center gap-1.5 text-muted-foreground border-b border-white/5 pb-1.5 uppercase tracking-wider font-bold">
                  <Terminal className="h-3.5 w-3.5" /> Diagnostics Log
                </div>
                <p className="text-red-400 font-bold truncate">{this.state.error.name}: {this.state.error.message}</p>
                {this.state.errorInfo && (
                  <p className="text-muted-foreground/60 leading-normal line-clamp-3 overflow-ellipsis">
                    {this.state.errorInfo.componentStack}
                  </p>
                )}
              </div>
            )}

            {/* Recovery actions buttons */}
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button
                onClick={this.handleReset}
                className="flex-1 bg-primary hover:bg-primary/95 text-xs font-semibold gap-1.5 h-10"
              >
                <RefreshCw className="h-4 w-4" /> Restore Workspace
              </Button>
              <Button
                variant="outline"
                onClick={this.handleLogout}
                className="border-white/10 hover:bg-white/5 text-xs font-semibold text-muted-foreground hover:text-foreground gap-1.5 h-10"
              >
                <LogOut className="h-4 w-4" /> Reset Portal
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
