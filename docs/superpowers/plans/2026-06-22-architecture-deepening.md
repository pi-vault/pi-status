# Architecture Deepening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform shallow modules into deep ones across 5 phases, improving locality, leverage, and testability without changing external behavior.

**Architecture:** Each phase is a separate PR on its own branch. Phase 1 must land before Phase 4. All other phases are independent.

**Tech Stack:** TypeScript 6, Vitest 4, Biome 2.5, pnpm

**Verification (every phase):**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

---

## Phase 1: Deepen snapshot → resolve-footer

**Branch:** `refactor/deepen-resolve-footer`

**Summary:** Rename `snapshot.ts` → `resolve-footer.ts`. Move segment resolution logic (formatSegment calls, null-dropping, extension status filtering) out of `buildFooterLine` into `resolveFooter`. Leave `buildFooterLine` as a thin color-applier + joiner.

### Task 1.1: Rename snapshot → resolve-footer

**Files:**

- Rename: `src/core/snapshot.ts` → `src/core/resolve-footer.ts`
- Rename: `tests/core/snapshot.test.ts` → `tests/core/resolve-footer.test.ts`
- Modify: `src/index.ts` (update import)
- Modify: `tests/core/resolve-footer.test.ts` (update import path)

- [ ] **Step 1: Rename source file**

```bash
git mv src/core/snapshot.ts src/core/resolve-footer.ts
```

- [ ] **Step 2: Rename test file**

```bash
git mv tests/core/snapshot.test.ts tests/core/resolve-footer.test.ts
```

- [ ] **Step 3: Update import in `src/index.ts`**

Change:

```ts
import { buildSnapshot } from "./core/snapshot.ts";
```

To:

```ts
import { buildSnapshot } from "./core/resolve-footer.ts";
```

- [ ] **Step 4: Update import in test file**

In `tests/core/resolve-footer.test.ts`, change:

```ts
import { buildSnapshot, type SnapshotInput } from "../../src/core/snapshot.ts";
```

To:

```ts
import {
  buildSnapshot,
  type SnapshotInput,
} from "../../src/core/resolve-footer.ts";
```

- [ ] **Step 5: Run verification**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected: all pass, zero behavior change.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor: rename snapshot.ts → resolve-footer.ts"
```

### Task 1.2: Add ResolvedSegment type and resolveFooter function

**Files:**

- Modify: `src/core/resolve-footer.ts` — add `ResolvedSegment` type, `resolveFooter()` function
- Modify: `src/tui/render.ts` — export `formatExtensionStatuses` helper pieces needed

- [ ] **Step 1: Define ResolvedSegment and ResolveFooterInput in resolve-footer.ts**

Add at the top of `src/core/resolve-footer.ts`, after existing imports:

```ts
import {
  formatSegment,
  type FooterRenderInput,
  type ThemeLike,
} from "../tui/render.ts";
import type { PiStatusConfig } from "../shared/types.ts";

export interface ResolvedSegment {
  text: string;
  color: string | null;
}
```

- [ ] **Step 2: Add resolveFooter function**

Add at the bottom of `src/core/resolve-footer.ts`:

```ts
export function resolveFooter(
  snapshot: Omit<FooterRenderInput, "segments" | "extensionSegments">,
  config: PiStatusConfig,
  theme: ThemeLike,
): ResolvedSegment[] {
  const input: FooterRenderInput = {
    ...snapshot,
    segments: config.segments,
    extensionSegments: config.extensionSegments,
  };

  const segments: ResolvedSegment[] = input.segments
    .map((id) => formatSegment(id, input, theme))
    .filter((x): x is [string, string | null] => x !== null)
    .map(([text, color]) => ({ text, color }));

  return segments;
}
```

Note: Extension status resolution stays in `buildFooterLine` for now — we'll migrate it in a future step to keep diffs small.

- [ ] **Step 3: Run verification**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add resolveFooter function to resolve-footer.ts"
```

### Task 1.3: Slim down buildFooterLine

**Files:**

- Modify: `src/tui/render.ts` — add `buildFooterLineFromResolved()` that accepts `ResolvedSegment[]`
- Modify: `src/index.ts` — use `resolveFooter` + new thin render path

- [ ] **Step 1: Add buildFooterLineFromResolved to render.ts**

Add at the bottom of `src/tui/render.ts`:

