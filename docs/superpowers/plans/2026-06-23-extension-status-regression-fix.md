# Extension Status Regression Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore extension status visibility on the first footer render and keep `/statusline` discovery in sync by moving provider-owned state out of `RuntimeStateMachine`.

**Architecture:** Keep `RuntimeStateMachine` focused on durable session/config state (`ctx`, `config`, `thinkingLevel`). Add a tiny footer-provider cache in `src/index.ts` for `gitBranch` and `extensionStatuses`, refresh it from `footerData` during `render()` and `onBranchChange()`, and use that cache for both footer rendering and `/statusline` discovery.

**Tech Stack:** TypeScript, Vitest, Pi extension API (`ctx.ui.setFooter`, `footerData`), Node.js

---

## File Structure

- **Modify:** `src/index.ts`
  - Own a small `FooterProviderState` cache.
  - Add one helper to refresh provider data from `footerData`.
  - Use provider cache instead of runtime state for `gitBranch`, `extensionStatuses`, and `/statusline` discovery.
- **Modify:** `src/core/runtime-state.ts`
  - Remove `branch_change`, `gitBranch`, and `extensionStatuses` from the state machine.
  - Keep only `ctx`, `config`, `thinkingLevel`, and invalidation plumbing.
- **Modify:** `tests/index.test.ts`
  - Add regression coverage for initial render, `/statusline` discovery from the cache, and reactive footer updates.
- **Modify:** `tests/core/runtime-state.test.ts`
  - Narrow unit tests to the new runtime-state ownership boundary.

### Task 1: Add integration regression coverage for footer-provider state

