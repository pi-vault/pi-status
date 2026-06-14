# Phase 1: Extract `buildSnapshot` module

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate duplicated `FooterRenderInput` assembly into a single `buildSnapshot` function. Absorb `aggregateBranchTotals` as an internal implementation detail with direct test coverage.

**Preconditions:** None — this is the first phase.

**Tech Stack:** TypeScript 6, Vitest 4, Biome 2 (lint + format), pnpm

---

## File Map

| File                     | Action | Responsibility                                                                   |
| ------------------------ | ------ | -------------------------------------------------------------------------------- |
| `src/core/snapshot.ts`   | Create | Assemble `FooterRenderInput` from narrow inputs; absorbs `aggregateBranchTotals` |
| `tests/snapshot.test.ts` | Create | Tests for `buildSnapshot` (branch totals, run state, pass-through)               |
| `src/index.ts`           | Modify | Remove duplicated assembly + `aggregateBranchTotals`; call `buildSnapshot`       |

---

## Task 1: Write failing tests for `buildSnapshot`

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

## Task 2: Implement `buildSnapshot`

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

## Task 3: Update `index.ts` to use `buildSnapshot`

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
git commit -m "refactor: extract buildSnapshot module"
```
