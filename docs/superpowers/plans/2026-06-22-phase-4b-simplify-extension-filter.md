# Phase 4b: Simplify Extension Status Filter

> **Status: COMPLETE** — Implemented and committed. Legacy migration code subsequently removed (clean break, no backward compat for old `filter` field).

**Goal:** Replace the two-mode `StatusFilter` discriminated union with a simple `ExtensionSegments = { hidden: string[] }` type, remove the policy row from the editor, and rename the config field from `filter` to `extensionSegments`.

**Architecture:** This is a rename + simplification refactor. The type change cascades through types → config → render → editor → index. Each task updates production code and tests together since the rename requires both to change in lockstep.

**Tech Stack:** TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-06-22-simplify-extension-filter-design.md`

**Verification:** Run `pnpm check` (lint + typecheck + tests) at the end.

**Prerequisite:** Phase 4 committed.

---

### Task 1: Replace `StatusFilter` with `ExtensionSegments` in types

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Replace the type and field**

In `src/shared/types.ts`, replace:

```ts
export type StatusFilter =
  | { mode: "all"; hidden: string[] }
  | { mode: "only"; shown: string[] };

export type PiStatusConfig = {
  segments: StatusLineSegmentId[];
  filter: StatusFilter;
};
```

with:

```ts
export type ExtensionSegments = { hidden: string[] };

export type PiStatusConfig = {
  segments: StatusLineSegmentId[];
  extensionSegments: ExtensionSegments;
};
```

### Task 2: Update config and config tests

**Files:**
- Modify: `src/core/config.ts`
- Modify: `tests/config.test.ts`

- [ ] **Step 1: Write updated config tests**

In `tests/config.test.ts`, replace the entire file with:

```ts
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadConfig,
  normalizeExtensionSegments,
  normalizeSegments,
  saveConfigToSettings,
} from "../src/core/config.ts";
import { DEFAULT_SEGMENTS } from "../src/shared/types.ts";

