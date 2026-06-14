# Deepen Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate duplicated FooterRenderInput assembly, absorb `aggregateBranchTotals` behind a testable interface, structure the extension runtime state, and add full segment-formatter test coverage.

**Architecture:** Three sequential phases, each producing one atomic commit. Phase 1 extracts a `buildSnapshot` module that consolidates duplicated input construction and absorbs `aggregateBranchTotals`. Phase 2 groups the 5 mutable closure variables into a `RuntimeState` object inside `index.ts`. Phase 3 exports `formatSegment` from `render.ts` and adds comprehensive per-segment tests.

**Tech Stack:** TypeScript 6, Vitest 4, Biome 2 (lint + format), pnpm

---

## File Map

| File                     | Phase | Action | Responsibility                                                                               |
| ------------------------ | ----- | ------ | -------------------------------------------------------------------------------------------- |
| `src/core/snapshot.ts`   | 1     | Create | Assemble `FooterRenderInput` from narrow inputs; absorbs `aggregateBranchTotals`             |
| `tests/snapshot.test.ts` | 1     | Create | Tests for `buildSnapshot` (branch totals, run state, pass-through)                           |
| `src/index.ts`           | 1, 2  | Modify | Remove duplicated assembly + `aggregateBranchTotals`; group mutable vars into `RuntimeState` |
| `src/tui/render.ts`      | 3     | Modify | Export `formatSegment`                                                                       |
| `tests/render.test.ts`   | 3     | Modify | Add full per-segment test coverage                                                           |

---

## Phase 1: Extract `buildSnapshot` module

### Task 1: Write failing tests for `buildSnapshot`

**Files:**

- Create: `tests/snapshot.test.ts`

- [ ] **Step 1: Create `tests/snapshot.test.ts` with initial test suite**

```typescript
import { describe, expect, it } from "vitest";
import { buildSnapshot, type SnapshotInput } from "../src/core/snapshot.ts";

function makeInput(overrides?: Partial<SnapshotInput>): SnapshotInput {
  return {
    model: { id: "gpt-5", name: "GPT-5", reasoning: true },
    cwd: "/Users/test/project",
    thinkingLevel: "medium",
    gitBranch: "main",
    isIdle: true,
    hasPendingMessages: false,
    contextUsage: { tokens: 5000, contextWindow: 200000, percent: 2.5 },
    branch: [],
    sessionId: "abcdef123456",
    usageState: undefined,
    extensionStatuses: new Map(),
    ...overrides,
  };
}

describe("buildSnapshot", () => {
  it("assembles all fields from input", () => {
    const result = buildSnapshot(makeInput());

    expect(result.model).toEqual({
      id: "gpt-5",
      name: "GPT-5",
      reasoning: true,
    });
    expect(result.cwd).toBe("/Users/test/project");
    expect(result.thinkingLevel).toBe("medium");
    expect(result.gitBranch).toBe("main");
    expect(result.runState).toBe("idle");
    expect(result.contextUsage).toEqual({
      tokens: 5000,
      contextWindow: 200000,
      percent: 2.5,
    });
    expect(result.sessionId).toBe("abcdef123456");
    expect(result.usageState).toBeUndefined();
    expect(result.extensionStatuses).toEqual(new Map());
  });

  it("derives runState as 'busy' when not idle", () => {
    const result = buildSnapshot(
      makeInput({ isIdle: false, hasPendingMessages: false }),
    );
    expect(result.runState).toBe("busy");
  });

  it("derives runState as 'queued' when idle with pending messages", () => {
    const result = buildSnapshot(
      makeInput({ isIdle: true, hasPendingMessages: true }),
    );
    expect(result.runState).toBe("queued");
  });

  it("derives runState as 'idle' when idle without pending messages", () => {
    const result = buildSnapshot(
      makeInput({ isIdle: true, hasPendingMessages: false }),
    );
    expect(result.runState).toBe("idle");
  });

  it("aggregates branch totals from assistant messages with usage", () => {
    const branch = [
      {
        type: "message",
        message: {
          role: "assistant",
          usage: { input: 100, output: 50, totalTokens: 150 },
        },
      },
      {
        type: "message",
        message: {
          role: "assistant",
          usage: { input: 200, output: 75, totalTokens: 275 },
        },
      },
    ];
    const result = buildSnapshot(makeInput({ branch }));
    expect(result.branchTotals).toEqual({
      input: 300,
      output: 125,
      totalTokens: 425,
    });
  });

  it("skips non-message entries in branch", () => {
    const branch = [
      { type: "tool_call", data: {} },
      {
        type: "message",
        message: {
          role: "assistant",
          usage: { input: 100, output: 50, totalTokens: 150 },
        },
      },
    ];
    const result = buildSnapshot(makeInput({ branch }));
    expect(result.branchTotals).toEqual({
      input: 100,
      output: 50,
      totalTokens: 150,
    });
  });

  it("skips user messages in branch", () => {
    const branch = [
      {
        type: "message",
        message: {
          role: "user",
          usage: { input: 500, output: 0, totalTokens: 500 },
        },
      },
      {
        type: "message",
        message: {
          role: "assistant",
          usage: { input: 100, output: 50, totalTokens: 150 },
        },
      },
    ];
    const result = buildSnapshot(makeInput({ branch }));
    expect(result.branchTotals).toEqual({
      input: 100,
      output: 50,
      totalTokens: 150,
    });
  });

  it("skips assistant messages without usage", () => {
    const branch = [
      { type: "message", message: { role: "assistant" } },
      {
        type: "message",
        message: {
          role: "assistant",
          usage: { input: 100, output: 50, totalTokens: 150 },
        },
      },
    ];
    const result = buildSnapshot(makeInput({ branch }));
    expect(result.branchTotals).toEqual({
      input: 100,
      output: 50,
      totalTokens: 150,
    });
  });

  it("returns zero totals for empty branch", () => {
    const result = buildSnapshot(makeInput({ branch: [] }));
    expect(result.branchTotals).toEqual({
      input: 0,
      output: 0,
      totalTokens: 0,
    });
  });

  it("handles null/undefined entries in branch gracefully", () => {
    const branch = [
      null,
      undefined,
      {
        type: "message",
        message: {
          role: "assistant",
          usage: { input: 10, output: 5, totalTokens: 15 },
        },
      },
    ];
    const result = buildSnapshot(makeInput({ branch: branch as unknown[] }));
    expect(result.branchTotals).toEqual({
      input: 10,
      output: 5,
      totalTokens: 15,
    });
  });

  it("passes through usageState when provided", () => {
    const usageState = {
      compatibility: {
        currentLiveProviderSnapshot: {
          providerId: "minimax",
          windows: [{ key: "fiveHour", usedPercent: 40 }],
        },
      },
    };
    const result = buildSnapshot(makeInput({ usageState }));
    expect(result.usageState).toBe(usageState);
  });

  it("passes through extensionStatuses map", () => {
    const statuses = new Map([["pi-usage", "5h: 60%"]]);
    const result = buildSnapshot(makeInput({ extensionStatuses: statuses }));
    expect(result.extensionStatuses).toBe(statuses);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/snapshot.test.ts`
