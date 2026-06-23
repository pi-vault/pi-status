# Phase 11: Settings Store Seam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a `SettingsStore` interface so that config loading/saving can be tested without real filesystem, making tests fast, deterministic, and decoupled from `process.env.HOME`.

**Architecture:** Define `SettingsStore` in `src/shared/types.ts`. Implement `FsSettingsStore` (wraps current atomic-write logic) internally in `config.ts`. Add optional `store` parameter to `loadConfig` and `saveConfigToSettings`. Create `MemorySettingsStore` in test helpers. Migrate config tests to use it.

**Tech Stack:** TypeScript 6, Vitest 4, Biome 2.5, pnpm

**Branch:** `refactor/settings-store-seam`

**Verification:**
```bash
pnpm lint && pnpm typecheck && pnpm test
```

---

## File Structure

```
src/shared/types.ts         (add SettingsStore interface)
src/core/config.ts          (add FsSettingsStore, accept optional store param)
tests/helpers.ts            (add MemorySettingsStore)
tests/core/config.test.ts   (rewrite to use MemorySettingsStore)
```

---

### Task 1: Define SettingsStore interface

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add SettingsStore interface at the bottom of `src/shared/types.ts`**

Add after the `isUsageSegment` function (end of file):

```ts
export interface SettingsStore {
  exists(path: string): boolean;
  read(path: string): string | null;
  write(path: string, data: string): void;
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: define SettingsStore interface in shared types

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
```

---

### Task 2: Implement FsSettingsStore and wire into config.ts

**Files:**
- Modify: `src/core/config.ts`

- [ ] **Step 1: Add SettingsStore import and FsSettingsStore class**

At the top of `src/core/config.ts`, add to the import from `../shared/types.ts`:

```ts
import {
  DEFAULT_SEGMENTS,
  isKnownSegment,
  type ExtensionSegments,
  type PiStatusConfig,
  type SettingsStore,
  type StatusLineSegmentId,
} from "../shared/types.ts";
```

After the `cloneDefaultConfig` function, add:

```ts
class FsSettingsStore implements SettingsStore {
  exists(path: string): boolean {
    return existsSync(path);
  }
  read(path: string): string | null {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return null;
    }
  }
  write(path: string, data: string): void {
    const parent = dirname(path);
    mkdirSync(parent, { recursive: true });
    const tempDir = mkdtempSync(join(parent, ".pi-status-"));
    const tempFile = join(tempDir, "settings.json.tmp");
    try {
      writeFileSync(tempFile, data, "utf8");
      renameSync(tempFile, path);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

const defaultStore: SettingsStore = new FsSettingsStore();
```

- [ ] **Step 2: Refactor `readJsonObject` to accept store**

Replace the `readJsonObject` function:

```ts
function readJsonObject(
  path: string,
  store: SettingsStore,
): Record<string, unknown> | null {
  const content = store.read(path);
  if (content === null) return null;
  try {
    const parsed: unknown = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Refactor `readSettingsFileState` to accept store**

```ts
function readSettingsFileState(
  path: string,
  store: SettingsStore,
): SettingsFileState {
  if (!store.exists(path)) return { exists: false, value: {} };
  const parsed = readJsonObject(path, store);
  if (parsed) return { exists: true, value: parsed };
  return { exists: true, malformed: true };
}
```

- [ ] **Step 4: Update `loadConfig` signature and body**

```ts
export function loadConfig(options?: {
  cwd?: string;
  store?: SettingsStore;
}): ConfigLoadResult {
  const cwd = options?.cwd ?? process.cwd();
  const store = options?.store ?? defaultStore;
  const settingsPaths = getSettingsPaths(cwd);
  const globalSettings = readJsonObject(settingsPaths.global, store);
  const projectSettings = readJsonObject(settingsPaths.project, store);
  const mergedPiStatus = mergePiStatus(
    globalSettings?.statusLine,
    projectSettings?.statusLine,
  );
  if (mergedPiStatus !== undefined) {
    return { config: normalizePiStatus(mergedPiStatus), source: "settings" };
  }

  return { config: cloneDefaultConfig(), source: "default" };
}
```

- [ ] **Step 5: Update `saveConfigToSettings` signature and body**

```ts
export function saveConfigToSettings(
  config: PiStatusConfig,
  options?: { cwd?: string; store?: SettingsStore },
): { target: "project" | "global"; path: string } {
  const cwd = options?.cwd ?? process.cwd();
  const store = options?.store ?? defaultStore;
  const paths = getSettingsPaths(cwd);

  const projectState = readSettingsFileState(paths.project, store);
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

  const targetState = readSettingsFileState(path, store);
  if ("malformed" in targetState) {
    throw new Error(
      `Refusing to write malformed or non-object settings file: ${path}`,
    );
  }

  const base = targetState.value;
  const next = {
    ...base,
    statusLine: {
      segments: [...config.segments],
      extensionSegments: { hidden: [...config.extensionSegments.hidden] },
    },
  };

  store.write(path, `${JSON.stringify(next, null, 2)}\n`);

  return { target, path };
}
```

- [ ] **Step 6: Run verification**

```bash
pnpm lint && pnpm typecheck && pnpm test
```
Expected: all pass — existing tests don't pass `store` so they use `defaultStore` (FsSettingsStore).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: wire SettingsStore interface into config.ts

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
```

