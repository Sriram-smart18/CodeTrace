import { Code, Play, Send, Clipboard } from "lucide-react";

interface TerminalStatsProps {
  counts: Record<string, number>;
}

const STAT_CONFIG = [
  { key: "typing", icon: Code, label: "KEYSTROKES", color: "var(--terminal-blue)" },
  { key: "run", icon: Play, label: "EXECUTIONS", color: "var(--terminal-fg)" },
  { key: "submit", icon: Send, label: "SUBMITS", color: "var(--terminal-cyan)" },
  { key: "paste", icon: Clipboard, label: "PASTES", color: "var(--terminal-yellow)" },
] as const;

export function TerminalStats({ counts }: TerminalStatsProps) {
  return (
    <div className="grid grid-cols-4 gap-px bg-[hsl(var(--terminal-border))] font-mono border-x border-[hsl(var(--terminal-border))]">
      {STAT_CONFIG.map(({ key, icon: Icon, label, color }) => (
        <div key={key} className="bg-[hsl(var(--terminal-bg))] px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon className="h-3.5 w-3.5" style={{ color: `hsl(${color})` }} />
            <span className="text-[10px] tracking-wider" style={{ color: `hsl(${color})` }}>
              {label}
            </span>
          </div>
          <p className="text-xl font-bold mt-1 text-[hsl(var(--terminal-fg))]">
            {counts[key] || 0}
          </p>
          <p className="text-[9px] text-[hsl(var(--terminal-muted))]">last 5m</p>
        </div>
      ))}
    </div>
  );
}