Expected: FAIL — cannot resolve `../src/core/snapshot.ts`

---

### Task 2: Implement `buildSnapshot`

**Files:**

- Create: `src/core/snapshot.ts`

- [ ] **Step 1: Create `src/core/snapshot.ts`**

```typescript
import type { UsageCoreState } from "@pi-vault/pi-usage/types";
import type { FooterRenderInput, ModelLike, RunState } from "../tui/render.ts";

export type SnapshotInput = {
  model?: ModelLike;
  cwd: string;
  thinkingLevel: string;
  gitBranch: string | null;
  isIdle: boolean;
  hasPendingMessages: boolean;
  contextUsage?: {
    tokens?: number | null;
    contextWindow?: number;
    percent?: number | null;
  };
  branch: unknown[];
  sessionId: string;
  usageState?: UsageCoreState;
  extensionStatuses: ReadonlyMap<string, string>;
};

function aggregateBranchTotals(branch: unknown[]): {
  input: number;
  output: number;
  totalTokens: number;
} {
  const totals = { input: 0, output: 0, totalTokens: 0 };

  for (const entry of branch ?? []) {
    if (!entry || typeof entry !== "object") continue;
    if ((entry as { type?: unknown }).type !== "message") continue;
    const message = (
      entry as {
        message?: {
          role?: unknown;
          usage?: { input?: number; output?: number; totalTokens?: number };
        };
      }
    ).message;
    if (message?.role !== "assistant") continue;
    const usage = message.usage;
    if (!usage) continue;
    if (typeof usage.input === "number") totals.input += usage.input;
    if (typeof usage.output === "number") totals.output += usage.output;
    if (typeof usage.totalTokens === "number")
      totals.totalTokens += usage.totalTokens;
  }

  return totals;
}

function deriveRunState(
  isIdle: boolean,
  hasPendingMessages: boolean,
): RunState {
  if (!isIdle) return "busy";
  if (hasPendingMessages) return "queued";
  return "idle";
}

export function buildSnapshot(
  input: SnapshotInput,
): Omit<FooterRenderInput, "segments" | "filter"> {
  return {
    model: input.model,
    cwd: input.cwd,
    thinkingLevel: input.thinkingLevel,
    gitBranch: input.gitBranch,
    runState: deriveRunState(input.isIdle, input.hasPendingMessages),
    contextUsage: input.contextUsage,
    branchTotals: aggregateBranchTotals(input.branch),
    sessionId: input.sessionId,
    usageState: input.usageState,
    extensionStatuses: input.extensionStatuses,
  };
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `pnpm vitest run tests/snapshot.test.ts`
Expected: PASS — all 12 tests pass

- [ ] **Step 3: Run full suite to confirm no regressions**

Run: `pnpm test`
Expected: All 97 existing tests + 12 new tests pass

---

### Task 3: Update `index.ts` to use `buildSnapshot`

**Files:**

- Modify: `src/index.ts`

- [ ] **Step 1: Remove `aggregateBranchTotals` from `index.ts` and add `buildSnapshot` import**

Remove lines 47–75 (the `aggregateBranchTotals` function). Add to imports:

```typescript
import { buildSnapshot } from "./core/snapshot.ts";
```

- [ ] **Step 2: Replace the footer factory's render body (lines 108–131) with `buildSnapshot` call**

Replace the inline input construction inside the `render(width)` method of the footer factory:

```typescript
render(width: number) {
  const activeCtx = currentCtx ?? ctx;
  lastGitBranch = footerData.getGitBranch();
  lastExtensionStatuses = new Map(footerData.getExtensionStatuses().entries());
  const snapshot = buildSnapshot({
    model: activeCtx.model,
    cwd: activeCtx.cwd,
    thinkingLevel: String(pi.getThinkingLevel()),
    gitBranch: lastGitBranch,
    isIdle: activeCtx.isIdle(),
    hasPendingMessages: activeCtx.hasPendingMessages(),
    contextUsage: activeCtx.getContextUsage(),
    branch: activeCtx.sessionManager.getBranch() as unknown[],
    sessionId: activeCtx.sessionManager.getSessionId(),
    usageState: usageRuntime.getState(),
    extensionStatuses: lastExtensionStatuses,
  });
  const line = buildFooterLine(
    { ...snapshot, filter: runtimeConfig.filter, segments: runtimeConfig.segments },
    theme,
    width,
  );
  return [line];
},
```

- [ ] **Step 3: Replace the `/statusline` handler's previewInput (lines 170–185) with `buildSnapshot` call**

Replace the inline `previewInput` construction inside the `/statusline` command handler:

```typescript
result = await ctx.ui.custom<PiStatusConfig | null>(
  (tui, theme, _keys, done) => {
    const activeCtx = currentCtx ?? ctx;
    const menuTheme: StatusLineTheme = isLiveTheme(theme)
      ? fromPiTheme(theme)
      : noTheme;
    const snapshot = buildSnapshot({
      model: activeCtx.model,
      cwd: activeCtx.cwd,
      thinkingLevel: String(pi.getThinkingLevel()),
      gitBranch: lastGitBranch,
      isIdle: activeCtx.isIdle(),
      hasPendingMessages: activeCtx.hasPendingMessages(),
      contextUsage: activeCtx.getContextUsage(),
      branch: activeCtx.sessionManager.getBranch() as unknown[],
      sessionId: activeCtx.sessionManager.getSessionId(),
      usageState: usageRuntime.getState(),
      extensionStatuses: lastExtensionStatuses,
    });
    return createStatusLineEditor({
      config: runtimeConfig,
      discoveredStatuses: discovered,
      previewInput: snapshot,
      theme: menuTheme,
      done,
      requestRender: () => tui.requestRender?.(),
      usageAvailable: usageRuntime.getAvailable(),
    });
  },
);
```

- [ ] **Step 4: Run full test suite**

Run: `pnpm test`
Expected: All tests pass (97 existing + 12 snapshot tests = 109 total)

- [ ] **Step 5: Run lint and typecheck**

Run: `pnpm check`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/core/snapshot.ts tests/snapshot.test.ts src/index.ts
git commit -m "refactor: extract buildSnapshot module

Consolidate duplicated FooterRenderInput assembly into a single
buildSnapshot function. Absorbs aggregateBranchTotals as an internal
implementation detail with direct test coverage.

Generated with [Devin](https://cli.devin.ai/docs)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
```

