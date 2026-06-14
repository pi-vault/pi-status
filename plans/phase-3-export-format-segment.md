# Phase 3: Export `formatSegment` + full test coverage

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export `formatSegment` from `render.ts` so individual segment formatters can be tested in isolation. Add comprehensive tests for all 16 segment types including edge cases for colors, null handling, and formatting.

**Preconditions:** Phases 1 and 2 must be complete (no code dependency, but keeps the commit history sequential).

**Tech Stack:** TypeScript 6, Vitest 4, Biome 2 (lint + format), pnpm

---

## File Map

| File                   | Action | Responsibility                                 |
| ---------------------- | ------ | ---------------------------------------------- |
| `src/tui/render.ts`    | Modify | Export `formatSegment`                         |
| `tests/render.test.ts` | Modify | Add full per-segment test coverage (~55 tests) |

---

## Task 1: Export `formatSegment`

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

## Task 2: Add full `formatSegment` test coverage

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
git commit -m "refactor: export formatSegment with full test coverage"
```

---

## Final Verification

After this phase is complete (all 3 phases done):

- [ ] **Final check:** `pnpm check` (lint + typecheck + all tests)
- [ ] **Verify no untracked files:** `git status`
