import {
  mkdirSync,
  mkdtempSync,
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  DEFAULT_SEGMENTS,
  isKnownSegment,
  type ExtensionSegments,
  type PiStatusConfig,
  type StatusLineSegmentId,
} from "../shared/types.ts";

export type ConfigLoadResult = {
  config: PiStatusConfig;
  source: "settings" | "default";
};

export const DEFAULT_CONFIG: PiStatusConfig = {
  segments: [...DEFAULT_SEGMENTS],
  extensionSegments: { hidden: [] },
};

function cloneDefaultConfig(): PiStatusConfig {
  return {
    segments: [...DEFAULT_CONFIG.segments],
    extensionSegments: { hidden: [...DEFAULT_CONFIG.extensionSegments.hidden] },
  };
}

export function getSettingsPaths(cwd = process.cwd()): {
  global: string;
  project: string;
} {
  return {
    global: resolve(homedir(), ".pi/agent/settings.json"),
    project: resolve(cwd, ".pi/settings.json"),
  };
}

export function normalizeSegments(input: unknown): StatusLineSegmentId[] {
  if (!Array.isArray(input)) return [...DEFAULT_SEGMENTS];
  const out: StatusLineSegmentId[] = [];
  const seen = new Set<StatusLineSegmentId>();

  for (const value of input) {
    if (typeof value !== "string") continue;
    if (!isKnownSegment(value)) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
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

export function normalizeExtensionSegments(input: unknown): ExtensionSegments {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { hidden: [] };
  }
  return {
    hidden: normalizeFilterValues((input as { hidden?: unknown }).hidden),
  };
}

function readJsonObject(path: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

type SettingsFileState =
  | { exists: false; value: Record<string, never> }
  | { exists: true; value: Record<string, unknown> }
  | { exists: true; malformed: true };

function readSettingsFileState(path: string): SettingsFileState {
  if (!existsSync(path)) return { exists: false, value: {} };
  const parsed = readJsonObject(path);
  if (parsed) return { exists: true, value: parsed };
  return { exists: true, malformed: true };
}

function normalizePiStatus(input: unknown): PiStatusConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return cloneDefaultConfig();
  }
  const segments = normalizeSegments((input as { segments?: unknown }).segments);
  const extensionSegments = normalizeExtensionSegments(
    (input as { extensionSegments?: unknown }).extensionSegments,
  );
  return {
    segments: segments.length > 0 ? segments : [...DEFAULT_SEGMENTS],
    extensionSegments,
  };
}

function mergePiStatus(globalValue: unknown, projectValue: unknown): unknown {
  if (!globalValue || typeof globalValue !== "object" || Array.isArray(globalValue)) {
    return projectValue ?? globalValue;
  }
  if (!projectValue || typeof projectValue !== "object" || Array.isArray(projectValue)) {
    return globalValue;
  }
  const g = globalValue as Record<string, unknown>;
  const p = projectValue as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...g, ...p };

  const gExt = g.extensionSegments;
  const pExt = p.extensionSegments;
  if (
    gExt && typeof gExt === "object" && !Array.isArray(gExt) &&
    pExt && typeof pExt === "object" && !Array.isArray(pExt)
  ) {
    merged.extensionSegments = {
      ...(gExt as Record<string, unknown>),
      ...(pExt as Record<string, unknown>),
    };
  }

  return merged;
}

export function loadConfig(options?: { cwd?: string }): ConfigLoadResult {
  const cwd = options?.cwd ?? process.cwd();
  const settingsPaths = getSettingsPaths(cwd);
  const globalSettings = readJsonObject(settingsPaths.global);
  const projectSettings = readJsonObject(settingsPaths.project);
  const mergedPiStatus = mergePiStatus(
    globalSettings?.statusLine,
    projectSettings?.statusLine,
  );
  if (mergedPiStatus !== undefined) {
    return { config: normalizePiStatus(mergedPiStatus), source: "settings" };
  }

  return { config: cloneDefaultConfig(), source: "default" };
}

export function saveConfigToSettings(
  config: PiStatusConfig,
  options?: { cwd?: string },
): { target: "project" | "global"; path: string } {
  const cwd = options?.cwd ?? process.cwd();
  const paths = getSettingsPaths(cwd);

  const projectState = readSettingsFileState(paths.project);
  if ("malformed" in projectState) {
    throw new Error(
      `Refusing to select settings target because project settings are malformed or not a JSON object: ${paths.project}`,
    );
  }

  const target: "project" | "global" =
    projectState.exists && Object.hasOwn(projectState.value, "statusLine")
      ? "project"
      : "global";
  const path = target === "project" ? paths.project : paths.global;

  const targetState = readSettingsFileState(path);
  if ("malformed" in targetState) {
    throw new Error(`Refusing to write malformed or non-object settings file: ${path}`);
  }

  const base = targetState.value;
  const next = {
    ...base,
    statusLine: {
      segments: [...config.segments],
      extensionSegments: { hidden: [...config.extensionSegments.hidden] },
    },
  };

  const parent = dirname(path);
  mkdirSync(parent, { recursive: true });
  const tempDir = mkdtempSync(join(parent, ".pi-status-"));
  const tempFile = join(tempDir, "settings.json.tmp");
  try {
    writeFileSync(tempFile, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    renameSync(tempFile, path);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }

  return { target, path };
}