---

## Phase 2: Extract `RuntimeState` object

### Task 4: Group mutable closure variables into `RuntimeState`

**Files:**

- Modify: `src/index.ts`

- [ ] **Step 1: Define `RuntimeState` type and factory above `createExtension`**

Add before the `createExtension` function:

```typescript
type RuntimeState = {
  config: PiStatusConfig;
  ctx: ExtensionContext | undefined;
  requestRender: (() => void) | undefined;
  gitBranch: string | null;
  extensionStatuses: Map<string, string>;
};

function createRuntimeState(): RuntimeState {
  return {
    config: loadConfig().config,
    ctx: undefined,
    requestRender: undefined,
    gitBranch: null,
    extensionStatuses: new Map(),
  };
}
```

- [ ] **Step 2: Replace the 5 `let` declarations with a single `state` object**

Replace:

```typescript
let runtimeConfig: PiStatusConfig = loadConfig().config;
let currentCtx: ExtensionContext | undefined;
let requestRender: (() => void) | undefined;
let lastGitBranch: string | null = null;
let lastExtensionStatuses = new Map<string, string>();
```

With:

```typescript
const state = createRuntimeState();
```

- [ ] **Step 3: Update all references in the closure**

Apply these renames throughout `createExtension`:

| Old                     | New                       |
| ----------------------- | ------------------------- |
| `runtimeConfig`         | `state.config`            |
| `currentCtx`            | `state.ctx`               |
| `requestRender`         | `state.requestRender`     |
| `lastGitBranch`         | `state.gitBranch`         |
| `lastExtensionStatuses` | `state.extensionStatuses` |

