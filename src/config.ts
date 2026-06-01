import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { DEFAULT_SEGMENTS, type StatusLineSegmentId } from "./render.ts";

export type PiStatusConfig = {
  segments: StatusLineSegmentId[];
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

export function loadConfig(path = getConfigPath()): PiStatusConfig {
  try {
    const raw = readFileSync(path, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { segments: [...DEFAULT_SEGMENTS] };
    }

    const segments = normalizeSegments((parsed as { segments?: unknown }).segments);
    return { segments: segments.length > 0 ? segments : [...DEFAULT_SEGMENTS] };
  } catch {
    return { segments: [...DEFAULT_SEGMENTS] };
  }
}
