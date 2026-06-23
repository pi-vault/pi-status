# Phase 14: Runtime State Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract mutable state management from `src/index.ts` into a formal event-driven state machine, making state transitions explicit and testable without mocking the ExtensionAPI.

**Architecture:** Hybrid state machine in `src/core/runtime-state.ts`. The state machine owns **discrete state** (ctx reference, config, thinkingLevel, gitBranch, extensionStatuses) that changes at well-defined event boundaries. Render reads **volatile queries** (isIdle, hasPendingMessages, contextUsage, branch, sessionId) live from the ctx reference stored in the state machine. Event handlers in `index.ts` become thin adapters. The state machine fires `onInvalidate` when state changes, triggering re-render.

**Spec:** `docs/superpowers/specs/2026-06-23-runtime-state-machine-design.md`

**Tech Stack:** TypeScript 6, Vitest 4, Biome 2.5, pnpm

**Branch:** `20260623-phase-14-runtime-state-machine`

**Depends on:** Phase 12 (resolve-footer), Phase 13 (editor pure reducer)

**Verification:**
```bash
pnpm lint && pnpm typecheck && pnpm test
```

---

## File Structure

```
src/core/runtime-state.ts        (NEW ~50 lines: events, snapshot, createRuntimeStateMachine)
src/index.ts                     (MODIFIED: uses state machine, thin event adapters)
tests/core/runtime-state.test.ts (NEW: pure state transition tests)
tests/index.test.ts              (existing integration tests — unchanged)
```

### Key design decisions

- Events carry `ctx: ExtensionContext` directly — the state machine stores the reference, not individual fields.
- `RuntimeSnapshot` has 5 fields: `ctx`, `config`, `thinkingLevel`, `gitBranch`, `extensionStatuses`.
- Render reads volatile values (`isIdle()`, `hasPendingMessages()`, `getContextUsage()`, `getBranch()`, `getSessionId()`) live from `snap.ctx` at render time.
- `branch_change` is dispatched from the `onBranchChange` callback, not inside `render()`.
- `config_reload` is dispatched by callers after calling `loadConfig()` — keeps file I/O out of the state machine.
- The render path uses the Phase 12 pipeline: `buildSnapshot()` → `resolveFooter()` → `buildFooterLineFromResolved()`.

---

### Task 1: Create runtime-state.ts

**Files:**
- Create: `src/core/runtime-state.ts`

- [ ] **Step 1: Write the module**

```ts
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { PiStatusConfig } from "../shared/types.ts";

export type RuntimeEvent =
  | { type: "session_start"; ctx: ExtensionContext }
  | { type: "session_tree"; ctx: ExtensionContext }
  | { type: "model_select"; ctx: ExtensionContext }
  | { type: "thinking_level_changed"; ctx: ExtensionContext; level: string }
  | { type: "session_shutdown" }
  | { type: "config_reload"; config: PiStatusConfig }
  | {
      type: "branch_change";
      gitBranch: string | null;
      extensionStatuses: Map<string, string>;
    };

export interface RuntimeSnapshot {
  ctx: ExtensionContext | undefined;
  config: PiStatusConfig;
  thinkingLevel: string;
  gitBranch: string | null;
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
  let ctx: ExtensionContext | undefined;
  let config = initialConfig;
  let thinkingLevel = "medium";
  let gitBranch: string | null = null;
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
        case "model_select":
          ctx = event.ctx;
          break;
        case "thinking_level_changed":
          ctx = event.ctx;
          thinkingLevel = event.level;
          break;
        case "session_shutdown":
          ctx = undefined;
          break;
        case "config_reload":
          config = event.config;
          break;
        case "branch_change":
          gitBranch = event.gitBranch;
          extensionStatuses = event.extensionStatuses;
          break;
      }
      invalidate();
    },
    snapshot(): RuntimeSnapshot {
      return { ctx, config, thinkingLevel, gitBranch, extensionStatuses };
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

The tests use a `stubCtx` helper that creates a minimal object typed as `ExtensionContext`. The state machine treats ctx as an opaque reference, so only identity equality matters.

```ts
import { describe, expect, it, vi } from "vitest";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createRuntimeStateMachine } from "../../src/core/runtime-state.ts";
import type { PiStatusConfig } from "../../src/shared/types.ts";

const defaultConfig: PiStatusConfig = {
  segments: ["model-with-reasoning", "current-dir"],
  extensionSegments: { hidden: [] },
};

