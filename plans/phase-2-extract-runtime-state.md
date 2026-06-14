# Phase 2: Extract `RuntimeState` object

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group the 5 mutable closure variables in `index.ts` into a structured `RuntimeState` object. The closure becomes coordination-only — state access is explicit through `state.xxx`.

**Preconditions:** Phase 1 must be complete (the `buildSnapshot` import and calls must already exist in `index.ts`).

**Tech Stack:** TypeScript 6, Vitest 4, Biome 2 (lint + format), pnpm

---

## File Map

| File           | Action | Responsibility                                          |
| -------------- | ------ | ------------------------------------------------------- |
| `src/index.ts` | Modify | Group mutable vars into `RuntimeState`; update all refs |

---

## Task 1: Group mutable closure variables into `RuntimeState`

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

In `installFooter`, the factory setup:

```typescript
const factory: FooterFactory = (tui, theme, footerData) => {
  state.requestRender = () => tui.requestRender?.();
  usageRuntime.setOnChange(state.requestRender);
  const unsubscribe = footerData.onBranchChange?.(() => tui.requestRender?.());

  return {
    dispose() {
      unsubscribe?.();
      if (state.requestRender === tui.requestRender)
        state.requestRender = undefined;
      usageRuntime.setOnChange(state.requestRender);
    },
    invalidate() {
      state.requestRender?.();
    },
    render(width: number) {
      /* ... see render block below ... */
    },
  };
};
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
git commit -m "refactor: group extension mutable state into RuntimeState"
```