**Files:**
- Modify: `tests/index.test.ts:16-120`
- Modify: `tests/index.test.ts:207-560`
- Test: `tests/index.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these three tests inside `describe("extension wiring", ...)` in `tests/index.test.ts`.

```ts
  it("shows extension statuses on initial render without waiting for onBranchChange", () => {
    const handlers = new Map<
      string,
      Array<(event: unknown, ctx: ExtensionContext) => void>
    >();
    let footerFactory:
      | ((...args: unknown[]) => { render: (width: number) => string[] })
      | undefined;
    const requestRender = vi.fn();
    const events = createBus();
    const registerCommand = vi.fn();

    const pi = {
      events,
      on(event: string, handler: (event: unknown, ctx: ExtensionContext) => void) {
        handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      },
      registerCommand,
      getThinkingLevel: () => "medium",
    } as unknown as ExtensionAPI;

    createExtension(pi);

    const ctx = createContext({
      ui: { ...createContext().ui, setFooter: (x: unknown) => (footerFactory = x as never) },
    });

    for (const h of handlers.get("session_start") ?? []) h({}, ctx);

    const footer = footerFactory?.(
      { requestRender },
      { fg: (_c: string, t: string) => t, rainbow: (t: string) => t },
      {
        getGitBranch: () => "main",
        getExtensionStatuses: () => new Map([["alpha", "alpha: ready"]]),
        onBranchChange: () => () => {},
      },
    );

    expect(footer?.render(200).join("\n")).toContain("ready");
    expect(requestRender).not.toHaveBeenCalled();
  });

  it("passes cached extension statuses into /statusline discovery after footer render", async () => {
    const handlers = new Map<
      string,
      Array<(event: unknown, ctx: ExtensionContext) => void>
    >();
    let footerFactory:
      | ((...args: unknown[]) => { render: (width: number) => string[] })
      | undefined;
    const events = createBus();
    const registerCommand = vi.fn();
    const customMock = vi.fn(async (..._args: unknown[]) => null);

    const pi = {
      events,
      on(event: string, handler: (event: unknown, ctx: ExtensionContext) => void) {
        handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      },
      registerCommand,
      getThinkingLevel: () => "medium",
    } as unknown as ExtensionAPI;

    createExtension(pi);

    const ctx = createContext({
      ui: {
        ...createContext().ui,
        setFooter: (x: unknown) => (footerFactory = x as never),
        custom: customMock as unknown as ExtensionContext["ui"]["custom"],
      },
    });

    for (const h of handlers.get("session_start") ?? []) h({}, ctx);

    const footer = footerFactory?.(
      { requestRender: () => {} },
      { fg: (_c: string, t: string) => t, rainbow: (t: string) => t },
      {
        getGitBranch: () => "main",
        getExtensionStatuses: () =>
          new Map([
            ["beta-status", "beta-status: syncing"],
            ["alpha-status", "alpha-status: ready"],
          ]),
        onBranchChange: () => () => {},
      },
    );

    expect(footer?.render(200).join("\n")).toContain("ready");

    const commandCall = registerCommand.mock.calls.find(
      ([name]) => name === "statusline",
    );
    const handler = (
      commandCall?.[1] as {
        handler: (args: string, ctx: ExtensionContext) => Promise<void>;
      }
    ).handler;

    await handler("", ctx);

    const factory = customMock.mock.calls[0]?.[0] as
      | ((...args: unknown[]) => { render: (width: number) => string[] })
      | undefined;
    const component = factory?.(
      { requestRender: () => {} },
      { fg: (_c: string, t: string) => t, bold: (t: string) => t, dim: (t: string) => t, rainbow: (t: string) => t },
      {},
      () => {},
    );
    const lines = component?.render(200).join("\n") ?? "";

    expect(lines).toContain("alpha-status");
    expect(lines).toContain("beta-status");
  });

  it("re-renders with updated extension statuses after onBranchChange fires", () => {
    const handlers = new Map<
      string,
      Array<(event: unknown, ctx: ExtensionContext) => void>
    >();
    let footerFactory:
      | ((...args: unknown[]) => { render: (width: number) => string[] })
      | undefined;
    const requestRender = vi.fn();
    const events = createBus();
    const registerCommand = vi.fn();
    let branchListener: (() => void) | undefined;
    let statusEntries: Array<[string, string]> = [["alpha", "alpha: ready"]];

    const pi = {
      events,
      on(event: string, handler: (event: unknown, ctx: ExtensionContext) => void) {
        handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      },
      registerCommand,
      getThinkingLevel: () => "medium",
    } as unknown as ExtensionAPI;

    createExtension(pi);

    const ctx = createContext({
      ui: { ...createContext().ui, setFooter: (x: unknown) => (footerFactory = x as never) },
    });

    for (const h of handlers.get("session_start") ?? []) h({}, ctx);

    const footer = footerFactory?.(
      { requestRender },
      { fg: (_c: string, t: string) => t, rainbow: (t: string) => t },
      {
        getGitBranch: () => "main",
        getExtensionStatuses: () => new Map(statusEntries),
        onBranchChange: (cb: () => void) => {
          branchListener = cb;
          return () => {
            branchListener = undefined;
          };
        },
      },
    );

    expect(footer?.render(200).join("\n")).toContain("ready");

    statusEntries = [["alpha", "alpha: done"]];
    branchListener?.();

    expect(requestRender).toHaveBeenCalledTimes(1);
    expect(footer?.render(200).join("\n")).toContain("done");
  });
