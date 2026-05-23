import { Badge } from "@/components/ui/badge";
import { Activity, Radio } from "lucide-react";

interface TerminalHeaderProps {
  connected: boolean;
  activeCount: number;
  totalEvents: number;
}

export function TerminalHeader({ connected, activeCount, totalEvents }: TerminalHeaderProps) {
  return (
    <div className="font-mono rounded-t-lg border border-[hsl(var(--terminal-border))] bg-[hsl(var(--terminal-bg))] px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Window dots */}
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-[hsl(var(--terminal-red))]" />
            <div className="h-3 w-3 rounded-full bg-[hsl(var(--terminal-yellow))]" />
            <div className="h-3 w-3 rounded-full bg-[hsl(var(--terminal-fg))]" />
          </div>
          <span className="text-sm text-[hsl(var(--terminal-fg))] flex items-center gap-2">
            <Activity className="h-4 w-4" />
            activity-monitor
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <Badge
            variant={connected ? "default" : "destructive"}
            className="flex items-center gap-1.5 font-mono text-[10px]"
          >
            <Radio className={`h-3 w-3 ${connected ? "animate-pulse" : ""}`} />
            {connected ? "LIVE" : "OFFLINE"}
          </Badge>
          <span className="text-[hsl(var(--terminal-muted))]">
            {activeCount} active · {totalEvents} events
          </span>
        </div>
      </div>
    </div>
  );
}
