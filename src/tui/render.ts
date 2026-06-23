import { truncateToWidth } from "@earendil-works/pi-tui";
import {
  abbreviateHomeDir,
  findProjectRootLabel,
  formatCompactNumber,
  normalizeThinkingLevel,
  thinkingLevelColor,
} from "./render-utils.ts";
import {
  DEFAULT_SEGMENTS,
  type ExtensionSegments,
  type StatusLineSegmentId,
} from "../shared/types.ts";

export type FooterRenderColor =
  | "accent"
  | "dim"
  | "success"
  | "warning"
  | "error"
  | "thinkingOff"
  | "thinkingMinimal"
  | "thinkingLow"
  | "thinkingMedium"
  | "thinkingHigh";

export type ThemeLike = {
  fg: (color: FooterRenderColor, text: string) => string;
  rainbow: (text: string) => string;
};

export type ModelLike = {
  id?: string;
  name?: string;
  reasoning?: boolean;
};

export type RunState = "busy" | "queued" | "idle";

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
  extensionSegments: ExtensionSegments;
  segments: StatusLineSegmentId[];
};

export { DEFAULT_SEGMENTS };

export {
  abbreviateHomeDir,
  findProjectRootLabel,
  formatCompactNumber,
  normalizeThinkingLevel,
} from "./render-utils.ts";

export function formatModelWithReasoning(
  model: ModelLike | undefined,
  thinkingLevel: string,
  theme: ThemeLike,
): [text: string, color: FooterRenderColor | null] | null {
  const base = model?.name ?? model?.id;
  if (!base) return null;
  if (!model?.reasoning) return [base, "accent"];
  const abbrev = normalizeThinkingLevel(thinkingLevel);
  if (thinkingLevel === "xhigh") {
    return [`${theme.fg("accent", base)} ${theme.rainbow(`[${abbrev}]`)}`, null];
  }
  return [
    `${theme.fg("accent", base)} ${theme.fg(thinkingLevelColor(thinkingLevel), `[${abbrev}]`)}`,
    null,
  ];
}

function contextUsedColor(percent: number): "success" | "warning" | "error" {
  if (percent < 60) return "success";
  if (percent < 80) return "warning";
  return "error";
}

function contextRemainingColor(
  remainingPercent: number,
): "success" | "warning" | "error" {
  if (remainingPercent <= 20) return "error";
  if (remainingPercent <= 40) return "warning";
  return "success";
}

function getRateWindow(
  input: FooterRenderInput,
  key: "fiveHour" | "weekly",
): { usedPercent: number } | null {
  const snapshot = input.usageState?.compatibility?.currentLiveProviderSnapshot;
  const window = snapshot?.windows.find((item) => item.key === key);
  if (!window || typeof window.usedPercent !== "number" || window.unavailableReason) {
    return null;
  }
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
  const entries = [...(input.extensionStatuses?.entries() ?? [])].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  if (entries.length === 0) return null;

  const blocked = new Set(normalizeFilterList(input.extensionSegments.hidden));
  const visible = entries.filter(([key]) => !blocked.has(key));

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

export function formatSegment(
  id: StatusLineSegmentId,
  input: FooterRenderInput,
  theme: ThemeLike,
): [text: string, color: FooterRenderColor | null] | null {
  switch (id) {
    case "model": {
      const value = input.model?.name ?? input.model?.id;
      return value ? [value, "accent"] : null;
    }
    case "model-with-reasoning":
      return formatModelWithReasoning(input.model, input.thinkingLevel, theme);
    case "current-dir": {
      const value = abbreviateHomeDir(input.cwd);
      return value ? [value, "success"] : null;
    }
    case "project-name": {
      const value = findProjectRootLabel(input.cwd);
      return value ? [value, "success"] : null;
    }
    case "git-branch":
      return input.gitBranch ? [input.gitBranch, "warning"] : null;
    case "run-state":
      return [input.runState, input.runState === "idle" ? "dim" : "accent"];
    case "context-used": {
      const tokens = input.contextUsage?.tokens;
      const ctxWindow = input.contextUsage?.contextWindow;
      const percent = input.contextUsage?.percent;
      if (tokens == null || ctxWindow === undefined || percent == null) return null;
      const c = contextUsedColor(percent);
      const dim = (s: string) => theme.fg("dim", s);
      return [
        `${theme.fg(c, formatCompactNumber(tokens))}${dim(" / ")}${dim(formatCompactNumber(ctxWindow))}${dim(" (")}${theme.fg(c, `${Math.round(percent)}%`)}${dim(")")}`,
        null,
      ];
    }
    case "context-remaining": {
      const tokens = input.contextUsage?.tokens;
      const ctxWindow = input.contextUsage?.contextWindow;
      const percent = input.contextUsage?.percent;
      if (tokens == null || ctxWindow === undefined || percent == null) return null;
      const remaining = Math.max(0, ctxWindow - tokens);
      const remainingPercent = Math.max(0, Math.round(100 - percent));
      const c = contextRemainingColor(remainingPercent);
      const dim = (s: string) => theme.fg("dim", s);
      return [
        `${theme.fg(c, formatCompactNumber(remaining))}${dim(" / ")}${dim(formatCompactNumber(ctxWindow))}${dim(" (")}${theme.fg(c, `${remainingPercent}%`)}${dim(")")}`,
        null,
      ];
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
    case "five-hour-limit": {
      const window = getRateWindow(input, "fiveHour");
      if (!window) return null;
      const remaining = Math.min(100, Math.max(0, 100 - Math.round(window.usedPercent)));
      const dim = (s: string) => theme.fg("dim", s);
      return [
        `${dim("5h ")}${theme.fg(rateColor(window.usedPercent), `${remaining}%`)}${dim(" left")}`,
        null,
      ];
    }
    case "weekly-limit": {
      const window = getRateWindow(input, "weekly");
      if (!window) return null;
      const remaining = Math.min(100, Math.max(0, 100 - Math.round(window.usedPercent)));
      const dim = (s: string) => theme.fg("dim", s);
      return [
        `${dim("wk ")}${theme.fg(rateColor(window.usedPercent), `${remaining}%`)}${dim(" left")}`,
        null,
      ];
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
    .filter((x): x is [string, FooterRenderColor | null] => x !== null)
    .map(([text, color]) => (color ? theme.fg(color, text) : text));

  const extStatus = formatExtensionStatuses(input, theme);
  if (extStatus) parts.push(extStatus);

  const line = parts.join(theme.fg("dim", " · "));
  return truncateToWidth(line, width);
}