The `refreshRuntimeConfig` function becomes:

```typescript
function refreshRuntimeConfig(cwd?: string): void {
  state.config = loadConfig(cwd ? { cwd } : undefined).config;
}
```

The `refresh` function becomes:

```typescript
function refresh(ctx: ExtensionContext): void {
  state.ctx = ctx;
  refreshRuntimeConfig(ctx.cwd);
  state.requestRender?.();
}
```

In `installFooter`, the factory's render:

```typescript
render(width: number) {
  const activeCtx = state.ctx ?? ctx;
  state.gitBranch = footerData.getGitBranch();
  state.extensionStatuses = new Map(footerData.getExtensionStatuses().entries());
  const snapshot = buildSnapshot({
    model: activeCtx.model,
    cwd: activeCtx.cwd,
    thinkingLevel: String(pi.getThinkingLevel()),
    gitBranch: state.gitBranch,
    isIdle: activeCtx.isIdle(),
    hasPendingMessages: activeCtx.hasPendingMessages(),
    contextUsage: activeCtx.getContextUsage(),
    branch: activeCtx.sessionManager.getBranch() as unknown[],
    sessionId: activeCtx.sessionManager.getSessionId(),
    usageState: usageRuntime.getState(),
    extensionStatuses: state.extensionStatuses,
  });
  const line = buildFooterLine(
    { ...snapshot, filter: state.config.filter, segments: state.config.segments },
    theme,
    width,
  );
  return [line];
},
```

In `installFooter`, the factory setup:

```typescript
const factory: FooterFactory = (tui, theme, footerData) => {
  state.requestRender = () => tui.requestRender?.();
  usageRuntime.setOnChange(state.requestRender);
  const unsubscribe = footerData.onBranchChange?.(() => tui.requestRender?.());

  return {
    dispose() {
      unsubscribe?.();
      if (state.requestRender === (() => tui.requestRender?.()))
        state.requestRender = undefined;
      usageRuntime.setOnChange(state.requestRender);
    },
    invalidate() {
      state.requestRender?.();
    },
    render(width: number) {
      /* ... as above ... */
    },
  };
};
```

Note: The `dispose` equality check in the original uses `requestRender === tui.requestRender`. Preserve it exactly with mechanical rename only:

```typescript
const factory: FooterFactory = (tui, theme, footerData) => {
  state.requestRender = () => tui.requestRender?.();
  usageRuntime.setOnChange(state.requestRender);
  const unsubscribe = footerData.onBranchChange?.(() => tui.requestRender?.());

  return {
    dispose() {
      unsubscribe?.();
      if (state.requestRender === tui.requestRender) state.requestRender = undefined;
      usageRuntime.setOnChange(state.requestRender);
    },
    invalidate() {
      state.requestRender?.();
    },
    render(width: number) {
      /* ... as shown in the render block above ... */
    },
  };
};
```

In the `/statusline` command handler, update the `buildSnapshot` call:

```typescript
const snapshot = buildSnapshot({
  model: activeCtx.model,
  cwd: activeCtx.cwd,
  thinkingLevel: String(pi.getThinkingLevel()),
  gitBranch: state.gitBranch,
  isIdle: activeCtx.isIdle(),
  hasPendingMessages: activeCtx.hasPendingMessages(),
  contextUsage: activeCtx.getContextUsage(),
  branch: activeCtx.sessionManager.getBranch() as unknown[],
  sessionId: activeCtx.sessionManager.getSessionId(),
  usageState: usageRuntime.getState(),
  extensionStatuses: state.extensionStatuses,
});
```

And the save result:

```typescript
if (!result) return;

try {
  saveConfigToSettings(result, { cwd: ctx.cwd });
  state.config = result;
  state.requestRender?.();
} catch (error) {
  const message =
    error instanceof Error
      ? error.message
      : "Failed to save statusline settings";
  ctx.ui.notify(message, "warning");
}
```

Event handlers update:

