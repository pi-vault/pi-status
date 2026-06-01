import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { DEFAULT_SEGMENTS, type StatusFilter, type StatusLineSegmentId } from "./render.ts";

export type PiStatusConfig = {
  segments: StatusLineSegmentId[];
  statusFilter: StatusFilter;
};

const KNOWN_SEGMENTS = new Set<StatusLineSegmentId>([
  "model",
  "model-with-reasoning",
  "current-dir",
  "git-branch",
  "run-state",
  "context-remaining",
  "context-used",
  "context-window-size",
  "used-tokens",
  "total-input-tokens",
  "total-output-tokens",
  "session-id",
  "five-hour-limit",
  "weekly-limit",
  "extension-statuses",
]);

export function getConfigPath(env = process.env): string {
  const configured = env.PI_STATUS_CONFIG;
  if (configured) return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
  return resolve(homedir(), ".pi/agent/pi-status.json");
}

export function normalizeSegments(input: unknown): StatusLineSegmentId[] {
  if (!Array.isArray(input)) return [...DEFAULT_SEGMENTS];
  const out: StatusLineSegmentId[] = [];
  const seen = new Set<StatusLineSegmentId>();

  for (const value of input) {
    if (typeof value !== "string") continue;
    if (!KNOWN_SEGMENTS.has(value as StatusLineSegmentId)) continue;
    const id = value as StatusLineSegmentId;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }

  return out;
}

function normalizeFilterValues(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();

  for (const value of input) {
    if (typeof value !== "string") continue;
    if (value.length === 0) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }

  return out;
}

export function normalizeStatusFilter(input: unknown): StatusFilter {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { mode: "all", hidden: [] };
  const mode = (input as { mode?: unknown }).mode;

  if (mode === "all") {
    return { mode: "all", hidden: normalizeFilterValues((input as { hidden?: unknown }).hidden) };
  }

  if (mode === "only") {
    return { mode: "only", shown: normalizeFilterValues((input as { shown?: unknown }).shown) };
  }

  return { mode: "all", hidden: [] };
}

export function loadConfig(path = getConfigPath()): PiStatusConfig {
  try {
    const raw = readFileSync(path, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { segments: [...DEFAULT_SEGMENTS], statusFilter: { mode: "all", hidden: [] } };
    }

    const segments = normalizeSegments((parsed as { segments?: unknown }).segments);
    const statusFilter = normalizeStatusFilter((parsed as { statusFilter?: unknown }).statusFilter);
    return { segments: segments.length > 0 ? segments : [...DEFAULT_SEGMENTS], statusFilter };
  } catch {
    return { segments: [...DEFAULT_SEGMENTS], statusFilter: { mode: "all", hidden: [] } };
  }
}