describe("config", () => {
  it("normalizes segments and extension segments", () => {
    expect(
      normalizeSegments([
        "model",
        "model",
        "unknown",
        1,
        "current-dir",
        "git-branch",
        "project-name",
      ]),
    ).toEqual(["model", "current-dir", "git-branch", "project-name"]);

    expect(normalizeExtensionSegments(undefined)).toEqual({
      hidden: [],
    });
    expect(
      normalizeExtensionSegments({ hidden: ["a", "a", "", 1] }),
    ).toEqual({
      hidden: ["a"],
    });
  });

  it("migrates legacy { mode: 'all', hidden } to { hidden }", () => {
    expect(
      normalizeExtensionSegments({ mode: "all", hidden: ["x", "y"] }),
    ).toEqual({ hidden: ["x", "y"] });
  });

  it("migrates legacy { mode: 'only', shown } to { hidden: [] }", () => {
    expect(
      normalizeExtensionSegments({ mode: "only", shown: ["x"] }),
    ).toEqual({ hidden: [] });
  });

  it("loads precedence: settings > default", () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-status-"));
    const globalHome = join(dir, "home");
    const project = join(dir, "project");
    const globalSettings = join(globalHome, ".pi/agent/settings.json");
    const projectSettings = join(project, ".pi/settings.json");

    mkdirSync(join(project, ".pi"), { recursive: true });
    mkdirSync(join(globalHome, ".pi/agent"), { recursive: true });
    writeFileSync(
      globalSettings,
      JSON.stringify({ statusLine: { segments: ["git-branch"] } }),
      "utf8",
    );
    writeFileSync(
      projectSettings,
      JSON.stringify({
        statusLine: { extensionSegments: { hidden: ["x"] } },
      }),
      "utf8",
    );

    const oldHome = process.env.HOME;
    process.env.HOME = globalHome;
    try {
      const viaSettings = loadConfig({ cwd: project });
      expect(viaSettings.source).toBe("settings");
      expect(viaSettings.config.segments).toEqual(["git-branch"]);
      expect(viaSettings.config.extensionSegments).toEqual({
        hidden: ["x"],
      });

      writeFileSync(projectSettings, "{ bad", "utf8");
      writeFileSync(globalSettings, "{ bad", "utf8");
      const viaDefault = loadConfig({ cwd: project });
      expect(viaDefault.source).toBe("default");
      expect(viaDefault.config.segments).toEqual(DEFAULT_SEGMENTS);
    } finally {
      process.env.HOME = oldHome;
    }
  });

  it("reads legacy filter field and migrates to extensionSegments", () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-status-"));
    const globalHome = join(dir, "home");
    const project = join(dir, "project");
    const globalSettings = join(globalHome, ".pi/agent/settings.json");

    mkdirSync(join(globalHome, ".pi/agent"), { recursive: true });
    writeFileSync(
      globalSettings,
      JSON.stringify({
        statusLine: {
          segments: ["model"],
          filter: { mode: "all", hidden: ["old-key"] },
        },
      }),
      "utf8",
    );

    const oldHome = process.env.HOME;
    process.env.HOME = globalHome;
    try {
      const result = loadConfig({ cwd: project });
      expect(result.config.extensionSegments).toEqual({
        hidden: ["old-key"],
      });
    } finally {
      process.env.HOME = oldHome;
    }
  });

  it("saves into project when project has statusLine, else global", () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-status-"));
    const globalHome = join(dir, "home");
    const project = join(dir, "project");
    const globalSettings = join(globalHome, ".pi/agent/settings.json");
    const projectSettings = join(project, ".pi/settings.json");

    mkdirSync(join(project, ".pi"), { recursive: true });
    mkdirSync(join(globalHome, ".pi/agent"), { recursive: true });
    writeFileSync(
      projectSettings,
      JSON.stringify({ statusLine: { segments: ["model"] }, x: 1 }),
      "utf8",
    );

    const oldHome = process.env.HOME;
    process.env.HOME = globalHome;
    try {
      const first = saveConfigToSettings(
        {
          segments: ["current-dir"],
          extensionSegments: { hidden: [] },
        },
        { cwd: project },
      );
      expect(first.target).toBe("project");
      const projectParsed = JSON.parse(readFileSync(projectSettings, "utf8"));
      expect(projectParsed.x).toBe(1);
      expect(projectParsed.statusLine.segments).toEqual(["current-dir"]);
      expect(projectParsed.statusLine.extensionSegments).toEqual({
        hidden: [],
      });

      writeFileSync(projectSettings, JSON.stringify({ y: 2 }), "utf8");
      const second = saveConfigToSettings(
        {
          segments: ["model"],
          extensionSegments: { hidden: ["a"] },
        },
        { cwd: project },
      );
      expect(second.target).toBe("global");
      const globalParsed = JSON.parse(readFileSync(globalSettings, "utf8"));
      expect(globalParsed.statusLine.extensionSegments).toEqual({
        hidden: ["a"],
      });
    } finally {
      process.env.HOME = oldHome;
    }
  });

  it("refuses to fall through to global when project settings are malformed", () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-status-"));
    const globalHome = join(dir, "home");
    const project = join(dir, "project");
    const projectSettings = join(project, ".pi/settings.json");

    mkdirSync(join(project, ".pi"), { recursive: true });
    mkdirSync(join(globalHome, ".pi/agent"), { recursive: true });
    writeFileSync(projectSettings, "{ bad", "utf8");

    const oldHome = process.env.HOME;
    process.env.HOME = globalHome;
    try {
      expect(() =>
        saveConfigToSettings(
          {
            segments: ["model"],
            extensionSegments: { hidden: [] },
          },
          { cwd: project },
        ),
      ).toThrow(/project settings are malformed/i);
    } finally {
      process.env.HOME = oldHome;
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/config.test.ts`

Expected: Failures because `normalizeExtensionSegments` doesn't exist yet and config types have changed.

- [ ] **Step 3: Update config.ts**

In `src/core/config.ts`, replace the entire file with:

```ts
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
  const mode = (input as { mode?: unknown }).mode;

  // Legacy { mode: "all", hidden: [...] } — keep hidden list
  if (mode === "all") {
    return {
      hidden: normalizeFilterValues((input as { hidden?: unknown }).hidden),
    };
  }

  // Legacy { mode: "only", shown: [...] } — can't invert, reset to show all
  if (mode === "only") {
    return { hidden: [] };
  }

  // New shape { hidden: [...] }
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
  const raw = input as { extensionSegments?: unknown; filter?: unknown };
  const extensionSegments = normalizeExtensionSegments(
    raw.extensionSegments ?? raw.filter,
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
```

- [ ] **Step 4: Run config tests to verify they pass**

Run: `pnpm vitest run tests/config.test.ts`

Expected: All pass.

### Task 3: Update render and render tests

**Files:**
- Modify: `src/tui/render.ts`
- Modify: `tests/render.test.ts`
- Modify: `tests/test-helpers.ts`

- [ ] **Step 1: Update `FooterRenderInput` and filter logic in render.ts**

In `src/tui/render.ts`, change the import:

```ts
import {
  DEFAULT_SEGMENTS,
  type StatusFilter,
  type StatusLineSegmentId,
} from "../shared/types.ts";
```

to:

```ts
import {
  DEFAULT_SEGMENTS,
  type ExtensionSegments,
  type StatusLineSegmentId,
} from "../shared/types.ts";
```

In the `FooterRenderInput` type, replace:

```ts
  filter: StatusFilter;
```

with:

```ts
  extensionSegments: ExtensionSegments;
```

In `formatExtensionStatuses`, replace:

```ts
  const filter = input.filter;
  const blocked = filter.mode === "all" ? new Set(normalizeFilterList(filter.hidden)) : undefined;
  const allowed = filter.mode === "only" ? new Set(normalizeFilterList(filter.shown)) : undefined;
  const visible =
    filter.mode === "all"
      ? entries.filter(([key]) => !blocked?.has(key))
      : entries.filter(([key]) => allowed?.has(key));
```

with:

```ts
  const blocked = new Set(normalizeFilterList(input.extensionSegments.hidden));
  const visible = entries.filter(([key]) => !blocked.has(key));
```

- [ ] **Step 2: Update test-helpers.ts**

In `tests/test-helpers.ts`, replace:

```ts
  input: Omit<FooterRenderInput, "filter" | "segments"> & {
```

with:

```ts
  input: Omit<FooterRenderInput, "extensionSegments" | "segments"> & {
```

And replace:

```ts
    filter: { mode: "all", hidden: [] },
```

with:

```ts
    extensionSegments: { hidden: [] },
```

- [ ] **Step 3: Update render tests**

In `tests/render.test.ts`, in `segmentInput`, replace:

```ts
    filter: { mode: "all", hidden: [] },
```

with:

```ts
    extensionSegments: { hidden: [] },
```

In the `"buildFooterLine — extension statuses"` suite, make these replacements:

In `"appends extension statuses after segment parts"`, replace:

```ts
          filter: { mode: "all", hidden: [] },
```

with:

```ts
          extensionSegments: { hidden: [] },
```

In `"respects the hidden filter"`, replace:

```ts
          filter: { mode: "all", hidden: ["alpha"] },
```

with:

```ts
          extensionSegments: { hidden: ["alpha"] },
```

Replace the entire `"respects the only filter"` test with:

```ts
  it("shows only non-hidden statuses", () => {
    const line = buildFooterLine(
      {
        ...segmentInput({
          segments: ["run-state"],
          extensionStatuses: new Map([
            ["alpha", "running"],
            ["beta", "paused"],
          ]),
          extensionSegments: { hidden: ["beta"] },
        }),
      },
      identityTheme,
      200,
    );
    expect(line).toContain("running");
    expect(line).not.toContain("paused");
  });
```

In `"omits extension statuses when all are hidden"`, replace:

```ts
          filter: { mode: "all", hidden: ["alpha"] },
```

with:

```ts
          extensionSegments: { hidden: ["alpha"] },
```

In `"strips key prefix from status values"`, replace:

```ts
          filter: { mode: "all", hidden: [] },
```

with:

```ts
          extensionSegments: { hidden: [] },
```

- [ ] **Step 4: Run render tests**

Run: `pnpm vitest run tests/render.test.ts`

Expected: All pass.

### Task 4: Update editor and editor tests

**Files:**
- Modify: `src/tui/editor.ts`
- Modify: `tests/editor.test.ts`

- [ ] **Step 1: Update editor.ts — remove policy row and simplify**

In `src/tui/editor.ts`, remove the two constants:

```ts
const POLICY_ROW_LABEL = "Extension Statuses";
const POLICY_ROW_DESCRIPTION = "Show extension statuses";
```

Remove the `PolicyInteractiveRow` type and simplify `InteractiveRow`:

Replace:

```ts
type SegmentInteractiveRow = { type: "segment"; id: StatusLineSegmentId };
type StatusInteractiveRow = { type: "status"; key: string };
type PolicyInteractiveRow = { type: "policy" };
type InteractiveRow =
  | SegmentInteractiveRow
  | StatusInteractiveRow
  | PolicyInteractiveRow;
```

with:

```ts
type SegmentInteractiveRow = { type: "segment"; id: StatusLineSegmentId };
type StatusInteractiveRow = { type: "status"; key: string };
type InteractiveRow = SegmentInteractiveRow | StatusInteractiveRow;
```

Replace `mapStatusDraftToFilter` with `collectHiddenStatuses`:

Replace:

```ts
export function mapStatusDraftToFilter(input: {
  discoveredKeys: string[];
  shownKeys: Iterable<string>;
  newStatusesShown: boolean;
}): PiStatusConfig["filter"] {
  const discovered = [...input.discoveredKeys].sort((a, b) =>
    a.localeCompare(b),
  );
  const shown = new Set(input.shownKeys);
  if (input.newStatusesShown) {
    return { mode: "all", hidden: discovered.filter((k) => !shown.has(k)) };
  }
  return { mode: "only", shown: discovered.filter((k) => shown.has(k)) };
}
```

with:

```ts
export function collectHiddenStatuses(input: {
  discoveredKeys: string[];
  shownKeys: Iterable<string>;
}): string[] {
  const discovered = [...input.discoveredKeys].sort((a, b) =>
    a.localeCompare(b),
  );
  const shown = new Set(input.shownKeys);
  return discovered.filter((k) => !shown.has(k));
}
```

In `createStatusLineEditor`, update the `previewInput` type in the options:

Replace:

```ts
  previewInput: Omit<FooterRenderInput, "segments" | "filter">;
```

with:

```ts
  previewInput: Omit<FooterRenderInput, "segments" | "extensionSegments">;
```

Replace the filter initialization block:

```ts
  const shownNew = options.config.filter.mode === "all";
  let newPolicyShown = shownNew;

  const hiddenSet = new Set(
    options.config.filter.mode === "all" ? options.config.filter.hidden : [],
  );
  const shown =
    options.config.filter.mode === "all"
      ? new Set(orderedStatuses.filter((x) => !hiddenSet.has(x)))
      : new Set(options.config.filter.shown);
```

with:

```ts
  const hiddenSet = new Set(options.config.extensionSegments.hidden);
  const shown = new Set(orderedStatuses.filter((x) => !hiddenSet.has(x)));
```

In `getInteractiveRows`, replace:

```ts
    const policy: PolicyInteractiveRow = { type: "policy" };
    const statuses = orderedStatuses.map((key) => ({
      type: "status",
      key,
    })) as StatusInteractiveRow[];

    return [...enabled, ...disabled, policy, ...statuses];
```

with:

```ts
    const statuses = orderedStatuses.map((key) => ({
      type: "status",
      key,
    })) as StatusInteractiveRow[];

    return [...enabled, ...disabled, ...statuses];
```

In `rowMatchesQuery`, remove the policy branch:

Replace:

```ts
    if (row.type === "policy") {
      return includesFuzzy(
        `${POLICY_ROW_LABEL} ${POLICY_ROW_DESCRIPTION}`,
        query,
      );
    }
```

with nothing (delete those lines).

In `getRenderRows`, change the `extensionRows` filter:

Replace:

```ts
    const extensionRows = filtered.filter(
      (row): row is StatusInteractiveRow | PolicyInteractiveRow =>
        row.type === "status" || row.type === "policy",
    );
```

with:

```ts
    const extensionRows = filtered.filter(
      (row): row is StatusInteractiveRow => row.type === "status",
    );
```

In `toggleRow`, remove the policy branch:

Replace:

```ts
  function toggleRow(row: InteractiveRow): void {
    if (row.type === "segment") {
      if (isEnabledSegment(row.id))
        enabledSegments = enabledSegments.filter((x) => x !== row.id);
      else enabledSegments = [...enabledSegments, row.id];
      return;
    }
    if (row.type === "status") {
      if (shown.has(row.key)) shown.delete(row.key);
      else shown.add(row.key);
      return;
    }
    newPolicyShown = !newPolicyShown;
  }
```

with:

```ts
  function toggleRow(row: InteractiveRow): void {
    if (row.type === "segment") {
      if (isEnabledSegment(row.id))
        enabledSegments = enabledSegments.filter((x) => x !== row.id);
      else enabledSegments = [...enabledSegments, row.id];
      return;
    }
    if (shown.has(row.key)) shown.delete(row.key);
    else shown.add(row.key);
  }
```

Replace `toConfig`:

```ts
  function toConfig(): PiStatusConfig {
    return {
      segments: enabledSegments,
      filter: mapStatusDraftToFilter({
        discoveredKeys: orderedStatuses,
        shownKeys: shown,
        newStatusesShown: newPolicyShown,
      }),
    };
  }
```

with:

```ts
  function toConfig(): PiStatusConfig {
    return {
      segments: enabledSegments,
      extensionSegments: {
        hidden: collectHiddenStatuses({
          discoveredKeys: orderedStatuses,
          shownKeys: shown,
        }),
      },
    };
  }
```

In the `render` method, update the preview line:

Replace:

```ts
        { ...options.previewInput, segments: cfg.segments, filter: cfg.filter },
```

with:

```ts
        { ...options.previewInput, segments: cfg.segments, extensionSegments: cfg.extensionSegments },
```

Remove the policy row render block. Replace:

```ts
        if (row.type === "status") {
          lines.push(
            renderRowLine(
              {
                selected: selectedRow,
                checkbox: shown.has(row.key) ? "[\u2022]" : "[ ]",
                labelWithOrder: row.key,
                description: STATUS_ROW_DESCRIPTION,
              },
              width,
              options.theme,
            ),
          );
          continue;
        }
        lines.push(
          renderRowLine(
            {
              selected: selectedRow,
              checkbox: newPolicyShown ? "[\u2022]" : "[ ]",
              labelWithOrder: POLICY_ROW_LABEL,
              description: POLICY_ROW_DESCRIPTION,
            },
            width,
            options.theme,
          ),
        );
```

with:

```ts
        lines.push(
          renderRowLine(
            {
              selected: selectedRow,
              checkbox: shown.has(row.key) ? "[\u2022]" : "[ ]",
              labelWithOrder: row.key,
              description: STATUS_ROW_DESCRIPTION,
            },
            width,
            options.theme,
          ),
        );
```

- [ ] **Step 2: Update editor tests**

In `tests/editor.test.ts`, make these changes:

Replace the import:

```ts
import {
  createStatusLineEditor,
  mapStatusDraftToFilter,
} from "../src/tui/editor.ts";
```

with:

```ts
import {
  collectHiddenStatuses,
  createStatusLineEditor,
} from "../src/tui/editor.ts";
```

In `makeConfig`, replace:

```ts
    filter: { mode: "all", hidden: [] },
```

with:

```ts
    extensionSegments: { hidden: [] },
```

In `makePreviewInput`, replace:

```ts
function makePreviewInput(): Omit<FooterRenderInput, "segments" | "filter"> {
```

with:

```ts
function makePreviewInput(): Omit<FooterRenderInput, "segments" | "extensionSegments"> {
```

Replace the entire `"statusline editor filter mapping"` describe block:

```ts
describe("statusline editor filter mapping", () => {
  it('maps "new shown" to all+hidden', () => {
    expect(
      mapStatusDraftToFilter({
        discoveredKeys: ["c", "a", "b"],
        shownKeys: ["a", "c"],
        newStatusesShown: true,
      }),
    ).toEqual({ mode: "all", hidden: ["b"] });
  });

  it('maps "new hidden" to only+shown', () => {
    expect(
      mapStatusDraftToFilter({
        discoveredKeys: ["c", "a", "b"],
        shownKeys: ["a", "c"],
        newStatusesShown: false,
      }),
    ).toEqual({ mode: "only", shown: ["a", "c"] });
  });
});
```

with:

```ts
describe("statusline editor hidden status collection", () => {
  it("returns hidden keys sorted alphabetically", () => {
    expect(
      collectHiddenStatuses({
        discoveredKeys: ["c", "a", "b"],
        shownKeys: ["a", "c"],
      }),
    ).toEqual(["b"]);
  });

  it("returns empty array when all are shown", () => {
    expect(
      collectHiddenStatuses({
        discoveredKeys: ["a", "b"],
        shownKeys: ["a", "b"],
      }),
    ).toEqual([]);
  });
});
```

Replace the `"renders the policy row before discovered extension-status rows"` test:

```ts
  it("renders the policy row before discovered extension-status rows", () => {
    const { editor } = makeEditor({
      discovered: ["alpha-status", "beta-status"],
    });
    const lines = rowLines(renderLines(editor, 200));
    const policyIndex = lines.findIndex(
      (line) =>
        line.includes("Extension Statuses") &&
        line.includes("Show extension statuses"),
    );
    const alphaIndex = lines.findIndex((line) => line.includes("alpha-status"));

    expect(policyIndex).toBeLessThan(alphaIndex);
  });
```

with:

```ts
  it("renders discovered extension-status rows in the extension section", () => {
    const { editor } = makeEditor({
      discovered: ["alpha-status", "beta-status"],
    });
    const lines = rowLines(renderLines(editor, 200));
    const alphaIndex = lines.findIndex((line) => line.includes("alpha-status"));
    const betaIndex = lines.findIndex((line) => line.includes("beta-status"));

    expect(alphaIndex).toBeGreaterThanOrEqual(0);
    expect(alphaIndex).toBeLessThan(betaIndex);
  });
```

Replace the `"shows the empty-state hint when no extension statuses are discovered"` test:

```ts
  it("shows the empty-state hint when no extension statuses are discovered", () => {
    const { editor } = makeEditor();
    const lines = rowLines(renderLines(editor, 200));

    expect(
      lines.some(
        (line) =>
          line.includes("Extension Statuses") &&
          line.includes("Show extension statuses"),
      ),
    ).toBe(true);
    expect(lines).toContain("No extension statuses yet.");
  });
```

with:

```ts
  it("shows the empty-state hint when no extension statuses are discovered", () => {
    const { editor } = makeEditor();
    const lines = rowLines(renderLines(editor, 200));

    expect(lines).toContain("No extension statuses yet.");
  });
```

Remove the `"searches the policy row by label and description"` test entirely (lines 325–338).

Remove the `"does not force the policy row visible during search"` test entirely (lines 351–360).

Update the `"renders generic descriptions for discovered rows and the policy row"` test — replace:

```ts
  it("renders generic descriptions for discovered rows and the policy row", () => {
    const { editor } = makeEditor({ discovered: ["custom-status"] });
    const lines = renderLines(editor, 200);

    expect(
      lines.some((line) =>
        line.includes("Toggle visibility in the status line"),
      ),
    ).toBe(true);
    expect(lines.some((line) => line.includes("Show extension statuses"))).toBe(
      true,
    );
  });
```

with:

```ts
  it("renders generic descriptions for discovered rows", () => {
    const { editor } = makeEditor({ discovered: ["custom-status"] });
    const lines = renderLines(editor, 200);

    expect(
      lines.some((line) =>
        line.includes("Toggle visibility in the status line"),
      ),
    ).toBe(true);
  });
```

Update the `"keeps left/right as no-ops for the policy row and discovered rows"` test name:

Replace:

```ts
  it("keeps left/right as no-ops for the policy row and discovered rows", () => {
```

with:

```ts
  it("keeps left/right as no-ops for discovered rows", () => {
```

(The loop count of 14 stays the same — it now lands directly on the first status row.)

Remove the `"updates filter state when toggling the policy row"` test entirely (lines 610–623).

In the `"statusline editor discovered-status filter persistence"` describe block, replace the entire block:

```ts
describe("statusline editor discovered-status filter persistence", () => {
  it("saves filter: { mode: 'all', hidden: [...] } when hiding one discovered status in all mode", () => {
    const { editor, done } = makeEditor({
      config: makeConfig({
        segments: ["model-with-reasoning", "current-dir"],
        filter: { mode: "all", hidden: [] },
      }),
      discovered: ["alpha-status", "beta-status"],
    });

    for (let i = 0; i < 15; i++) editor.handleInput(DOWN);
    editor.handleInput(SPACE);
    editor.handleInput(ENTER);
    const saved = done.mock.calls[0]?.[0] as PiStatusConfig | null;

    expect(saved?.filter).toEqual({
      mode: "all",
      hidden: ["alpha-status"],
    });
  });

  it("saves filter: { mode: 'only', shown: [...] } when showing one discovered status in only mode", () => {
    const { editor, done } = makeEditor({
      config: makeConfig({
        segments: ["model-with-reasoning", "current-dir"],
        filter: { mode: "only", shown: [] },
      }),
      discovered: ["alpha-status", "beta-status"],
    });

    for (let i = 0; i < 15; i++) editor.handleInput(DOWN);
    editor.handleInput(SPACE);
    editor.handleInput(ENTER);
    const saved = done.mock.calls[0]?.[0] as PiStatusConfig | null;

    expect(saved?.filter).toEqual({
      mode: "only",
      shown: ["alpha-status"],
    });
  });
});
```

with:

```ts
describe("statusline editor discovered-status filter persistence", () => {
  it("saves extensionSegments with hidden key when toggling status off", () => {
    const { editor, done } = makeEditor({
      config: makeConfig({
        segments: ["model-with-reasoning", "current-dir"],
        extensionSegments: { hidden: [] },
      }),
      discovered: ["alpha-status", "beta-status"],
    });

    for (let i = 0; i < 14; i++) editor.handleInput(DOWN);
    editor.handleInput(SPACE);
    editor.handleInput(ENTER);
    const saved = done.mock.calls[0]?.[0] as PiStatusConfig | null;

    expect(saved?.extensionSegments).toEqual({
      hidden: ["alpha-status"],
    });
  });

  it("saves extensionSegments with no hidden keys when toggling status on", () => {
    const { editor, done } = makeEditor({
      config: makeConfig({
        segments: ["model-with-reasoning", "current-dir"],
        extensionSegments: { hidden: ["alpha-status", "beta-status"] },
      }),
      discovered: ["alpha-status", "beta-status"],
    });

    for (let i = 0; i < 14; i++) editor.handleInput(DOWN);
    editor.handleInput(SPACE);
    editor.handleInput(ENTER);
    const saved = done.mock.calls[0]?.[0] as PiStatusConfig | null;

    expect(saved?.extensionSegments).toEqual({
      hidden: ["beta-status"],
    });
  });
});
```

- [ ] **Step 3: Run editor tests**

Run: `pnpm vitest run tests/editor.test.ts`

Expected: All pass.

### Task 5: Update index.ts and README

**Files:**
- Modify: `src/index.ts`
- Modify: `README.md`

- [ ] **Step 1: Update index.ts call site**

In `src/index.ts`, replace:

```ts
              filter: state.config.filter,
```

with:

```ts
              extensionSegments: state.config.extensionSegments,
```

Also replace the command description:

```ts
    description: "Configure statusline segments and extension-status filters",
```

with:

```ts
    description: "Configure statusline segments and extension-status visibility",
```

- [ ] **Step 2: Update README**

In `README.md`, replace:

```text
Extension statuses auto-append to the footer when visible. Use `/statusline` to hide individual status keys or switch to an allowlist.
```

with:

```text
Extension statuses auto-append to the footer when visible. Use `/statusline` to hide individual status keys.
```

### Task 6: Verify and commit

- [ ] **Step 1: Run the full check suite**

Run: `pnpm check`

Expected: All lint, typecheck, and tests pass.

- [ ] **Step 2: Commit**

```bash
git add src/shared/types.ts src/core/config.ts src/tui/render.ts src/tui/editor.ts src/index.ts tests/config.test.ts tests/render.test.ts tests/editor.test.ts tests/test-helpers.ts README.md
git commit -m "refactor: simplify extension filter to ExtensionSegments { hidden }"
```
