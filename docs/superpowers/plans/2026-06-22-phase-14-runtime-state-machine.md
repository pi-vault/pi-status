# Phase 14: Runtime State Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract mutable state management from `src/index.ts` into a formal event-driven state machine, making state transitions explicit and testable without mocking the ExtensionAPI.

**Architecture:** New `src/core/runtime-state.ts` module with a `RuntimeStateMachine` that accepts typed events and produces snapshots. Event handlers in `index.ts` become one-line adapters. The state machine fires `onInvalidate` when state changes, triggering re-render.

**Tech Stack:** TypeScript 6, Vitest 4, Biome 2.5, pnpm

**Branch:** `refactor/runtime-state-machine`

**Depends on:** Phase 12 (resolve-footer must exist)

**Verification:**
```bash
pnpm lint && pnpm typecheck && pnpm test
```

---

## File Structure

```
src/core/runtime-state.ts       (NEW: RuntimeStateMachine, events, snapshot type)
src/index.ts                    (slimmed: uses state machine, thin event adapters)
tests/core/runtime-state.test.ts (NEW: pure state transition tests)
tests/index.test.ts             (existing integration tests — unchanged)
```

---

### Task 1: Create runtime-state.ts

**Files:**
- Create: `src/core/runtime-state.ts`

- [ ] **Step 1: Write the module**

```ts
import type { PiStatusConfig } from "../shared/types.ts";
import type { FooterRenderInput, ModelLike } from "../tui/render.ts";

export type RuntimeEvent =
  | {
      type: "session_start";
      cwd: string;
      model?: ModelLike;
      sessionId: string;
      branch: unknown[];
      isIdle: boolean;
      hasPendingMessages: boolean;
      contextUsage: FooterRenderInput["contextUsage"];
    }
  | {
      type: "session_tree";
      cwd: string;
      model?: ModelLike;
      sessionId: string;
      branch: unknown[];
      isIdle: boolean;
      hasPendingMessages: boolean;
      contextUsage: FooterRenderInput["contextUsage"];
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
  onInvalidate(cb: (() => void) | undefined): void;
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
          sessionId = event.sessionId;
          branch = event.branch;
          isIdle = event.isIdle;
          hasPendingMessages = event.hasPendingMessages;
          contextUsage = event.contextUsage;
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
          extensionStatuses = new Map();
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
    onInvalidate(cb: (() => void) | undefined): void {
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
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add RuntimeStateMachine module

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
```

---

### Task 2: Add runtime-state unit tests

**Files:**
- Create: `tests/core/runtime-state.test.ts`

- [ ] **Step 1: Write tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { createRuntimeStateMachine } from "../../src/core/runtime-state.ts";
import type { PiStatusConfig } from "../../src/shared/types.ts";

const defaultConfig: PiStatusConfig = {
  segments: ["model-with-reasoning", "current-dir"],
  extensionSegments: { hidden: [] },
};

