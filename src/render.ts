import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
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
  | "project-root"
  | "current-dir"
  | "git-branch"
  | "run-state"
  | "context-remaining"
  | "context-used"
  | "context-window-size"
  | "used-tokens"
  | "total-input-tokens"
  | "total-output-tokens"
  | "session-id"
  | "five-hour-limit"
  | "weekly-limit"
  | "extension-statuses";

export type RunState = "busy" | "queued" | "idle";

export type StatusFilter =
  | { mode: "all"; hidden: string[] }
  | { mode: "only"; shown: string[] };

export type FooterRenderInput = {
  model?: ModelLike;
  cwd: string;
  thinkingLevel: string;
  gitBranch?: string | null;
  runState: RunState;
  contextUsage?: {
    tokens?: number | null;
    contextWindow?: number;
    percent?: number | null;
  };
  branchTotals?: { input: number; output: number; totalTokens: number };
  sessionId?: string;
  usageState?: {
    compatibility?: {
      currentLiveProviderSnapshot?: {
        providerId?: string;
        windows: Array<{
          key?: string;
          label?: string;
          usedPercent?: number;
          unavailableReason?: string | null;
        }>;
      } | null;
    };
  };
  extensionStatuses?: ReadonlyMap<string, string>;
  filter: StatusFilter;
  segments: StatusLineSegmentId[];
};

export const DEFAULT_SEGMENTS: StatusLineSegmentId[] = [
  "model-with-reasoning",
  "current-dir",
];

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

export function findProjectRootLabel(cwd: string): string | null {
  let current = cwd;
  while (true) {
    if (
      existsSync(join(current, ".git")) ||
      existsSync(join(current, ".pi/settings.json"))
    ) {
      const base = basename(current);
      return base || current;
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function contextColor(
  percent: number | null | undefined,
): "success" | "warning" | "error" | "dim" {
  if (percent === undefined || percent === null) return "dim";
  if (percent < 70) return "success";
  if (percent < 90) return "warning";
  return "error";
}

function getRateWindow(
  input: FooterRenderInput,
  key: "fiveHour" | "weekly",
): { usedPercent: number } | null {
  const snapshot = input.usageState?.compatibility?.currentLiveProviderSnapshot;
  if (snapshot?.providerId !== "openai-codex") return null;
  const window = snapshot.windows.find((item) => item.key === key);
  if (
    !window ||
    typeof window.usedPercent !== "number" ||
    window.unavailableReason
  )
    return null;
  return { usedPercent: window.usedPercent };
}

function rateColor(usedPercent: number): "success" | "warning" | "error" {
  if (usedPercent < 70) return "success";
  if (usedPercent < 90) return "warning";
  return "error";
}

const ANSI_PREFIX = `${String.fromCharCode(27)}[`;

function hasAnsi(value: string): boolean {
  return value.includes(ANSI_PREFIX);
}

function normalizeFilterList(input: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function formatExtensionStatuses(
  input: FooterRenderInput,
  theme: ThemeLike,
): string | null {
  const entries = [...(input.extensionStatuses?.entries() ?? [])].sort(
    ([a], [b]) => a.localeCompare(b),
  );
  if (entries.length === 0) return null;

  const filter = input.filter;
  const blocked =
    filter.mode === "all"
      ? new Set(normalizeFilterList(filter.hidden))
      : undefined;
  const allowed =
    filter.mode === "only"
      ? new Set(normalizeFilterList(filter.shown))
      : undefined;
  const visible =
    filter.mode === "all"
      ? entries.filter(([key]) => !blocked?.has(key))
      : entries.filter(([key]) => allowed?.has(key));

  const parts = visible.slice(0, 5).map(([key, value]) => {
    const trimmed = hasAnsi(value)
      ? value
      : value.replace(
          new RegExp(
            `^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s*[:=-]\\s*|\\s+)`,
            "i",
          ),
          "",
        );
    return truncateToWidth(trimmed, 18, "...");
  });

  if (parts.length === 0) return null;
  return parts.join(theme.fg("dim", " | "));
}

function formatSegment(
  id: StatusLineSegmentId,
  input: FooterRenderInput,
  theme: ThemeLike,
): [text: string, color: string | null] | null {
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
    case "project-root": {
      const value = findProjectRootLabel(input.cwd);
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
      if (
        total === undefined ||
        total === null ||
        window === undefined ||
        percent === undefined ||
        percent === null
      ) {
        return null;
      }
      const remaining = Math.max(0, window - total);
      return [`${formatCompactNumber(remaining)} left`, contextColor(percent)];
    }
    case "context-window-size": {
      const value = input.contextUsage?.contextWindow;
      return value === undefined
        ? null
        : [`${formatCompactNumber(value)} ctx`, "dim"];
    }
    case "used-tokens": {
      const value = input.branchTotals?.totalTokens;
      return value === undefined
        ? null
        : [`${formatCompactNumber(value)} tok`, "dim"];
    }
    case "total-input-tokens": {
      const value = input.branchTotals?.input;
      return value === undefined
        ? null
        : [`↑${formatCompactNumber(value)}`, "dim"];
    }
    case "total-output-tokens": {
      const value = input.branchTotals?.output;
      return value === undefined
        ? null
        : [`↓${formatCompactNumber(value)}`, "dim"];
    }
    case "session-id":
      return input.sessionId
        ? [`sid ${input.sessionId.slice(0, 8)}`, "dim"]
        : null;
    case "five-hour-limit": {
      const window = getRateWindow(input, "fiveHour");
      if (!window) return null;
      const remaining = Math.min(
        100,
        Math.max(0, 100 - Math.round(window.usedPercent)),
      );
      return [`5h ${remaining}% left`, rateColor(window.usedPercent)];
    }
    case "weekly-limit": {
      const window = getRateWindow(input, "weekly");
      if (!window) return null;
      const remaining = Math.min(
        100,
        Math.max(0, 100 - Math.round(window.usedPercent)),
      );
      return [`wk ${remaining}% left`, rateColor(window.usedPercent)];
    }
    case "extension-statuses": {
      const value = formatExtensionStatuses(input, theme);
      return value ? [value, null] : null;
    }
    default:
      return null;
  }
}

export function buildFooterLine(
  input: FooterRenderInput,
  theme: ThemeLike,
  width: number,
): string {
  const parts = input.segments
    .map((id) => formatSegment(id, input, theme))
    .filter((x): x is [string, string | null] => x !== null)
    .map(([text, color]) => (color ? theme.fg(color, text) : text));

  const line = parts.join(theme.fg("dim", " · "));
  return truncateToWidth(line, width);
}