```ts
import type { ResolvedSegment } from "../core/resolve-footer.ts";

export function buildFooterLineFromResolved(
  segments: ResolvedSegment[],
  extensionStatus: string | null,
  theme: ThemeLike,
  width: number,
): string {
  const parts = segments.map(({ text, color }) =>
    color ? theme.fg(color as FooterRenderColor, text) : text,
  );
  if (extensionStatus) parts.push(extensionStatus);
  const line = parts.join(theme.fg("dim", " · "));
  return truncateToWidth(line, width);
}
```

- [ ] **Step 2: Run verification**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add buildFooterLineFromResolved thin joiner"
```

### Task 1.4: Add tests for resolveFooter

**Files:**

- Modify: `tests/core/resolve-footer.test.ts`

- [ ] **Step 1: Add resolveFooter tests**

Add a new `describe("resolveFooter", ...)` block at the bottom of `tests/core/resolve-footer.test.ts`:

```ts
import {
  resolveFooter,
  type ResolvedSegment,
} from "../../src/core/resolve-footer.ts";
import type { ThemeLike } from "../../src/tui/render.ts";

const identityTheme: ThemeLike = { fg: (_c, t) => t, rainbow: (t) => t };

describe("resolveFooter", () => {
  it("resolves configured segments into text/color pairs", () => {
    const snapshot = buildSnapshot(makeInput());
    const config = {
      segments: ["run-state" as const],
      extensionSegments: { hidden: [] },
    };
    const result = resolveFooter(snapshot, config, identityTheme);
    expect(result).toEqual([{ text: "idle", color: "dim" }]);
  });

  it("drops null segments", () => {
    const snapshot = buildSnapshot(makeInput({ model: undefined }));
    const config = {
      segments: ["model" as const, "run-state" as const],
      extensionSegments: { hidden: [] },
    };
    const result = resolveFooter(snapshot, config, identityTheme);
    expect(result).toEqual([{ text: "idle", color: "dim" }]);
  });

  it("preserves segment order from config", () => {
    const snapshot = buildSnapshot(makeInput({ gitBranch: "main" }));
    const config = {
      segments: ["git-branch" as const, "run-state" as const],
      extensionSegments: { hidden: [] },
    };
    const result = resolveFooter(snapshot, config, identityTheme);
    expect(result[0].text).toBe("main");
    expect(result[1].text).toBe("idle");
  });
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm test
```

Expected: all pass including new tests.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "test: add resolveFooter unit tests"
```

---

## Phase 2: Segment Formatter Registry

**Branch:** `refactor/segment-formatter-registry`

**Summary:** Extract the 14-case `formatSegment` switch into a `Map<SegmentId, Formatter>` in a new `formatters.ts`. Move shared utilities to `render-utils.ts`. Zero test changes — `formatSegment` interface stays stable.

### Task 2.1: Extract render-utils.ts

**Files:**

- Create: `src/tui/render-utils.ts`
- Modify: `src/tui/render.ts` — move utilities out, re-export for backward compat

- [ ] **Step 1: Create `src/tui/render-utils.ts`**

```ts
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

export function formatCompactNumber(value: number): string {
  if (value < 1000) return String(Math.trunc(value));
  const unit = value >= 1_000_000 ? "M" : "k";
  const divisor = unit === "M" ? 1_000_000 : 1_000;
  const short = (value / divisor).toFixed(1).replace(/\.0$/, "");
  return `${short}${unit}`;
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
```

- [ ] **Step 2: Update `src/tui/render.ts` to import from render-utils and re-export**

Replace the function definitions of `formatCompactNumber`, `abbreviateHomeDir`, `findProjectRootLabel`, `normalizeThinkingLevel` with:

```ts
import {
  formatCompactNumber,
  abbreviateHomeDir,
  findProjectRootLabel,
  normalizeThinkingLevel,
} from "./render-utils.ts";

export {
  formatCompactNumber,
  abbreviateHomeDir,
  findProjectRootLabel,
  normalizeThinkingLevel,
};
```

Remove the `node:fs`, `node:os`, `node:path` imports that are no longer needed in render.ts (only keep what's still used).

- [ ] **Step 3: Run verification**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected: all pass, zero behavior change.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor: extract render-utils.ts with shared formatting utilities"
```

### Task 2.2: Extract formatters.ts with registry

**Files:**

- Create: `src/tui/formatters.ts`
- Modify: `src/tui/render.ts` — replace switch with registry lookup

- [ ] **Step 1: Create `src/tui/formatters.ts`**

Move all 14 case bodies from `formatSegment` switch into named formatter functions. Each formatter has signature:

```ts
import type { StatusLineSegmentId } from "../shared/types.ts";
import type {
  FooterRenderInput,
  FooterRenderColor,
  ThemeLike,
} from "./render.ts";
import {
  formatCompactNumber,
  abbreviateHomeDir,
  findProjectRootLabel,
  normalizeThinkingLevel,
} from "./render-utils.ts";

export type SegmentFormatter = (
  input: FooterRenderInput,
  theme: ThemeLike,
) => [text: string, color: FooterRenderColor | null] | null;

// Threshold constants
export const CONTEXT_WARNING_THRESHOLD = 60;
export const CONTEXT_ERROR_THRESHOLD = 80;
export const RATE_WARNING_THRESHOLD = 70;
export const RATE_ERROR_THRESHOLD = 90;
export const REMAINING_WARNING_THRESHOLD = 40;
export const REMAINING_ERROR_THRESHOLD = 20;
```

Then define each named formatter (`formatModel`, `formatModelWithReasoningSegment`, `formatCurrentDir`, `formatProjectName`, `formatGitBranch`, `formatRunState`, `formatContextUsed`, `formatContextRemaining`, `formatUsedTokens`, `formatTotalInputTokens`, `formatTotalOutputTokens`, `formatSessionId`, `formatFiveHourLimit`, `formatWeeklyLimit`) using the exact logic currently in the switch cases.

End with the registry:

```ts
export const segmentFormatters = new Map<StatusLineSegmentId, SegmentFormatter>(
  [
    ["model", formatModel],
    ["model-with-reasoning", formatModelWithReasoningSegment],
    ["current-dir", formatCurrentDir],
    ["project-name", formatProjectName],
    ["git-branch", formatGitBranch],
    ["run-state", formatRunState],
    ["context-used", formatContextUsed],
    ["context-remaining", formatContextRemaining],
    ["used-tokens", formatUsedTokens],
    ["total-input-tokens", formatTotalInputTokens],
    ["total-output-tokens", formatTotalOutputTokens],
    ["session-id", formatSessionId],
    ["five-hour-limit", formatFiveHourLimit],
    ["weekly-limit", formatWeeklyLimit],
  ],
);
```

- [ ] **Step 2: Update formatSegment in render.ts to use registry**

```ts
import { segmentFormatters } from "./formatters.ts";

export function formatSegment(
  id: StatusLineSegmentId,
  input: FooterRenderInput,
  theme: ThemeLike,
): [text: string, color: FooterRenderColor | null] | null {
  return segmentFormatters.get(id)?.(input, theme) ?? null;
}
```

Remove all the helper functions that moved to formatters.ts (`contextUsedColor`, `contextRemainingColor`, `getRateWindow`, `rateColor`, `thinkingLevelColor`, `formatModelWithReasoning`). Keep `formatExtensionStatuses`, `hasAnsi`, `normalizeFilterList`, `buildFooterLine` in render.ts.

Also keep the `formatModelWithReasoning` export from render.ts for backward compat — re-export it from formatters.ts or keep a re-export.

- [ ] **Step 3: Run verification**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected: all 1024 lines of render tests still pass unchanged.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor: extract segment formatter registry"
```

---

## Phase 3: Settings Store Seam

**Branch:** `refactor/settings-store-seam`

**Summary:** Introduce a `SettingsStore` interface so config tests can use an in-memory store instead of real filesystem.

### Task 3.1: Define SettingsStore interface

**Files:**

- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add SettingsStore interface**

Add at the bottom of `src/shared/types.ts`:

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

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: define SettingsStore interface in shared types"
```

### Task 3.2: Implement FsSettingsStore and wire into config.ts

**Files:**

- Modify: `src/core/config.ts`

- [ ] **Step 1: Add FsSettingsStore class**

Add inside `src/core/config.ts` (not exported — internal implementation detail):

```ts
import type { SettingsStore } from "../shared/types.ts";

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

const defaultStore = new FsSettingsStore();
```

- [ ] **Step 2: Add optional `store` param to `loadConfig` and `saveConfigToSettings`**

Update signatures:

```ts
export function loadConfig(options?: { cwd?: string; store?: SettingsStore }): ConfigLoadResult {
  const cwd = options?.cwd ?? process.cwd();
  const store = options?.store ?? defaultStore;
  // Replace existsSync/readFileSync calls with store.exists/store.read
  ...
}

export function saveConfigToSettings(
  config: PiStatusConfig,
  options?: { cwd?: string; store?: SettingsStore },
): { target: "project" | "global"; path: string } {
  const store = options?.store ?? defaultStore;
  // Replace filesystem calls with store methods
  ...
}
```

Replace internal helpers (`readJsonObject`, `readSettingsFileState`) to use `store` parameter. The atomic write in `saveConfigToSettings` uses `store.write(path, content)`.

- [ ] **Step 3: Run verification**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected: all existing tests still pass (they don't pass `store`, so `defaultStore` is used).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor: wire SettingsStore interface into config.ts"
```

### Task 3.3: Add MemorySettingsStore and migrate tests

**Files:**

- Modify: `tests/helpers.ts`
- Modify: `tests/core/config.test.ts`

- [ ] **Step 1: Add MemorySettingsStore to helpers.ts**

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

- [ ] **Step 2: Rewrite config.test.ts to use MemorySettingsStore**

Replace filesystem-based tests with in-memory versions. Example for the precedence test:

```ts
it("loads precedence: settings > default", () => {
  const store = new MemorySettingsStore();
  store.seed(
    "/home/.pi/agent/settings.json",
    JSON.stringify({ statusLine: { segments: ["git-branch"] } }),
  );
  store.seed(
    "/project/.pi/settings.json",
    JSON.stringify({ statusLine: { extensionSegments: { hidden: ["x"] } } }),
  );

  const result = loadConfig({ cwd: "/project", store });
  expect(result.source).toBe("settings");
  expect(result.config.segments).toEqual(["git-branch"]);
  expect(result.config.extensionSegments).toEqual({ hidden: ["x"] });
});
```

Keep one integration test that verifies `FsSettingsStore` writes atomically using a real temp dir.

- [ ] **Step 3: Run verification**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "test: migrate config tests to MemorySettingsStore"
```

---

## Phase 4: Runtime State Machine

**Branch:** `refactor/runtime-state-machine`

**Depends on:** Phase 1 (uses `resolveFooter` types)

**Summary:** Extract mutable state management from `index.ts` into a formal event-driven state machine. Event handlers become one-liners.

### Task 4.1: Create runtime-state.ts

**Files:**

- Create: `src/core/runtime-state.ts`

- [ ] **Step 1: Write the module**

```ts
import type { PiStatusConfig } from "../shared/types.ts";
import type { ModelLike, FooterRenderInput } from "../tui/render.ts";

export type RuntimeEvent =
  | {
      type: "session_start";
      cwd: string;
      model?: ModelLike;
      sessionManager: { getSessionId(): string; getBranch(): unknown[] };
      isIdle(): boolean;
      hasPendingMessages(): boolean;
      getContextUsage(): FooterRenderInput["contextUsage"];
    }
  | {
      type: "session_tree";
      cwd: string;
      model?: ModelLike;
      sessionManager: { getSessionId(): string; getBranch(): unknown[] };
      isIdle(): boolean;
      hasPendingMessages(): boolean;
      getContextUsage(): FooterRenderInput["contextUsage"];
    }
  | { type: "model_selected"; model?: ModelLike }
  | { type: "thinking_level_changed"; level: string }
  | { type: "usage_update"; state: FooterRenderInput["usageState"] }
  | {
      type: "branch_change";
      gitBranch: string | null;
      extensionStatuses: Map<string, string>;
    }
  | { type: "config_reload"; config: PiStatusConfig }
  | { type: "shutdown" };

export interface RuntimeSnapshot {
  config: PiStatusConfig;
  model?: ModelLike;
  cwd: string;
  thinkingLevel: string;
  gitBranch: string | null;
  isIdle: boolean;
  hasPendingMessages: boolean;
  contextUsage?: FooterRenderInput["contextUsage"];
  branch: unknown[];
  sessionId?: string;
  usageState?: FooterRenderInput["usageState"];
  extensionStatuses: Map<string, string>;
}

export interface RuntimeStateMachine {
  update(event: RuntimeEvent): void;
  snapshot(): RuntimeSnapshot;
  onInvalidate(cb: () => void): void;
  dispose(): void;
}

export function createRuntimeStateMachine(
  initialConfig: PiStatusConfig,
): RuntimeStateMachine {
  let config = initialConfig;
  let model: ModelLike | undefined;
  let cwd = "";
  let thinkingLevel = "medium";
  let gitBranch: string | null = null;
  let isIdle = true;
  let hasPendingMessages = false;
  let contextUsage: FooterRenderInput["contextUsage"];
  let branch: unknown[] = [];
  let sessionId: string | undefined;
  let usageState: FooterRenderInput["usageState"];
  let extensionStatuses = new Map<string, string>();
  let listener: (() => void) | undefined;

  function invalidate(): void {
    listener?.();
  }

  return {
    update(event: RuntimeEvent): void {
      switch (event.type) {
        case "session_start":
        case "session_tree":
          cwd = event.cwd;
          model = event.model;
          sessionId = event.sessionManager.getSessionId();
          branch = event.sessionManager.getBranch() as unknown[];
          isIdle = event.isIdle();
          hasPendingMessages = event.hasPendingMessages();
          contextUsage = event.getContextUsage();
          break;
        case "model_selected":
          model = event.model;
          break;
        case "thinking_level_changed":
          thinkingLevel = event.level;
          break;
        case "usage_update":
          usageState = event.state;
          break;
        case "branch_change":
          gitBranch = event.gitBranch;
          extensionStatuses = event.extensionStatuses;
          break;
        case "config_reload":
          config = event.config;
          break;
        case "shutdown":
          model = undefined;
          cwd = "";
          sessionId = undefined;
          branch = [];
          break;
      }
      invalidate();
    },
    snapshot(): RuntimeSnapshot {
      return {
        config,
        model,
        cwd,
        thinkingLevel,
        gitBranch,
        isIdle,
        hasPendingMessages,
        contextUsage,
        branch,
        sessionId,
        usageState,
        extensionStatuses,
      };
    },
    onInvalidate(cb: () => void): void {
      listener = cb;
    },
    dispose(): void {
      listener = undefined;
    },
  };
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add RuntimeStateMachine module"
```

### Task 4.2: Add tests for runtime-state

**Files:**

- Create: `tests/core/runtime-state.test.ts`

- [ ] **Step 1: Write state machine tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { createRuntimeStateMachine } from "../../src/core/runtime-state.ts";

const defaultConfig = {
  segments: ["model" as const],
  extensionSegments: { hidden: [] },
};

describe("RuntimeStateMachine", () => {
  it("returns initial snapshot", () => {
    const sm = createRuntimeStateMachine(defaultConfig);
    const s = sm.snapshot();
    expect(s.config).toEqual(defaultConfig);
    expect(s.cwd).toBe("");
    expect(s.extensionStatuses).toEqual(new Map());
  });

  it("updates model on model_selected", () => {
    const sm = createRuntimeStateMachine(defaultConfig);
    sm.update({ type: "model_selected", model: { id: "x", name: "X" } });
    expect(sm.snapshot().model).toEqual({ id: "x", name: "X" });
  });

  it("updates thinking level", () => {
    const sm = createRuntimeStateMachine(defaultConfig);
    sm.update({ type: "thinking_level_changed", level: "high" });
    expect(sm.snapshot().thinkingLevel).toBe("high");
  });

  it("fires onInvalidate on every update", () => {
    const sm = createRuntimeStateMachine(defaultConfig);
    const cb = vi.fn();
    sm.onInvalidate(cb);
    sm.update({ type: "thinking_level_changed", level: "low" });
    expect(cb).toHaveBeenCalledOnce();
  });

  it("dispose removes listener", () => {
    const sm = createRuntimeStateMachine(defaultConfig);
    const cb = vi.fn();
    sm.onInvalidate(cb);
    sm.dispose();
    sm.update({ type: "thinking_level_changed", level: "low" });
    expect(cb).not.toHaveBeenCalled();
  });

  it("resets on shutdown", () => {
    const sm = createRuntimeStateMachine(defaultConfig);
    sm.update({ type: "model_selected", model: { id: "x" } });
    sm.update({ type: "shutdown" });
    expect(sm.snapshot().model).toBeUndefined();
    expect(sm.snapshot().cwd).toBe("");
  });
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm test
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "test: add runtime-state unit tests"
```

### Task 4.3: Wire state machine into index.ts

**Files:**

- Modify: `src/index.ts` — replace manual state with `createRuntimeStateMachine`

- [ ] **Step 1: Refactor index.ts**

Replace the `RuntimeState` type and `createRuntimeState()` function with import of `createRuntimeStateMachine`. Replace manual state mutations in event handlers with `state.update(...)` calls.

The render path becomes:

```ts
const snap = state.snapshot();
const snapshot = buildSnapshot({ ...snap, isIdle: activeCtx.isIdle(), hasPendingMessages: activeCtx.hasPendingMessages(), ... });
```

Keep the integration tests passing — they test the public behavior through the extension API mock.

- [ ] **Step 2: Run verification**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "refactor: wire RuntimeStateMachine into index.ts"
```

---

## Phase 5: Editor Pure Reducer

**Branch:** `refactor/editor-pure-reducer`

**Summary:** Split `editor.ts` (512 LOC) into: state + reducer (`editor-state.ts`), render (`editor-render.ts`), and thin shell (`editor.ts`). Existing 60 tests remain as regression net.

### Task 5.1: Extract editor-state.ts

**Files:**

- Create: `src/tui/editor-state.ts`

- [ ] **Step 1: Write the state module**

Extract types and pure logic:

```ts
import type { PiStatusConfig, StatusLineSegmentId } from "../shared/types.ts";
import { isUsageSegment } from "../shared/types.ts";
import { collectHiddenStatuses } from "./editor.ts";

export interface EditorState {
  enabledSegments: StatusLineSegmentId[];
  visibleSegmentIds: StatusLineSegmentId[];
  orderedStatuses: string[];
  shownStatuses: Set<string>;
  selectedIndex: number;
  query: string;
  usageAvailable: boolean;
}

export type EditorAction =
  | { type: "move_up" }
  | { type: "move_down" }
  | { type: "toggle" }
  | { type: "reorder_left" }
  | { type: "reorder_right" }
  | { type: "type_char"; char: string }
  | { type: "backspace" }
  | { type: "save" }
  | { type: "cancel" };

export type EditorResult =
  | { type: "next"; state: EditorState }
  | { type: "done"; config: PiStatusConfig | null };

export function initEditorState(
  config: PiStatusConfig,
  discoveredStatuses: string[],
  usageAvailable = true,
): EditorState {
  /* ... */
}

export function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorResult {
  /* ... */
}
```

The reducer contains the pure state transition logic currently in `handleInput` — movement, toggling, reordering, save/cancel — without any side effects.

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: extract editor-state.ts pure reducer"
```

### Task 5.2: Extract editor-render.ts

**Files:**

- Create: `src/tui/editor-render.ts`

- [ ] **Step 1: Write the render module**

Move all render-related functions (`renderRowLine`, `renderSectionHeader`, `renderDivider`, `renderHint`, `getRenderRows` logic) into this file:

```ts
import type { EditorState } from "./editor-state.ts";
import type { FooterRenderInput } from "./render.ts";
import type { StatusLineTheme } from "./theme.ts";

export function renderEditor(
  state: EditorState,
  previewInput: Omit<FooterRenderInput, "segments" | "extensionSegments">,
  theme: StatusLineTheme,
  width: number,
): string[] {
  /* ... */
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: extract editor-render.ts"
```

### Task 5.3: Slim editor.ts to shell

**Files:**

- Modify: `src/tui/editor.ts` — reduce to ~60 lines

- [ ] **Step 1: Rewrite editor.ts as thin shell**

```ts
import type { Component } from "@earendil-works/pi-tui";
import type { PiStatusConfig } from "../shared/types.ts";
import type { FooterRenderInput } from "./render.ts";
import type { StatusLineTheme } from "./theme.ts";
import {
  initEditorState,
  editorReducer,
  type EditorAction,
} from "./editor-state.ts";
import { renderEditor } from "./editor-render.ts";
import { Key, matchesKey } from "@earendil-works/pi-tui";

export { collectHiddenStatuses } from "./editor-state.ts";

export function createStatusLineEditor(options: {
  config: PiStatusConfig;
  discoveredStatuses: string[];
  previewInput: Omit<FooterRenderInput, "segments" | "extensionSegments">;
  theme: StatusLineTheme;
  done: (result: PiStatusConfig | null) => void;
  requestRender: () => void;
  usageAvailable?: boolean;
}): Component {
  let state = initEditorState(
    options.config,
    options.discoveredStatuses,
    options.usageAvailable,
  );

  function dispatch(action: EditorAction): void {
    const result = editorReducer(state, action);
    if (result.type === "done") {
      options.done(result.config);
    } else {
      state = result.state;
      options.requestRender();
    }
  }

  return {
    invalidate(): void {},
    handleInput(data: string): void {
      if (matchesKey(data, Key.escape)) return dispatch({ type: "cancel" });
      if (matchesKey(data, Key.enter)) return dispatch({ type: "save" });
      if (matchesKey(data, Key.up)) return dispatch({ type: "move_up" });
      if (matchesKey(data, Key.down)) return dispatch({ type: "move_down" });
      if (matchesKey(data, Key.space)) return dispatch({ type: "toggle" });
      if (matchesKey(data, Key.left)) return dispatch({ type: "reorder_left" });
      if (matchesKey(data, Key.right))
        return dispatch({ type: "reorder_right" });
      if (matchesKey(data, Key.backspace))
        return dispatch({ type: "backspace" });
      if (/^[\x21-\x7E]$/.test(data))
        return dispatch({ type: "type_char", char: data });
    },
    render(width: number): string[] {
      return renderEditor(state, options.previewInput, options.theme, width);
    },
  };
}
```

- [ ] **Step 2: Run full verification**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected: all 60 existing editor tests pass without modification.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "refactor: slim editor.ts to thin shell"
```

### Task 5.4: Add pure reducer tests

**Files:**

- Create: `tests/tui/editor-state.test.ts`

- [ ] **Step 1: Write reducer tests**

```ts
import { describe, expect, it } from "vitest";
import { initEditorState, editorReducer } from "../../src/tui/editor-state.ts";

describe("editorReducer", () => {
  it("toggle removes first enabled segment", () => {
    const state = initEditorState(
      { segments: ["model", "current-dir"], extensionSegments: { hidden: [] } },
      [],
    );
    const result = editorReducer(state, { type: "toggle" });
    expect(result.type).toBe("next");
    if (result.type === "next") {
      expect(result.state.enabledSegments).toEqual(["current-dir"]);
    }
  });

  it("move_down increments selectedIndex", () => {
    const state = initEditorState(
      { segments: ["model", "current-dir"], extensionSegments: { hidden: [] } },
      [],
    );
    const result = editorReducer(state, { type: "move_down" });
    expect(result.type).toBe("next");
    if (result.type === "next") {
      expect(result.state.selectedIndex).toBe(1);
    }
  });

  it("save returns done with current config", () => {
    const state = initEditorState(
      { segments: ["model"], extensionSegments: { hidden: [] } },
      [],
    );
    const result = editorReducer(state, { type: "save" });
    expect(result.type).toBe("done");
    if (result.type === "done") {
      expect(result.config).not.toBeNull();
      expect(result.config?.segments).toContain("model");
    }
  });

  it("cancel returns done with null", () => {
    const state = initEditorState(
      { segments: ["model"], extensionSegments: { hidden: [] } },
      [],
    );
    const result = editorReducer(state, { type: "cancel" });
    expect(result).toEqual({ type: "done", config: null });
  });

  it("type_char appends to query", () => {
    const state = initEditorState(
      { segments: ["model"], extensionSegments: { hidden: [] } },
      [],
    );
    const result = editorReducer(state, { type: "type_char", char: "m" });
    expect(result.type).toBe("next");
    if (result.type === "next") {
      expect(result.state.query).toBe("m");
    }
  });
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm test
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "test: add editor-state pure reducer tests"
```

---

## Phase Execution Order

| Order | Phase                          | Branch                                | Depends on |
| ----- | ------------------------------ | ------------------------------------- | ---------- |
| 1     | Phase 2: Formatter Registry    | `refactor/segment-formatter-registry` | none       |
| 2     | Phase 3: Settings Store Seam   | `refactor/settings-store-seam`        | none       |
| 3     | Phase 1: Resolve Footer        | `refactor/deepen-resolve-footer`      | none       |
| 4     | Phase 5: Editor Reducer        | `refactor/editor-pure-reducer`        | none       |
| 5     | Phase 4: Runtime State Machine | `refactor/runtime-state-machine`      | Phase 1    |

Phases 1, 2, 3, 5 can be done in any order (or in parallel). Phase 4 must follow Phase 1.

Recommended execution: start with Phase 2 (smallest diff, zero test changes) → Phase 3 → Phase 1 → Phase 5 → Phase 4.
