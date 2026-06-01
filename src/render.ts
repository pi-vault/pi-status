import { homedir } from "node:os";
import { truncateToWidth } from "@earendil-works/pi-tui";

export type ThemeLike = {
  fg: (color: string, text: string) => string;
};

export type ModelLike = {
  id?: string;
  name?: string;
  reasoning?: boolean;
};

export type StatusLineSegmentId =
  | "model"
  | "model-with-reasoning"
  | "current-dir"
  | "git-branch"
  | "run-state"
  | "context-remaining"
  | "context-used"
  | "context-window-size"
  | "used-tokens"
  | "total-input-tokens"
  | "total-output-tokens"
  | "session-id";

export type RunState = "busy" | "queued" | "idle";

export type FooterRenderInput = {
  model?: ModelLike;
  cwd: string;
  thinkingLevel: string;
  gitBranch?: string | null;
  runState: RunState;
  contextUsage?: { tokens?: number | null; contextWindow?: number; percent?: number | null };
  branchTotals?: { input: number; output: number; totalTokens: number };
  sessionId?: string;
  segments: StatusLineSegmentId[];
};

export const DEFAULT_SEGMENTS: StatusLineSegmentId[] = ["model-with-reasoning", "current-dir"];

export function normalizeThinkingLevel(level: string): string {
  switch (level) {
    case "minimal":
      return "min";
    case "medium":
      return "med";
    default:
      return level;
  }
}

export function formatCompactNumber(value: number): string {
  if (value < 1000) return String(Math.trunc(value));
  const unit = value >= 1_000_000 ? "M" : "k";
  const divisor = unit === "M" ? 1_000_000 : 1_000;
  const short = (value / divisor).toFixed(1).replace(/\.0$/, "");
  return `${short}${unit}`;
}

export function formatModelWithReasoning(
  model: ModelLike | undefined,
  thinkingLevel: string,
): string | null {
  const base = model?.name ?? model?.id;
  if (!base) return null;
  if (!model?.reasoning) return base;
  return `${base} [${normalizeThinkingLevel(thinkingLevel)}]`;
}

export function abbreviateHomeDir(cwd: string, home = homedir()): string {
  if (!home) return cwd;
  if (cwd === home) return "~";
  if (cwd.startsWith(`${home}/`)) return `~${cwd.slice(home.length)}`;
  return cwd;
}

function contextColor(percent: number | null | undefined): "success" | "warning" | "error" | "dim" {
  if (percent === undefined || percent === null) return "dim";
  if (percent < 70) return "success";
  if (percent < 90) return "warning";
  return "error";
}

function formatSegment(id: StatusLineSegmentId, input: FooterRenderInput): [text: string, color: string] | null {
  switch (id) {
    case "model": {
      const value = input.model?.name ?? input.model?.id;
      return value ? [value, "accent"] : null;
    }
    case "model-with-reasoning": {
      const value = formatModelWithReasoning(input.model, input.thinkingLevel);
      return value ? [value, "accent"] : null;
    }
    case "current-dir": {
      const value = abbreviateHomeDir(input.cwd);
      return value ? [value, "success"] : null;
    }
    case "git-branch":
      return input.gitBranch ? [input.gitBranch, "warning"] : null;
    case "run-state":
      return [input.runState, input.runState === "idle" ? "dim" : "accent"];
    case "context-used": {
      const percent = input.contextUsage?.percent;
      return percent === undefined || percent === null
        ? null
        : [`${Math.round(percent)}% ctx`, contextColor(percent)];
    }
    case "context-remaining": {
      const total = input.contextUsage?.tokens;
      const window = input.contextUsage?.contextWindow;
      const percent = input.contextUsage?.percent;
      if (total === undefined || total === null || window === undefined || percent === undefined || percent === null) {
        return null;
      }
      const remaining = Math.max(0, window - total);
      return [`${formatCompactNumber(remaining)} left`, contextColor(percent)];
    }
    case "context-window-size": {
      const value = input.contextUsage?.contextWindow;
      return value === undefined ? null : [`${formatCompactNumber(value)} ctx`, "dim"];
    }
    case "used-tokens": {
      const value = input.branchTotals?.totalTokens;
      return value === undefined ? null : [`${formatCompactNumber(value)} tok`, "dim"];
    }
    case "total-input-tokens": {
      const value = input.branchTotals?.input;
      return value === undefined ? null : [`↑${formatCompactNumber(value)}`, "dim"];
    }
    case "total-output-tokens": {
      const value = input.branchTotals?.output;
      return value === undefined ? null : [`↓${formatCompactNumber(value)}`, "dim"];
    }
    case "session-id":
      return input.sessionId ? [`sid ${input.sessionId.slice(0, 8)}`, "dim"] : null;
    default:
      return null;
  }
}

export function buildFooterLine(input: FooterRenderInput, theme: ThemeLike, width: number): string {
  const parts = input.segments
    .map((id) => formatSegment(id, input))
    .filter((x): x is [string, string] => x !== null)
    .map(([text, color]) => theme.fg(color, text));

  const line = parts.join(theme.fg("dim", " · "));
  return truncateToWidth(line, width);
}
