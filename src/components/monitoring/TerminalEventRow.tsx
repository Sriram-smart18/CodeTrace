import { Code, Play, Send, Clipboard, Eye, EyeOff } from "lucide-react";

interface TerminalEventRowProps {
  eventType: string;
  studentName: string;
  assignmentTitle?: string;
  language?: string | null;
  codeSnapshot?: string | null;
  timestamp: string;
}

const EVENT_ICONS: Record<string, typeof Code> = {
  typing: Code,
  run: Play,
  submit: Send,
  paste: Clipboard,
  focus: Eye,
  blur: EyeOff,
};

const EVENT_COLORS: Record<string, string> = {
  typing: "var(--terminal-blue)",
  run: "var(--terminal-fg)",
  submit: "var(--terminal-cyan)",
  paste: "var(--terminal-yellow)",
  focus: "var(--terminal-fg)",
  blur: "var(--terminal-muted)",
};

export function TerminalEventRow({
  eventType,
  studentName,
  assignmentTitle,
  language,
  codeSnapshot,
  timestamp,
}: TerminalEventRowProps) {
  const Icon = EVENT_ICONS[eventType] || Code;
  const color = EVENT_COLORS[eventType] || EVENT_COLORS.typing;
  const time = new Date(timestamp).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const showSnapshot = codeSnapshot && (eventType === "submit" || eventType === "paste");

  return (
    <div className="group px-4 py-1.5 hover:bg-[hsl(var(--terminal-highlight))] transition-colors font-mono text-xs leading-relaxed">
      <div className="flex items-start gap-2">
        {/* Timestamp */}
        <span className="text-[hsl(var(--terminal-muted))] shrink-0 select-none">{time}</span>

        {/* Prompt char */}
        <span style={{ color: `hsl(${color})` }} className="shrink-0 select-none">❯</span>

        {/* Icon */}
        <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: `hsl(${color})` }} />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <span className="text-[hsl(var(--terminal-fg))]">{studentName}</span>
          <span className="text-[hsl(var(--terminal-muted))]"> · </span>
          <span style={{ color: `hsl(${color})` }} className="font-semibold uppercase">
            {eventType}
          </span>
          {assignmentTitle && (
            <>
              <span className="text-[hsl(var(--terminal-muted))]"> on </span>
              <span className="text-[hsl(var(--terminal-cyan))]">"{assignmentTitle}"</span>
            </>
          )}
          {language && (
            <span className="text-[hsl(var(--terminal-magenta))] ml-1.5">[{language}]</span>
          )}
        </div>
      </div>

      {showSnapshot && (
        <div className="ml-[7.5rem] mt-1 mb-1">
          <pre className="text-[10px] text-[hsl(var(--terminal-muted))] bg-[hsl(var(--terminal-highlight))] rounded px-2 py-1 max-h-16 overflow-hidden whitespace-pre-wrap break-all border border-[hsl(var(--terminal-border))]">
            {codeSnapshot.slice(0, 200)}
            {codeSnapshot.length > 200 ? "…" : ""}
          </pre>
        </div>
      )}
    </div>
  );
}
