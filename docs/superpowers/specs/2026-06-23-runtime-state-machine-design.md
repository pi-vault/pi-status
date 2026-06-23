# Phase 14: Runtime State Machine Design

**Goal:** Extract mutable state management from `src/index.ts` into a formal event-driven state machine (`src/core/runtime-state.ts`), making state transitions explicit and testable without mocking the ExtensionAPI.

**Motivations:** Testability, explicitness of state transitions, slimming index.ts to a thin wiring layer.

**Branch:** `20260623-phase-14-runtime-state-machine`

**Depends on:** Phase 12 (resolve-footer), Phase 13 (editor pure reducer)

---

## Architecture: Hybrid State Machine

The state machine owns **discrete state** that changes at well-defined event boundaries. Render reads **volatile queries** (isIdle, hasPendingMessages, contextUsage, branch) live from the ctx reference stored in the state machine.

### What the state machine owns

| Field               | Type                            | Updated by                                                                          |
| ------------------- | ------------------------------- | ----------------------------------------------------------------------------------- |
| `ctx`               | `ExtensionContext \| undefined` | session_start, session_tree, model_select, thinking_level_changed, session_shutdown |
| `config`            | `PiStatusConfig`                | config_reload                                                                       |
| `thinkingLevel`     | `string`                        | thinking_level_changed                                                              |
| `gitBranch`         | `string \| null`                | branch_change                                                                       |
| `extensionStatuses` | `Map<string, string>`           | branch_change                                                                       |

### What render reads live from ctx

- `ctx.model` — current model
- `ctx.cwd` — working directory
- `ctx.isIdle()` — whether agent is idle
- `ctx.hasPendingMessages()` — queued messages
- `ctx.getContextUsage()` — token usage
- `ctx.sessionManager.getBranch()` — conversation branch
- `ctx.sessionManager.getSessionId()` — session identifier

### What render reads from usageRuntime

- `usageRuntime.getState()` — provider usage windows

---

## Events

```ts
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
```

Design choices:

- Events carry `ctx` directly (the state machine stores the reference, not individual fields).
- `session_start`, `session_tree`, `model_select` all store ctx. They are separate event types for traceability.
- `thinking_level_changed` carries the level explicitly rather than the state machine calling `pi.getThinkingLevel()` — keeps the state machine independent of the ExtensionAPI.
- `branch_change` is dispatched from the `onBranchChange` callback (not from inside render).
- `config_reload` is dispatched by callers after calling `loadConfig()` — keeps file I/O out of the state machine.

---

## Snapshot Interface

```ts
export interface RuntimeSnapshot {
  ctx: ExtensionContext | undefined;
  config: PiStatusConfig;
  thinkingLevel: string;
  gitBranch: string | null;
  extensionStatuses: Map<string, string>;
}
```

Five fields. Render reads volatile values from `snap.ctx` directly.

---

## State Machine Interface

```ts
export interface RuntimeStateMachine {
  update(event: RuntimeEvent): void;
  snapshot(): RuntimeSnapshot;
  onInvalidate(cb: (() => void) | undefined): void;
  dispose(): void;
}

export function createRuntimeStateMachine(
  initialConfig: PiStatusConfig,
): RuntimeStateMachine;
```

- `update` applies an event and fires onInvalidate.
- `snapshot` returns the current state (cheap — returns a fresh object with the current values).
- `onInvalidate` registers a single listener (or clears it with `undefined`).
- `dispose` removes the listener.

---

## Implementation

```ts
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
    onInvalidate(cb) {
      listener = cb;
    },
    dispose() {
      listener = undefined;
    },
  };
}
```

- `session_shutdown` clears ctx but preserves config (config persists across sessions).
- `invalidate()` fires on every update unconditionally.

---

## Wiring in index.ts

### Removed

- `RuntimeState` type (lines 31-37)
- `createRuntimeState()` function (lines 39-47)
- `state.*` references throughout
- `refresh()` helper function

### Added

- `import { createRuntimeStateMachine } from "./core/runtime-state.ts"`
- `const runtimeState = createRuntimeStateMachine(loadConfig().config)` at top of `createExtension`

### Event handlers

```ts
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
```

### Footer factory

```ts
const factory: FooterFactory = (tui, theme, footerData) => {
  const requestRender = () => tui.requestRender?.();
  runtimeState.onInvalidate(requestRender);
  usageRuntime.setOnChange(requestRender);
  const unsubscribe = footerData.onBranchChange?.(() => {
    runtimeState.update({
      type: "branch_change",
      gitBranch: footerData.getGitBranch(),
      extensionStatuses: new Map(footerData.getExtensionStatuses().entries()),
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
```

### /statusline command

Reads from `runtimeState.snapshot()`:

```ts
const snap = runtimeState.snapshot();
const discovered = [...snap.extensionStatuses.keys()].sort((a, b) =>
  a.localeCompare(b),
);
// ...
// On save:
runtimeState.update({ type: "config_reload", config: result });
```

---

## File Structure

```
src/core/runtime-state.ts        (NEW: ~50 lines)
src/index.ts                     (MODIFIED: slimmed, uses state machine)
tests/core/runtime-state.test.ts (NEW: pure state transition tests)
```

---

## Testing Strategy

### New unit tests (`tests/core/runtime-state.test.ts`)

Pure tests, no mocking needed:

- Initial snapshot has correct defaults
- Each event type updates the correct field(s)
- `session_shutdown` clears ctx, preserves config
- `onInvalidate` fires on every update
- `onInvalidate(undefined)` stops notifications
- `dispose` removes the listener
- Separate event types (session_start vs session_tree) all store ctx correctly

### Existing integration tests (`tests/index.test.ts`)

Pass unchanged. They test through the extension API and verify rendered output. The behavior is identical — same values reach the render path.

---

## Success Criteria

1. `pnpm lint && pnpm typecheck && pnpm test` passes
2. `src/index.ts` no longer contains `RuntimeState` type or mutable state variables
3. All state transitions in index.ts go through `runtimeState.update(...)`
4. `tests/core/runtime-state.test.ts` covers all event types
5. No behavioral change in rendered footer output

---

## Verification

```bash
pnpm lint && pnpm typecheck && pnpm test
```