describe("RuntimeStateMachine", () => {
  it("returns initial snapshot with defaults", () => {
    const sm = createRuntimeStateMachine(defaultConfig);
    const s = sm.snapshot();
    expect(s.config).toEqual(defaultConfig);
    expect(s.cwd).toBe("");
    expect(s.thinkingLevel).toBe("medium");
    expect(s.gitBranch).toBeNull();
    expect(s.isIdle).toBe(true);
    expect(s.hasPendingMessages).toBe(false);
    expect(s.branch).toEqual([]);
    expect(s.sessionId).toBeUndefined();
    expect(s.model).toBeUndefined();
    expect(s.usageState).toBeUndefined();
    expect(s.extensionStatuses).toEqual(new Map());
  });

  it("updates on session_start", () => {
    const sm = createRuntimeStateMachine(defaultConfig);
    sm.update({
      type: "session_start",
      cwd: "/project",
      model: { id: "gpt-5", name: "GPT-5", reasoning: true },
      sessionId: "abc123",
      branch: [{ type: "message" }],
      isIdle: false,
      hasPendingMessages: true,
      contextUsage: { tokens: 1000, contextWindow: 200000, percent: 0.5 },
    });
    const s = sm.snapshot();
    expect(s.cwd).toBe("/project");
    expect(s.model?.name).toBe("GPT-5");
    expect(s.sessionId).toBe("abc123");
    expect(s.isIdle).toBe(false);
    expect(s.hasPendingMessages).toBe(true);
    expect(s.contextUsage?.tokens).toBe(1000);
  });

  it("updates on session_tree (same shape as session_start)", () => {
    const sm = createRuntimeStateMachine(defaultConfig);
    sm.update({
      type: "session_tree",
      cwd: "/other",
      model: { id: "x" },
      sessionId: "xyz",
      branch: [],
      isIdle: true,
      hasPendingMessages: false,
      contextUsage: undefined,
    });
    expect(sm.snapshot().cwd).toBe("/other");
    expect(sm.snapshot().sessionId).toBe("xyz");
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

  it("updates usage state", () => {
    const sm = createRuntimeStateMachine(defaultConfig);
    const usageState = {
      compatibility: {
        currentLiveProviderSnapshot: {
          providerId: "anthropic",
          windows: [{ key: "fiveHour", usedPercent: 40 }],
        },
      },
    };
    sm.update({ type: "usage_update", state: usageState });
    expect(sm.snapshot().usageState).toBe(usageState);
  });

  it("updates branch change", () => {
    const sm = createRuntimeStateMachine(defaultConfig);
    const statuses = new Map([["ext-a", "running"]]);
    sm.update({
      type: "branch_change",
      gitBranch: "feature/x",
      extensionStatuses: statuses,
    });
    expect(sm.snapshot().gitBranch).toBe("feature/x");
    expect(sm.snapshot().extensionStatuses).toBe(statuses);
  });

  it("updates config on config_reload", () => {
    const sm = createRuntimeStateMachine(defaultConfig);
    const newConfig: PiStatusConfig = {
      segments: ["git-branch"],
      extensionSegments: { hidden: ["x"] },
    };
    sm.update({ type: "config_reload", config: newConfig });
    expect(sm.snapshot().config).toEqual(newConfig);
  });

  it("resets on shutdown", () => {
    const sm = createRuntimeStateMachine(defaultConfig);
    sm.update({
      type: "session_start",
      cwd: "/project",
      model: { id: "x" },
      sessionId: "abc",
      branch: [{}],
      isIdle: false,
      hasPendingMessages: true,
      contextUsage: { tokens: 100, contextWindow: 200000, percent: 0.05 },
    });
    sm.update({ type: "shutdown" });
    const s = sm.snapshot();
    expect(s.model).toBeUndefined();
    expect(s.cwd).toBe("");
    expect(s.sessionId).toBeUndefined();
    expect(s.branch).toEqual([]);
    expect(s.extensionStatuses).toEqual(new Map());
    // config persists through shutdown
    expect(s.config).toEqual(defaultConfig);
  });

  it("fires onInvalidate on every update", () => {
    const sm = createRuntimeStateMachine(defaultConfig);
    const cb = vi.fn();
    sm.onInvalidate(cb);
    sm.update({ type: "thinking_level_changed", level: "low" });
    expect(cb).toHaveBeenCalledOnce();
    sm.update({ type: "thinking_level_changed", level: "high" });
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("does not fire after onInvalidate(undefined)", () => {
    const sm = createRuntimeStateMachine(defaultConfig);
    const cb = vi.fn();
    sm.onInvalidate(cb);
    sm.onInvalidate(undefined);
    sm.update({ type: "thinking_level_changed", level: "low" });
    expect(cb).not.toHaveBeenCalled();
  });

  it("dispose removes listener", () => {
    const sm = createRuntimeStateMachine(defaultConfig);
    const cb = vi.fn();
    sm.onInvalidate(cb);
    sm.dispose();
    sm.update({ type: "thinking_level_changed", level: "low" });
    expect(cb).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm test tests/core/runtime-state.test.ts
```
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: add runtime-state unit tests

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
```

---

### Task 3: Wire state machine into index.ts

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Replace RuntimeState with state machine import**

At the top of `src/index.ts`, replace:
```ts
import { buildSnapshot } from "./core/resolve-footer.ts";
```
With:
```ts
import { buildSnapshot } from "./core/resolve-footer.ts";
import { createRuntimeStateMachine } from "./core/runtime-state.ts";
```

Remove the `RuntimeState` type and `createRuntimeState()` function (lines 31–47 in current file).

- [ ] **Step 2: Replace state initialization in createExtension**

Replace:
```ts
const state = createRuntimeState();
```
With:
```ts
const runtimeState = createRuntimeStateMachine(loadConfig().config);
```

- [ ] **Step 3: Update refreshRuntimeConfig**

Replace:
```ts
function refreshRuntimeConfig(cwd?: string): void {
  state.config = loadConfig(cwd ? { cwd } : undefined).config;
}
```
With:
```ts
function refreshRuntimeConfig(cwd?: string): void {
  runtimeState.update({
    type: "config_reload",
    config: loadConfig(cwd ? { cwd } : undefined).config,
  });
}
```

- [ ] **Step 4: Update event handlers to use state machine**

Replace event handlers to use `runtimeState.update(...)`:

```ts
pi.on("session_start", (_event, ctx) => {
  usageRuntime.requestCurrent();
  runtimeState.update({
    type: "session_start",
    cwd: ctx.cwd,
    model: ctx.model,
    sessionId: ctx.sessionManager.getSessionId(),
    branch: ctx.sessionManager.getBranch() as unknown[],
    isIdle: ctx.isIdle(),
    hasPendingMessages: ctx.hasPendingMessages(),
    contextUsage: ctx.getContextUsage(),
  });
  refreshRuntimeConfig(ctx.cwd);
  installFooter(ctx);
});

pi.on("session_tree", (_event, ctx) => {
  runtimeState.update({
    type: "session_tree",
    cwd: ctx.cwd,
    model: ctx.model,
    sessionId: ctx.sessionManager.getSessionId(),
    branch: ctx.sessionManager.getBranch() as unknown[],
    isIdle: ctx.isIdle(),
    hasPendingMessages: ctx.hasPendingMessages(),
    contextUsage: ctx.getContextUsage(),
  });
  refreshRuntimeConfig(ctx.cwd);
  installFooter(ctx);
});

pi.on("model_select", (_event, ctx) => {
  runtimeState.update({ type: "model_selected", model: ctx.model });
  runtimeState.update({
    type: "session_tree",
    cwd: ctx.cwd,
    model: ctx.model,
    sessionId: ctx.sessionManager.getSessionId(),
    branch: ctx.sessionManager.getBranch() as unknown[],
    isIdle: ctx.isIdle(),
    hasPendingMessages: ctx.hasPendingMessages(),
    contextUsage: ctx.getContextUsage(),
  });
});

pi.on("thinking_level_select", (_event, ctx) => {
  runtimeState.update({
    type: "thinking_level_changed",
    level: String(pi.getThinkingLevel()),
  });
  runtimeState.update({
    type: "session_tree",
    cwd: ctx.cwd,
    model: ctx.model,
    sessionId: ctx.sessionManager.getSessionId(),
    branch: ctx.sessionManager.getBranch() as unknown[],
    isIdle: ctx.isIdle(),
    hasPendingMessages: ctx.hasPendingMessages(),
    contextUsage: ctx.getContextUsage(),
  });
});

pi.on("session_shutdown", (_event, ctx) => {
  runtimeState.update({ type: "shutdown" });
  usageRuntime.setOnChange(undefined);
  if (ctx.hasUI) ctx.ui.setFooter(undefined);
});
```

- [ ] **Step 5: Update the render path in installFooter**

In the `render(width)` function, replace `state.*` references with `runtimeState.snapshot()`:

```ts
render(width: number) {
  const snap = runtimeState.snapshot();
  const footerGitBranch = footerData.getGitBranch();
  const footerStatuses = new Map(footerData.getExtensionStatuses().entries());

  // Update branch data in state machine
  runtimeState.update({
    type: "branch_change",
    gitBranch: footerGitBranch,
    extensionStatuses: footerStatuses,
  });

  const activeCtx = ctx;
  const snapshot = buildSnapshot({
    model: snap.model ?? activeCtx.model,
    cwd: snap.cwd || activeCtx.cwd,
    thinkingLevel: snap.thinkingLevel,
    gitBranch: footerGitBranch,
    isIdle: activeCtx.isIdle(),
    hasPendingMessages: activeCtx.hasPendingMessages(),
    contextUsage: activeCtx.getContextUsage(),
    branch: activeCtx.sessionManager.getBranch() as unknown[],
    sessionId: activeCtx.sessionManager.getSessionId(),
    usageState: usageRuntime.getState(),
    extensionStatuses: footerStatuses,
  });
  const line = buildFooterLine(
    {
      ...snapshot,
      extensionSegments: snap.config.extensionSegments,
      segments: snap.config.segments,
    },
    fromPiTheme(theme),
    width,
  );
  return [line];
},
```

- [ ] **Step 6: Update requestRender wiring**

Replace `state.requestRender` references:

In the footer factory:
```ts
const factory: FooterFactory = (tui, theme, footerData) => {
  const requestRender = () => tui.requestRender?.();
  runtimeState.onInvalidate(requestRender);
  usageRuntime.setOnChange(requestRender);
  const unsubscribe = footerData.onBranchChange?.(() => requestRender());

  return {
    dispose() {
      unsubscribe?.();
      runtimeState.onInvalidate(undefined);
      usageRuntime.setOnChange(undefined);
    },
    invalidate() {
      requestRender();
    },
    render(width: number) { /* ... as above ... */ },
  };
};
```

- [ ] **Step 7: Update the /statusline command handler**

Replace `state.config` and `state.extensionStatuses` with `runtimeState.snapshot()`:

```ts
const snap = runtimeState.snapshot();
const discovered = [...snap.extensionStatuses.keys()].sort((a, b) =>
  a.localeCompare(b),
);
```

And when saving:
```ts
if (!result) return;
try {
  saveConfigToSettings(result, { cwd: ctx.cwd });
  runtimeState.update({ type: "config_reload", config: result });
} catch (error) { /* ... */ }
```

- [ ] **Step 8: Remove dead state references**

Remove any remaining references to the old `state` variable. The `state.ctx` pattern can be replaced by keeping a local `let activeCtx: ExtensionContext | undefined` in the closure — or just using the `ctx` from event handlers directly.

- [ ] **Step 9: Run full verification**

```bash
pnpm lint && pnpm typecheck && pnpm test
```
Expected: all pass. Integration tests in `tests/index.test.ts` verify behavior through the extension API.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor: wire RuntimeStateMachine into index.ts

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
```