function stubCtx(cwd = "/test"): ExtensionContext {
  return { cwd } as unknown as ExtensionContext;
}

describe("RuntimeStateMachine", () => {
  it("returns initial snapshot with defaults", () => {
    const sm = createRuntimeStateMachine(defaultConfig);
    const s = sm.snapshot();
    expect(s.ctx).toBeUndefined();
    expect(s.config).toEqual(defaultConfig);
    expect(s.thinkingLevel).toBe("medium");
    expect(s.gitBranch).toBeNull();
    expect(s.extensionStatuses).toEqual(new Map());
  });

  it("stores ctx on session_start", () => {
    const sm = createRuntimeStateMachine(defaultConfig);
    const ctx = stubCtx("/project");
    sm.update({ type: "session_start", ctx });
    expect(sm.snapshot().ctx).toBe(ctx);
  });

  it("stores ctx on session_tree", () => {
    const sm = createRuntimeStateMachine(defaultConfig);
    const ctx = stubCtx("/other");
    sm.update({ type: "session_tree", ctx });
    expect(sm.snapshot().ctx).toBe(ctx);
  });

  it("stores ctx on model_select", () => {
    const sm = createRuntimeStateMachine(defaultConfig);
    const ctx = stubCtx();
    sm.update({ type: "model_select", ctx });
    expect(sm.snapshot().ctx).toBe(ctx);
  });

  it("stores ctx and level on thinking_level_changed", () => {
    const sm = createRuntimeStateMachine(defaultConfig);
    const ctx = stubCtx();
    sm.update({ type: "thinking_level_changed", ctx, level: "high" });
    const s = sm.snapshot();
    expect(s.ctx).toBe(ctx);
    expect(s.thinkingLevel).toBe("high");
  });

  it("clears ctx on session_shutdown but preserves config and thinkingLevel", () => {
    const sm = createRuntimeStateMachine(defaultConfig);
    sm.update({ type: "session_start", ctx: stubCtx() });
    sm.update({ type: "thinking_level_changed", ctx: stubCtx(), level: "high" });
    sm.update({ type: "session_shutdown" });
    const s = sm.snapshot();
    expect(s.ctx).toBeUndefined();
    expect(s.config).toEqual(defaultConfig);
    expect(s.thinkingLevel).toBe("high");
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

  it("updates gitBranch and extensionStatuses on branch_change", () => {
    const sm = createRuntimeStateMachine(defaultConfig);
    const statuses = new Map([["ext-a", "running"]]);
    sm.update({
      type: "branch_change",
      gitBranch: "feature/x",
      extensionStatuses: statuses,
    });
    const s = sm.snapshot();
    expect(s.gitBranch).toBe("feature/x");
    expect(s.extensionStatuses).toBe(statuses);
  });

  it("fires onInvalidate on every update", () => {
    const sm = createRuntimeStateMachine(defaultConfig);
    const cb = vi.fn();
    sm.onInvalidate(cb);
    sm.update({ type: "thinking_level_changed", ctx: stubCtx(), level: "low" });
    expect(cb).toHaveBeenCalledOnce();
    sm.update({ type: "config_reload", config: defaultConfig });
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("does not fire after onInvalidate(undefined)", () => {
    const sm = createRuntimeStateMachine(defaultConfig);
    const cb = vi.fn();
    sm.onInvalidate(cb);
    sm.onInvalidate(undefined);
    sm.update({ type: "config_reload", config: defaultConfig });
    expect(cb).not.toHaveBeenCalled();
  });

  it("dispose removes listener", () => {
    const sm = createRuntimeStateMachine(defaultConfig);
    const cb = vi.fn();
    sm.onInvalidate(cb);
    sm.dispose();
    sm.update({ type: "config_reload", config: defaultConfig });
    expect(cb).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm test tests/core/runtime-state.test.ts
```
Expected: all 10 tests pass.

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

**Context:** The current `src/index.ts` (235 lines) has a `RuntimeState` type (lines 31-37), a `createRuntimeState()` factory (lines 39-47), a `refresh()` helper (lines 137-141), and a `refreshRuntimeConfig()` helper (lines 70-72). All of these will be replaced by `createRuntimeStateMachine` calls.

The render path currently uses `buildSnapshot()` → `resolveFooter()` → `buildFooterLineFromResolved()` (the Phase 12 pipeline). This is preserved — only the source of `config`, `thinkingLevel`, `gitBranch`, and `extensionStatuses` changes from `state.*` to `runtimeState.snapshot()`.

- [ ] **Step 1: Replace the entire `src/index.ts` with refactored version**

Replace the full contents of `src/index.ts` with:

```ts
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { loadConfig, saveConfigToSettings } from "./core/config.ts";
import { buildSnapshot, resolveFooter } from "./core/resolve-footer.ts";
import { createRuntimeStateMachine } from "./core/runtime-state.ts";
import { createUsageRuntime } from "./core/usage-runtime.ts";
import type { PiStatusConfig } from "./shared/types.ts";
import { createStatusLineEditor } from "./tui/editor.ts";
import { buildFooterLineFromResolved } from "./tui/render.ts";
import { fromPiTheme, noTheme, type StatusLineTheme } from "./tui/theme.ts";

type FooterComponent = {
  render: (width: number) => string[];
  invalidate: () => void;
  dispose?: () => void;
};

type FooterDataLike = {
  getGitBranch: () => string | null;
  getExtensionStatuses: () => ReadonlyMap<string, string>;
  onBranchChange?: (listener: () => void) => (() => void) | undefined;
};

type FooterFactory = (
  tui: { requestRender?: () => void },
  theme: { fg: (color: string, text: string) => string },
  footerData: FooterDataLike,
) => FooterComponent;

const EMPTY_FOOTER_FACTORY: FooterFactory = () => ({
  render(): string[] {
    return [];
  },
  invalidate(): void {},
  dispose(): void {},
});

function isLiveTheme(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { fg?: unknown; bold?: unknown };
  return (
    typeof candidate.fg === "function" && typeof candidate.bold === "function"
  );
}

export default function createExtension(pi: ExtensionAPI): void {
  const runtimeState = createRuntimeStateMachine(loadConfig().config);

  const usageRuntime = createUsageRuntime(pi);

  function installFooter(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;

    const factory: FooterFactory = (tui, theme, footerData) => {
      const requestRender = () => tui.requestRender?.();
      runtimeState.onInvalidate(requestRender);
      usageRuntime.setOnChange(requestRender);
      const unsubscribe = footerData.onBranchChange?.(() => {
        runtimeState.update({
          type: "branch_change",
          gitBranch: footerData.getGitBranch(),
          extensionStatuses: new Map(
            footerData.getExtensionStatuses().entries(),
          ),
        });
      });

      return {
        dispose() {
          unsubscribe?.();
          runtimeState.onInvalidate(undefined);
          usageRuntime.setOnChange(undefined);
        },
        invalidate() {
          requestRender();
        },
        render(width: number) {
          const snap = runtimeState.snapshot();
          const activeCtx = snap.ctx ?? ctx;
          const statusTheme = fromPiTheme(theme);
          const snapshot = buildSnapshot({
            model: activeCtx.model,
            cwd: activeCtx.cwd,
            thinkingLevel: snap.thinkingLevel,
            gitBranch: snap.gitBranch,
            isIdle: activeCtx.isIdle(),
            hasPendingMessages: activeCtx.hasPendingMessages(),
            contextUsage: activeCtx.getContextUsage(),
            branch: activeCtx.sessionManager.getBranch() as unknown[],
            sessionId: activeCtx.sessionManager.getSessionId(),
            usageState: usageRuntime.getState(),
            extensionStatuses: snap.extensionStatuses,
          });
          const { segments, extensionStatusText } = resolveFooter(
            snapshot,
            snap.config,
            statusTheme,
          );
          const line = buildFooterLineFromResolved(
            segments,
            extensionStatusText,
            statusTheme,
            width,
          );
          return [line];
        },
      };
    };

    ctx.ui.setFooter(factory as never);
  }

  function installEmptyFooter(ctx: ExtensionContext): void {
    if (ctx.hasUI) ctx.ui.setFooter(EMPTY_FOOTER_FACTORY as never);
  }

  pi.registerCommand("statusline", {
    description: "Configure statusline segments and extension-status visibility",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("/statusline requires interactive UI", "warning");
        return;
      }

      const snap = runtimeState.snapshot();
      const discovered = [...snap.extensionStatuses.keys()].sort((a, b) =>
        a.localeCompare(b),
      );

      let result: PiStatusConfig | null = null;
      try {
        installEmptyFooter(ctx);
        result = await ctx.ui.custom<PiStatusConfig | null>(
          (tui, theme, _keys, done) => {
            const editorSnap = runtimeState.snapshot();
            const activeCtx = editorSnap.ctx ?? ctx;
            const menuTheme: StatusLineTheme = isLiveTheme(theme)
              ? fromPiTheme(theme)
              : noTheme;
            const snapshot = buildSnapshot({
              model: activeCtx.model,
              cwd: activeCtx.cwd,
              thinkingLevel: editorSnap.thinkingLevel,
              gitBranch: editorSnap.gitBranch,
              isIdle: activeCtx.isIdle(),
              hasPendingMessages: activeCtx.hasPendingMessages(),
              contextUsage: activeCtx.getContextUsage(),
              branch: activeCtx.sessionManager.getBranch() as unknown[],
              sessionId: activeCtx.sessionManager.getSessionId(),
              usageState: usageRuntime.getState(),
              extensionStatuses: editorSnap.extensionStatuses,
            });
            return createStatusLineEditor({
              config: editorSnap.config,
              discoveredStatuses: discovered,
              previewInput: snapshot,
              theme: menuTheme,
              done,
              requestRender: () => tui.requestRender?.(),
              usageAvailable: usageRuntime.getAvailable(),
            });
          },
        );
      } finally {
        installFooter(ctx);
      }

      if (!result) return;

      try {
        saveConfigToSettings(result, { cwd: ctx.cwd });
        runtimeState.update({ type: "config_reload", config: result });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to save statusline settings";
        ctx.ui.notify(message, "warning");
      }
    },
  });

  pi.on("session_start", (_event, ctx) => {
    usageRuntime.requestCurrent();
    runtimeState.update({ type: "session_start", ctx });
    runtimeState.update({
      type: "config_reload",
      config: loadConfig({ cwd: ctx.cwd }).config,
    });
    installFooter(ctx);
  });

  pi.on("session_tree", (_event, ctx) => {
    runtimeState.update({ type: "session_tree", ctx });
    runtimeState.update({
      type: "config_reload",
      config: loadConfig({ cwd: ctx.cwd }).config,
    });
    installFooter(ctx);
  });

  pi.on("model_select", (_event, ctx) => {
    runtimeState.update({ type: "model_select", ctx });
  });

  pi.on("thinking_level_select", (_event, ctx) => {
    runtimeState.update({
      type: "thinking_level_changed",
      ctx,
      level: String(pi.getThinkingLevel()),
    });
  });

  pi.on("session_shutdown", (_event, ctx) => {
    runtimeState.update({ type: "session_shutdown" });
    usageRuntime.setOnChange(undefined);
    if (ctx.hasUI) ctx.ui.setFooter(undefined);
  });
}
```

**What changed from the original `src/index.ts`:**
- **Removed:** `RuntimeState` type (was lines 31-37), `createRuntimeState()` (was lines 39-47), `refreshRuntimeConfig()` (was lines 70-72), `refresh()` (was lines 137-141)
- **Added:** `import { createRuntimeStateMachine }` from `./core/runtime-state.ts`
- **Replaced:** `const state = createRuntimeState()` → `const runtimeState = createRuntimeStateMachine(loadConfig().config)`
- **Event handlers:** Each handler now dispatches typed events via `runtimeState.update(...)` instead of mutating `state.*` fields directly
- **Footer factory:** `state.requestRender` wiring replaced by `runtimeState.onInvalidate(requestRender)`. `onBranchChange` callback dispatches `branch_change` events instead of storing values on `state`.
- **Render path:** Reads `thinkingLevel`, `gitBranch`, `extensionStatuses`, `config` from `runtimeState.snapshot()`. Reads `model`, `cwd`, `isIdle()`, `hasPendingMessages()`, `contextUsage`, `branch`, `sessionId` live from `snap.ctx`.
- **/statusline handler:** Reads from `runtimeState.snapshot()` instead of `state.*`. On save, dispatches `config_reload` event instead of setting `state.config` directly.

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```
Expected: PASS.

- [ ] **Step 3: Run full verification**

```bash
pnpm lint && pnpm typecheck && pnpm test
```
Expected: all pass. The integration tests in `tests/index.test.ts` exercise the full event→render pipeline and should pass unchanged — the same values reach the render path, just sourced from the state machine snapshot instead of the old `state` object.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: wire RuntimeStateMachine into index.ts

Replace RuntimeState/createRuntimeState with createRuntimeStateMachine.
Event handlers dispatch typed events. Footer factory wires onInvalidate
for re-render. Render reads config/thinkingLevel/gitBranch from snapshot,
volatile queries (isIdle, model, etc.) live from ctx.

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
```