---

### Task 3: Add MemorySettingsStore to test helpers

**Files:**
- Modify: `tests/helpers.ts`

- [ ] **Step 1: Add MemorySettingsStore class**

Add at the bottom of `tests/helpers.ts`:

```ts
import type { SettingsStore } from "../src/shared/types.ts";

export class MemorySettingsStore implements SettingsStore {
  private files = new Map<string, string>();

  seed(path: string, content: string): void {
    this.files.set(path, content);
  }
  exists(path: string): boolean {
    return this.files.has(path);
  }
  read(path: string): string | null {
    return this.files.get(path) ?? null;
  }
  write(path: string, data: string): void {
    this.files.set(path, data);
  }
  readBack(path: string): string | null {
    return this.files.get(path) ?? null;
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add MemorySettingsStore test helper

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
```

---

### Task 4: Migrate config tests to MemorySettingsStore

**Files:**
- Modify: `tests/core/config.test.ts`

- [ ] **Step 1: Rewrite config.test.ts**

Replace the entire file with:

```ts
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getSettingsPaths,
  loadConfig,
  normalizeExtensionSegments,
  normalizeSegments,
  saveConfigToSettings,
} from "../../src/core/config.ts";
import { DEFAULT_SEGMENTS } from "../../src/shared/types.ts";
import { MemorySettingsStore } from "../helpers.ts";

describe("config — normalization", () => {
  it("normalizes segments: dedupes, rejects unknowns and non-strings", () => {
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
  });

  it("normalizes extension segments: dedupes, rejects empty and non-strings", () => {
    expect(normalizeExtensionSegments(undefined)).toEqual({ hidden: [] });
    expect(
      normalizeExtensionSegments({ hidden: ["a", "a", "", 1] }),
    ).toEqual({ hidden: ["a"] });
  });
});

describe("config — loadConfig", () => {
  it("returns default when no settings files exist", () => {
    const store = new MemorySettingsStore();
    const result = loadConfig({ cwd: "/project", store });
    expect(result.source).toBe("default");
    expect(result.config.segments).toEqual(DEFAULT_SEGMENTS);
  });

  it("loads from global settings", () => {
    const store = new MemorySettingsStore();
    const paths = getSettingsPaths("/project");
    store.seed(
      paths.global,
      JSON.stringify({ statusLine: { segments: ["git-branch"] } }),
    );
    const result = loadConfig({ cwd: "/project", store });
    expect(result.source).toBe("settings");
    expect(result.config.segments).toEqual(["git-branch"]);
  });

  it("merges project settings over global settings", () => {
    const store = new MemorySettingsStore();
    const paths = getSettingsPaths("/project");
    store.seed(
      paths.global,
      JSON.stringify({ statusLine: { segments: ["git-branch"] } }),
    );
    store.seed(
      paths.project,
      JSON.stringify({
        statusLine: { extensionSegments: { hidden: ["x"] } },
      }),
    );
    const result = loadConfig({ cwd: "/project", store });
    expect(result.source).toBe("settings");
    expect(result.config.segments).toEqual(["git-branch"]);
    expect(result.config.extensionSegments).toEqual({ hidden: ["x"] });
  });

  it("returns default when both settings files are malformed JSON", () => {
    const store = new MemorySettingsStore();
    const paths = getSettingsPaths("/project");
    store.seed(paths.global, "{ bad");
    store.seed(paths.project, "{ bad");
    const result = loadConfig({ cwd: "/project", store });
    expect(result.source).toBe("default");
    expect(result.config.segments).toEqual(DEFAULT_SEGMENTS);
  });
});

describe("config — saveConfigToSettings", () => {
  it("saves to project when project has statusLine key", () => {
    const store = new MemorySettingsStore();
    const paths = getSettingsPaths("/project");
    store.seed(
      paths.project,
      JSON.stringify({ statusLine: { segments: ["model"] }, x: 1 }),
    );

    const result = saveConfigToSettings(
      { segments: ["current-dir"], extensionSegments: { hidden: [] } },
      { cwd: "/project", store },
    );
    expect(result.target).toBe("project");

    const written = JSON.parse(store.readBack(paths.project)!);
    expect(written.x).toBe(1);
    expect(written.statusLine.segments).toEqual(["current-dir"]);
    expect(written.statusLine.extensionSegments).toEqual({ hidden: [] });
  });

  it("saves to global when project has no statusLine key", () => {
    const store = new MemorySettingsStore();
    const paths = getSettingsPaths("/project");
    store.seed(paths.project, JSON.stringify({ y: 2 }));

    const result = saveConfigToSettings(
      { segments: ["model"], extensionSegments: { hidden: ["a"] } },
      { cwd: "/project", store },
    );
    expect(result.target).toBe("global");

    const written = JSON.parse(store.readBack(paths.global)!);
    expect(written.statusLine.segments).toEqual(["model"]);
    expect(written.statusLine.extensionSegments).toEqual({ hidden: ["a"] });
  });

  it("saves to global when project settings file does not exist", () => {
    const store = new MemorySettingsStore();

    const result = saveConfigToSettings(
      { segments: ["model"], extensionSegments: { hidden: [] } },
      { cwd: "/project", store },
    );
    expect(result.target).toBe("global");
  });

  it("throws when project settings are malformed", () => {
    const store = new MemorySettingsStore();
    const paths = getSettingsPaths("/project");
    store.seed(paths.project, "{ bad");

    expect(() =>
      saveConfigToSettings(
        { segments: ["model"], extensionSegments: { hidden: [] } },
        { cwd: "/project", store },
      ),
    ).toThrow(/project settings are malformed/i);
  });
});

describe("config — FsSettingsStore integration", () => {
  it("round-trips through real filesystem", () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-status-fs-"));
    const globalHome = join(dir, "home");
    const project = join(dir, "project");

    mkdirSync(join(project, ".pi"), { recursive: true });
    mkdirSync(join(globalHome, ".pi/agent"), { recursive: true });
    writeFileSync(
      join(project, ".pi/settings.json"),
      JSON.stringify({ statusLine: { segments: ["model"] } }),
      "utf8",
    );

    const oldHome = process.env.HOME;
    process.env.HOME = globalHome;
    try {
      const loaded = loadConfig({ cwd: project });
      expect(loaded.config.segments).toEqual(["model"]);

      saveConfigToSettings(
        { segments: ["git-branch"], extensionSegments: { hidden: [] } },
        { cwd: project },
      );

      const raw = JSON.parse(
        readFileSync(join(project, ".pi/settings.json"), "utf8"),
      );
      expect(raw.statusLine.segments).toEqual(["git-branch"]);
    } finally {
      process.env.HOME = oldHome;
    }
  });
});
```

- [ ] **Step 2: Run verification**

```bash
pnpm lint && pnpm typecheck && pnpm test
```
Expected: all pass. Config tests are now fast (no temp dirs except the one integration test).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: migrate config tests to MemorySettingsStore

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
```