```

- [ ] **Step 2: Run the targeted test file to verify the new regression tests fail**

Run:

```bash
pnpm vitest run tests/index.test.ts --reporter=dot
```

Expected: FAIL. At least these two new assertions should fail on the current code:

- `shows extension statuses on initial render without waiting for onBranchChange`
- `passes cached extension statuses into /statusline discovery after footer render`

Reason: the current implementation only populates provider-owned state from `onBranchChange()`.

- [ ] **Step 3: Commit only the failing regression tests**

```bash
git add tests/index.test.ts
git commit -m "test: capture extension status regression"
```

### Task 2: Narrow the runtime state machine to durable session/config state

**Files:**
- Modify: `tests/core/runtime-state.test.ts:15-118`
- Modify: `src/core/runtime-state.ts:4-82`
- Test: `tests/core/runtime-state.test.ts`

- [ ] **Step 1: Rewrite the runtime-state unit test to remove provider-owned state expectations**

Replace the initial-snapshot and branch-change assertions in `tests/core/runtime-state.test.ts` with the narrower version below.

```ts
describe("RuntimeStateMachine", () => {
  it("returns initial snapshot with only durable state fields", () => {
    const sm = createRuntimeStateMachine(defaultConfig);
    const s = sm.snapshot();
    expect(s.ctx).toBeUndefined();
    expect(s.config).toEqual(defaultConfig);
    expect(s.thinkingLevel).toBe("medium");
    expect(Object.keys(s).sort()).toEqual(["config", "ctx", "thinkingLevel"]);
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

- [ ] **Step 2: Run the runtime-state unit tests to verify they fail against the current implementation**

Run:

```bash
pnpm vitest run tests/core/runtime-state.test.ts --reporter=dot
```

Expected: FAIL. The new `returns initial snapshot with only durable state fields` assertion should fail because the current snapshot still includes `gitBranch` and `extensionStatuses`.

- [ ] **Step 3: Implement the narrowed runtime state machine**

Replace the contents of `src/core/runtime-state.ts` with this version.

```ts
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { PiStatusConfig } from "../shared/types.ts";

export type RuntimeEvent =
  | { type: "session_start"; ctx: ExtensionContext }
  | { type: "session_tree"; ctx: ExtensionContext }
  | { type: "model_select"; ctx: ExtensionContext }
  | { type: "thinking_level_changed"; ctx: ExtensionContext; level: string }
  | { type: "session_shutdown" }
  | { type: "config_reload"; config: PiStatusConfig };

export interface RuntimeSnapshot {
  ctx: ExtensionContext | undefined;
  config: PiStatusConfig;
  thinkingLevel: string;
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
      }
      invalidate();
    },
    snapshot(): RuntimeSnapshot {
      return { ctx, config, thinkingLevel };
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

- [ ] **Step 4: Run the runtime-state tests again to verify they pass**

Run:

```bash
pnpm vitest run tests/core/runtime-state.test.ts --reporter=dot
```

Expected: PASS.

- [ ] **Step 5: Commit the narrowed state-machine contract**

```bash
git add src/core/runtime-state.ts tests/core/runtime-state.test.ts
git commit -m "refactor: narrow runtime state ownership"
```

### Task 3: Implement the footer-provider cache and wire `/statusline` to it

**Files:**
- Modify: `src/index.ts:14-221`
- Test: `tests/index.test.ts`

- [ ] **Step 1: Replace the footer wiring in `src/index.ts` with a provider-cache-based implementation**

Make these exact edits in `src/index.ts`.

1. Add the new cache type below `FooterFactory`:

```ts
type FooterProviderState = {
  gitBranch: string | null;
  extensionStatuses: Map<string, string>;
};
```

2. Add the cache and helper at the top of `createExtension`:

```ts
  const footerProviderState: FooterProviderState = {
    gitBranch: null,
    extensionStatuses: new Map(),
  };

  function refreshFooterProviderState(footerData: FooterDataLike): void {
    footerProviderState.gitBranch = footerData.getGitBranch();
    footerProviderState.extensionStatuses = new Map(
      footerData.getExtensionStatuses().entries(),
    );
  }
```

3. Replace the `installFooter` factory body with this version:

```ts
  function installFooter(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;

    const factory: FooterFactory = (tui, theme, footerData) => {
      const requestRender = () => tui.requestRender?.();
      runtimeState.onInvalidate(requestRender);
      usageRuntime.setOnChange(requestRender);
      const unsubscribe = footerData.onBranchChange?.(() => {
        refreshFooterProviderState(footerData);
        requestRender();
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
          refreshFooterProviderState(footerData);

          const snap = runtimeState.snapshot();
          const activeCtx = snap.ctx ?? ctx;
          const statusTheme = fromPiTheme(theme);
          const snapshot = buildSnapshot({
            model: activeCtx.model,
            cwd: activeCtx.cwd,
            thinkingLevel: snap.thinkingLevel,
            gitBranch: footerProviderState.gitBranch,
            isIdle: activeCtx.isIdle(),
            hasPendingMessages: activeCtx.hasPendingMessages(),
            contextUsage: activeCtx.getContextUsage(),
            branch: activeCtx.sessionManager.getBranch() as unknown[],
            sessionId: activeCtx.sessionManager.getSessionId(),
            usageState: usageRuntime.getState(),
            extensionStatuses: footerProviderState.extensionStatuses,
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
```

4. Replace `/statusline` discovery and preview snapshot construction with this version:

```ts
      const snap = runtimeState.snapshot();
      const discovered = [...footerProviderState.extensionStatuses.keys()].sort((a, b) =>
        a.localeCompare(b),
      );
```

```ts
            const editorSnap = runtimeState.snapshot();
            const activeCtx = editorSnap.ctx ?? ctx;
            const menuTheme: StatusLineTheme = isLiveTheme(theme)
              ? fromPiTheme(theme)
              : noTheme;
            const snapshot = buildSnapshot({
              model: activeCtx.model,
              cwd: activeCtx.cwd,
              thinkingLevel: editorSnap.thinkingLevel,
              gitBranch: footerProviderState.gitBranch,
              isIdle: activeCtx.isIdle(),
              hasPendingMessages: activeCtx.hasPendingMessages(),
              contextUsage: activeCtx.getContextUsage(),
              branch: activeCtx.sessionManager.getBranch() as unknown[],
              sessionId: activeCtx.sessionManager.getSessionId(),
              usageState: usageRuntime.getState(),
              extensionStatuses: footerProviderState.extensionStatuses,
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
```

No other event handler logic changes are required in this file.

- [ ] **Step 2: Run the targeted integration tests to verify they now pass**

Run:

```bash
pnpm vitest run tests/index.test.ts --reporter=dot
```

Expected: PASS. In particular, the three regression tests from Task 1 should now pass.

- [ ] **Step 3: Commit the provider-cache implementation**

```bash
git add src/index.ts tests/index.test.ts
git commit -m "fix: restore extension status provider ownership"
```

### Task 4: Final verification

**Files:**
- Verify only: `src/index.ts`
- Verify only: `src/core/runtime-state.ts`
- Verify only: `tests/index.test.ts`
- Verify only: `tests/core/runtime-state.test.ts`

- [ ] **Step 1: Run the narrow regression-focused suite**

Run:

```bash
pnpm vitest run tests/index.test.ts tests/core/runtime-state.test.ts --reporter=dot
```

Expected: PASS.

- [ ] **Step 2: Run the full project checks**

Run:

```bash
pnpm check
```

Expected: PASS for Biome lint, TypeScript, and the full Vitest suite.

- [ ] **Step 3: Confirm the working tree is clean after verification**

Run:

```bash
git status --short
```

Expected: no output.

## Self-Review

### Spec coverage

- **Initial footer render shows extension status text:** covered by Task 1 test 1 and Task 3 implementation.
- **`/statusline` discovers extension status keys after footer render:** covered by Task 1 test 2 and Task 3 implementation.
- **Reactive updates still work:** covered by Task 1 test 3 and Task 3 implementation.
- **Runtime state machine no longer owns provider data:** covered by Task 2 tests and implementation.
- **Full verification:** covered by Task 4.

### Placeholder scan

- No `TODO`, `TBD`, or deferred steps remain.
- Each code-changing step includes concrete code.
- Each verification step includes exact commands and expected outcomes.

### Type consistency

- `FooterProviderState` is defined once in `src/index.ts` and used consistently for `gitBranch` and `extensionStatuses`.
- `RuntimeSnapshot` contains only `ctx`, `config`, and `thinkingLevel` after Task 2.
- `refreshFooterProviderState(footerData: FooterDataLike)` is the only helper introduced for provider refresh and is used in both render and callback paths.