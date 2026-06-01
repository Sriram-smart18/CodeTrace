import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SubsystemErrorBoundaryProps {
  subsystemName: string;
  children: React.ReactNode;
}

interface SubsystemErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class SubsystemErrorBoundary extends React.Component<SubsystemErrorBoundaryProps, SubsystemErrorBoundaryState> {
  constructor(props: SubsystemErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[ErrorBoundary] ${this.props.subsystemName} crashed:`, error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleReset = () => {
    // A hard reset fallback
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full bg-[#0b0f19] flex flex-col items-center justify-center p-6 text-center select-none border border-white/5">
          <AlertTriangle className="h-8 w-8 text-red-500 mb-3 animate-pulse" />
          <span className="text-sm font-bold text-red-400 font-mono mb-2">
            {this.props.subsystemName} Crash Detected
          </span>
          <span className="text-[11px] text-muted-foreground font-mono mt-1 max-w-[300px] break-words">
            {this.state.error?.message || "An unexpected rendering error occurred."}
          </span>
          <div className="flex gap-2 mt-4">
            <Button
              size="sm"
              onClick={this.handleRetry}
              className="h-8 text-[10px] bg-red-900/40 hover:bg-red-800/60 text-red-200 border border-red-500/30 font-mono"
            >
              <RotateCcw className="w-3 h-3 mr-1" /> Retry Component
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={this.handleReset}
              className="h-8 text-[10px] bg-transparent hover:bg-white/5 text-muted-foreground font-mono border-white/10"
            >
              Full Reset
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