```typescript
pi.on("session_start", (_event, ctx) => {
  usageRuntime.requestCurrent();
  refreshRuntimeConfig(ctx.cwd);
  state.ctx = ctx;
  installFooter(ctx);
});

pi.on("session_tree", (_event, ctx) => {
  refreshRuntimeConfig(ctx.cwd);
  state.ctx = ctx;
  installFooter(ctx);
});

pi.on("model_select", (_event, ctx) => {
  refresh(ctx);
});

pi.on("thinking_level_select", (_event, ctx) => {
  refresh(ctx);
});

pi.on("session_shutdown", (_event, ctx) => {
  state.ctx = undefined;
  state.requestRender = undefined;
  usageRuntime.setOnChange(undefined);
  if (ctx.hasUI) ctx.ui.setFooter(undefined);
});
```

- [ ] **Step 4: Run full test suite**

Run: `pnpm test`
Expected: All 109 tests pass (no behavioral change)

- [ ] **Step 5: Run lint and typecheck**

Run: `pnpm check`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/index.ts
git commit -m "refactor: group extension mutable state into RuntimeState

Replace 5 scattered let declarations with a structured RuntimeState
object. The closure becomes coordination-only — state access is explicit
through state.xxx.

Generated with [Devin](https://cli.devin.ai/docs)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
```

---

## Phase 3: Export `formatSegment` + full test coverage

### Task 5: Export `formatSegment`

**Files:**

- Modify: `src/tui/render.ts`

- [ ] **Step 1: Add `export` to `formatSegment`**

Change line 190 from:

```typescript
function formatSegment(
```

To:

```typescript
export function formatSegment(
```

- [ ] **Step 2: Run existing tests to confirm no regression**

Run: `pnpm test`
Expected: All 109 tests pass

---

### Task 6: Add full `formatSegment` test coverage

**Files:**

- Modify: `tests/render.test.ts`

- [ ] **Step 1: Add imports and test helper for `formatSegment`**

Update the imports at the top of `tests/render.test.ts`. Add `homedir` to the `node:os` import and add `formatSegment`, `type FooterRenderInput`, `type ThemeLike` to the render import:

```typescript
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFooterLine,
  findProjectRootLabel,
  formatCompactNumber,
  formatModelWithReasoning,
  formatSegment,
  type FooterRenderInput,
  type ThemeLike,
} from "../src/tui/render.ts";
import { withDefaults } from "./test-helpers.ts";
```

Add this helper below the existing imports:

```typescript
const identityTheme: ThemeLike = { fg: (_c, t) => t };

function segmentInput(
  overrides?: Partial<FooterRenderInput>,
): FooterRenderInput {
  return {
    cwd: "/Users/test/project",
    thinkingLevel: "medium",
    runState: "idle",
    segments: [],
    filter: { mode: "all", hidden: [] },
    ...overrides,
  };
}
```

- [ ] **Step 2: Add test block for model segments**

```typescript
describe("formatSegment — model", () => {
  it("returns model name with accent color", () => {
    const result = formatSegment(
      "model",
      segmentInput({ model: { id: "gpt-5", name: "GPT-5" } }),
      identityTheme,
    );
    expect(result).toEqual(["GPT-5", "accent"]);
  });

  it("falls back to model id when name is missing", () => {
    const result = formatSegment(
      "model",
      segmentInput({ model: { id: "gpt-5" } }),
      identityTheme,
    );
    expect(result).toEqual(["gpt-5", "accent"]);
  });

  it("returns null when model is undefined", () => {
    const result = formatSegment("model", segmentInput(), identityTheme);
    expect(result).toBeNull();
  });
});

describe("formatSegment — model-with-reasoning", () => {
  it("appends reasoning level abbreviation for reasoning models", () => {
    const result = formatSegment(
      "model-with-reasoning",
      segmentInput({ model: { id: "x", name: "X", reasoning: true } }),
      identityTheme,
    );
    expect(result).toEqual(["X [med]", "accent"]);
  });

  it("returns plain name for non-reasoning models", () => {
    const result = formatSegment(
      "model-with-reasoning",
      segmentInput({ model: { id: "x", name: "X", reasoning: false } }),
      identityTheme,
    );
    expect(result).toEqual(["X", "accent"]);
  });

  it("abbreviates 'minimal' to 'min'", () => {
    const result = formatSegment(
      "model-with-reasoning",
      segmentInput({
        model: { id: "x", name: "X", reasoning: true },
        thinkingLevel: "minimal",
      }),
      identityTheme,
    );
    expect(result).toEqual(["X [min]", "accent"]);
  });

  it("returns null when model is undefined", () => {
    const result = formatSegment(
      "model-with-reasoning",
      segmentInput(),
      identityTheme,
    );
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 3: Add test block for directory/project segments**

```typescript
describe("formatSegment — current-dir", () => {
  it("returns cwd with success color", () => {
    const result = formatSegment(
      "current-dir",
      segmentInput({ cwd: "/tmp/foo" }),
      identityTheme,
    );
    expect(result).toEqual(["/tmp/foo", "success"]);
  });

  it("abbreviates home directory to ~", () => {
    const home = homedir();
    const result = formatSegment(
      "current-dir",
      segmentInput({ cwd: `${home}/dev` }),
      identityTheme,
    );
    expect(result?.[0]).toBe("~/dev");
  });
});

describe("formatSegment — project-name", () => {
  it("returns null when no project root is found", () => {
    const result = formatSegment(
      "project-name",
      segmentInput({ cwd: "/tmp" }),
      identityTheme,
    );
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 4: Add test block for git-branch and run-state**

```typescript
describe("formatSegment — git-branch", () => {
  it("returns branch name with warning color", () => {
    const result = formatSegment(
      "git-branch",
      segmentInput({ gitBranch: "main" }),
      identityTheme,
    );
    expect(result).toEqual(["main", "warning"]);
  });

  it("returns null when gitBranch is null", () => {
    const result = formatSegment(
      "git-branch",
      segmentInput({ gitBranch: null }),
      identityTheme,
    );
    expect(result).toBeNull();
  });

  it("returns null when gitBranch is undefined", () => {
    const result = formatSegment("git-branch", segmentInput(), identityTheme);
    expect(result).toBeNull();
  });
});

describe("formatSegment — run-state", () => {
  it("returns 'idle' with dim color", () => {
    const result = formatSegment(
      "run-state",
      segmentInput({ runState: "idle" }),
      identityTheme,
    );
    expect(result).toEqual(["idle", "dim"]);
  });

  it("returns 'busy' with accent color", () => {
    const result = formatSegment(
      "run-state",
      segmentInput({ runState: "busy" }),
      identityTheme,
    );
    expect(result).toEqual(["busy", "accent"]);
  });

  it("returns 'queued' with accent color", () => {
    const result = formatSegment(
      "run-state",
      segmentInput({ runState: "queued" }),
      identityTheme,
    );
    expect(result).toEqual(["queued", "accent"]);
  });
});
```

- [ ] **Step 5: Add test block for context segments**

```typescript
describe("formatSegment — context-used", () => {
  it("returns rounded percent with success color when under 70%", () => {
    const result = formatSegment(
      "context-used",
      segmentInput({ contextUsage: { percent: 45.7 } }),
      identityTheme,
    );
    expect(result).toEqual(["46% ctx", "success"]);
  });

  it("returns warning color when percent is between 70-89", () => {
    const result = formatSegment(
      "context-used",
      segmentInput({ contextUsage: { percent: 75 } }),
      identityTheme,
    );
    expect(result).toEqual(["75% ctx", "warning"]);
  });

  it("returns error color when percent is 90+", () => {
    const result = formatSegment(
      "context-used",
      segmentInput({ contextUsage: { percent: 95 } }),
      identityTheme,
    );
    expect(result).toEqual(["95% ctx", "error"]);
  });

  it("returns null when percent is null", () => {
    const result = formatSegment(
      "context-used",
      segmentInput({ contextUsage: { percent: null } }),
      identityTheme,
    );
    expect(result).toBeNull();
  });

  it("returns null when contextUsage is undefined", () => {
    const result = formatSegment("context-used", segmentInput(), identityTheme);
    expect(result).toBeNull();
  });
});

describe("formatSegment — context-remaining", () => {
  it("calculates remaining tokens and formats compactly", () => {
    const result = formatSegment(
      "context-remaining",
      segmentInput({
        contextUsage: { tokens: 50000, contextWindow: 200000, percent: 25 },
      }),
      identityTheme,
    );
    expect(result).toEqual(["150k left", "success"]);
  });

  it("returns null when tokens is null", () => {
    const result = formatSegment(
      "context-remaining",
      segmentInput({
        contextUsage: { tokens: null, contextWindow: 200000, percent: 25 },
      }),
      identityTheme,
    );
    expect(result).toBeNull();
  });

  it("returns null when contextWindow is undefined", () => {
    const result = formatSegment(
      "context-remaining",
      segmentInput({ contextUsage: { tokens: 50000, percent: 25 } }),
      identityTheme,
    );
    expect(result).toBeNull();
  });

  it("returns null when percent is null", () => {
    const result = formatSegment(
      "context-remaining",
      segmentInput({
        contextUsage: { tokens: 50000, contextWindow: 200000, percent: null },
      }),
      identityTheme,
    );
    expect(result).toBeNull();
  });

  it("clamps remaining to zero when tokens exceed window", () => {
    const result = formatSegment(
      "context-remaining",
      segmentInput({
        contextUsage: { tokens: 250000, contextWindow: 200000, percent: 100 },
      }),
      identityTheme,
    );
    expect(result).toEqual(["0 left", "error"]);
  });
});

describe("formatSegment — context-window-size", () => {
  it("formats window size compactly with dim color", () => {
    const result = formatSegment(
      "context-window-size",
      segmentInput({ contextUsage: { contextWindow: 200000 } }),
      identityTheme,
    );
    expect(result).toEqual(["200k ctx", "dim"]);
  });

  it("returns null when contextWindow is undefined", () => {
    const result = formatSegment(
      "context-window-size",
      segmentInput(),
      identityTheme,
    );
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 6: Add test block for token segments**

```typescript
describe("formatSegment — used-tokens", () => {
  it("formats total tokens compactly with dim color", () => {
    const result = formatSegment(
      "used-tokens",
      segmentInput({
        branchTotals: { input: 100, output: 50, totalTokens: 1500 },
      }),
      identityTheme,
    );
    expect(result).toEqual(["1.5k tok", "dim"]);
  });

  it("returns null when branchTotals is undefined", () => {
    const result = formatSegment("used-tokens", segmentInput(), identityTheme);
    expect(result).toBeNull();
  });
});

describe("formatSegment — total-input-tokens", () => {
  it("formats with up arrow prefix", () => {
    const result = formatSegment(
      "total-input-tokens",
      segmentInput({
        branchTotals: { input: 2500, output: 100, totalTokens: 2600 },
      }),
      identityTheme,
    );
    expect(result).toEqual(["↑2.5k", "dim"]);
  });

  it("returns null when branchTotals is undefined", () => {
    const result = formatSegment(
      "total-input-tokens",
      segmentInput(),
      identityTheme,
    );
    expect(result).toBeNull();
  });
});

describe("formatSegment — total-output-tokens", () => {
  it("formats with down arrow prefix", () => {
    const result = formatSegment(
      "total-output-tokens",
      segmentInput({
        branchTotals: { input: 100, output: 800, totalTokens: 900 },
      }),
      identityTheme,
    );
    expect(result).toEqual(["↓800", "dim"]);
  });

  it("returns null when branchTotals is undefined", () => {
    const result = formatSegment(
      "total-output-tokens",
      segmentInput(),
      identityTheme,
    );
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 7: Add test block for session-id**

```typescript
describe("formatSegment — session-id", () => {
  it("truncates to first 8 characters with sid prefix", () => {
    const result = formatSegment(
      "session-id",
      segmentInput({ sessionId: "abcdef1234567890" }),
      identityTheme,
    );
    expect(result).toEqual(["sid abcdef12", "dim"]);
  });

  it("returns null when sessionId is undefined", () => {
    const result = formatSegment("session-id", segmentInput(), identityTheme);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 8: Add test block for rate-limit segments**

```typescript
describe("formatSegment — five-hour-limit", () => {
  it("calculates remaining percent with success color", () => {
    const result = formatSegment(
      "five-hour-limit",
      segmentInput({
        usageState: {
          compatibility: {
            currentLiveProviderSnapshot: {
              providerId: "anthropic",
              windows: [{ key: "fiveHour", usedPercent: 30 }],
            },
          },
        },
      }),
      identityTheme,
    );
    expect(result).toEqual(["5h 70% left", "success"]);
  });

  it("returns warning color when usage is between 70-89%", () => {
    const result = formatSegment(
      "five-hour-limit",
      segmentInput({
        usageState: {
          compatibility: {
            currentLiveProviderSnapshot: {
              providerId: "anthropic",
              windows: [{ key: "fiveHour", usedPercent: 75 }],
            },
          },
        },
      }),
      identityTheme,
    );
    expect(result).toEqual(["5h 25% left", "warning"]);
  });

  it("returns error color when usage is 90%+", () => {
    const result = formatSegment(
      "five-hour-limit",
      segmentInput({
        usageState: {
          compatibility: {
            currentLiveProviderSnapshot: {
              providerId: "anthropic",
              windows: [{ key: "fiveHour", usedPercent: 95 }],
            },
          },
        },
      }),
      identityTheme,
    );
    expect(result).toEqual(["5h 5% left", "error"]);
  });

  it("returns null when no fiveHour window exists", () => {
    const result = formatSegment(
      "five-hour-limit",
      segmentInput({
        usageState: {
          compatibility: {
            currentLiveProviderSnapshot: {
              providerId: "anthropic",
              windows: [{ key: "weekly", usedPercent: 30 }],
            },
          },
        },
      }),
      identityTheme,
    );
    expect(result).toBeNull();
  });

  it("returns null when window has unavailableReason", () => {
    const result = formatSegment(
      "five-hour-limit",
      segmentInput({
        usageState: {
          compatibility: {
            currentLiveProviderSnapshot: {
              providerId: "anthropic",
              windows: [
                {
                  key: "fiveHour",
                  usedPercent: 30,
                  unavailableReason: "disabled",
                },
              ],
            },
          },
        },
      }),
      identityTheme,
    );
    expect(result).toBeNull();
  });

  it("returns null when usageState is undefined", () => {
    const result = formatSegment(
      "five-hour-limit",
      segmentInput(),
      identityTheme,
    );
    expect(result).toBeNull();
  });

  it("returns null when snapshot is null", () => {
    const result = formatSegment(
      "five-hour-limit",
      segmentInput({
        usageState: { compatibility: { currentLiveProviderSnapshot: null } },
      }),
      identityTheme,
    );
    expect(result).toBeNull();
  });

  it("clamps remaining to 0-100 range", () => {
    const result = formatSegment(
      "five-hour-limit",
      segmentInput({
        usageState: {
          compatibility: {
            currentLiveProviderSnapshot: {
              providerId: "anthropic",
              windows: [{ key: "fiveHour", usedPercent: 105 }],
            },
          },
        },
      }),
      identityTheme,
    );
    expect(result).toEqual(["5h 0% left", "error"]);
  });
});

describe("formatSegment — weekly-limit", () => {
  it("calculates remaining percent with success color", () => {
    const result = formatSegment(
      "weekly-limit",
      segmentInput({
        usageState: {
          compatibility: {
            currentLiveProviderSnapshot: {
              providerId: "anthropic",
              windows: [{ key: "weekly", usedPercent: 20 }],
            },
          },
        },
      }),
      identityTheme,
    );
    expect(result).toEqual(["wk 80% left", "success"]);
  });

  it("returns null when no weekly window exists", () => {
    const result = formatSegment(
      "weekly-limit",
      segmentInput({
        usageState: {
          compatibility: {
            currentLiveProviderSnapshot: {
              providerId: "anthropic",
              windows: [{ key: "fiveHour", usedPercent: 30 }],
            },
          },
        },
      }),
      identityTheme,
    );
    expect(result).toBeNull();
  });

  it("returns null when usageState is undefined", () => {
    const result = formatSegment("weekly-limit", segmentInput(), identityTheme);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 9: Add test block for extension-statuses**

```typescript
describe("formatSegment — extension-statuses", () => {
  it("returns formatted statuses joined by pipe", () => {
    const result = formatSegment(
      "extension-statuses",
      segmentInput({
        extensionStatuses: new Map([
          ["alpha", "running"],
          ["beta", "paused"],
        ]),
        filter: { mode: "all", hidden: [] },
      }),
      identityTheme,
    );
    expect(result).not.toBeNull();
    expect(result?.[0]).toContain("running");
    expect(result?.[0]).toContain("paused");
    expect(result?.[1]).toBeNull();
  });

  it("respects the hidden filter", () => {
    const result = formatSegment(
      "extension-statuses",
      segmentInput({
        extensionStatuses: new Map([
          ["alpha", "running"],
          ["beta", "paused"],
        ]),
        filter: { mode: "all", hidden: ["alpha"] },
      }),
      identityTheme,
    );
    expect(result).not.toBeNull();
    expect(result?.[0]).not.toContain("running");
    expect(result?.[0]).toContain("paused");
  });

  it("respects the only filter", () => {
    const result = formatSegment(
      "extension-statuses",
      segmentInput({
        extensionStatuses: new Map([
          ["alpha", "running"],
          ["beta", "paused"],
        ]),
        filter: { mode: "only", shown: ["alpha"] },
      }),
      identityTheme,
    );
    expect(result).not.toBeNull();
    expect(result?.[0]).toContain("running");
    expect(result?.[0]).not.toContain("paused");
  });

  it("returns null when no extension statuses exist", () => {
    const result = formatSegment(
      "extension-statuses",
      segmentInput({ extensionStatuses: new Map() }),
      identityTheme,
    );
    expect(result).toBeNull();
  });

  it("returns null when all statuses are hidden", () => {
    const result = formatSegment(
      "extension-statuses",
      segmentInput({
        extensionStatuses: new Map([["alpha", "running"]]),
        filter: { mode: "all", hidden: ["alpha"] },
      }),
      identityTheme,
    );
    expect(result).toBeNull();
  });

  it("strips key prefix from status values", () => {
    const result = formatSegment(
      "extension-statuses",
      segmentInput({
        extensionStatuses: new Map([["alpha", "alpha: running"]]),
        filter: { mode: "all", hidden: [] },
      }),
      identityTheme,
    );
    expect(result?.[0]).toBe("running");
  });
});
```

- [ ] **Step 10: Run full test suite**

Run: `pnpm test`
Expected: All tests pass (109 existing + ~55 new formatSegment tests)

- [ ] **Step 11: Run lint and typecheck**

Run: `pnpm check`
Expected: No errors

- [ ] **Step 12: Commit**

```bash
git add src/tui/render.ts tests/render.test.ts
git commit -m "refactor: export formatSegment with full test coverage

Export formatSegment from render.ts so individual segment formatters
can be tested in isolation. Add comprehensive tests for all 16 segment
types including edge cases for colors, null handling, and formatting.

Generated with [Devin](https://cli.devin.ai/docs)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
```

---

## Verification

After all three phases are complete:

- [ ] **Final check:** `pnpm check` (lint + typecheck + all tests)
- [ ] **Verify no untracked files:** `git status`
- [ ] **Verify commit history:** `git log --oneline -3` should show 3 refactor commits
