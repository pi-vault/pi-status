# Phase 6: New Context Remaining Format

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change `context-remaining` from `150k left` (single color) to `12.6k / 200k (6%)` with mixed threshold colors. Remaining tokens and percentage are colored; separator and context window are dim. After this phase, the old `contextColor` function is unused and removed.

**Architecture:** Add `contextRemainingColor()` function, rewrite `case "context-remaining"`, delete the old `contextColor()`, update tests.

**Tech Stack:** TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-06-21-statusline-editor-refactor-design.md`

**Verification:** Run `pnpm check` (lint + typecheck + tests) at the end.

**Prerequisite:** Phase 5 committed.

**New thresholds (on remaining %):** success > 40%, warning <= 40%, error <= 20%.

---

### Task 6.1: Write failing tests for new context-remaining format

**Files:**
- Modify: `tests/render.test.ts`

- [ ] **Step 1: Replace the `context-remaining` test suite**

Remove the entire `describe("formatSegment — context-remaining", ...)` block and replace with:

```ts
describe("formatSegment — context-remaining", () => {
  it("formats as remaining / window (remainingPercent%)", () => {
    const result = formatSegment(
      "context-remaining",
      segmentInput({
        contextUsage: { tokens: 50000, contextWindow: 200000, percent: 25 },
      }),
      identityTheme,
    );
    expect(result).toEqual(["150k / 200k (75%)", null]);
  });

  it("applies success color when remaining percent is above 40%", () => {
    const result = formatSegment(
      "context-remaining",
      segmentInput({
        contextUsage: { tokens: 50000, contextWindow: 200000, percent: 25 },
      }),
      markerTheme,
    );
    expect(result?.[0]).toContain("[success:150k]");
    expect(result?.[0]).toContain("[success:75%]");
    expect(result?.[0]).toContain("[dim:200k]");
  });

  it("applies warning color when remaining percent is between 21-40%", () => {
    const result = formatSegment(
      "context-remaining",
      segmentInput({
        contextUsage: { tokens: 140000, contextWindow: 200000, percent: 70 },
      }),
      markerTheme,
    );
    expect(result?.[0]).toContain("[warning:60k]");
    expect(result?.[0]).toContain("[warning:30%]");
  });

  it("applies error color when remaining percent is 20% or less", () => {
    const result = formatSegment(
      "context-remaining",
      segmentInput({
        contextUsage: { tokens: 180000, contextWindow: 200000, percent: 90 },
      }),
      markerTheme,
    );
    expect(result?.[0]).toContain("[error:20k]");
    expect(result?.[0]).toContain("[error:10%]");
  });

  it("clamps remaining to zero when tokens exceed window", () => {
    const result = formatSegment(
      "context-remaining",
      segmentInput({
        contextUsage: { tokens: 250000, contextWindow: 200000, percent: 100 },
      }),
      identityTheme,
    );
    expect(result).toEqual(["0 / 200k (0%)", null]);
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

  it("returns null when contextUsage is undefined", () => {
    const result = formatSegment(
      "context-remaining",
      segmentInput(),
      identityTheme,
    );
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify tests fail**

Run: `pnpm vitest run tests/render.test.ts -t "formatSegment — context-remaining"`

Expected: FAIL — output is still the old `"150k left"` format.

### Task 6.2: Implement new context-remaining format

**Files:**
- Modify: `src/tui/render.ts`

- [ ] **Step 1: Add `contextRemainingColor` function**

In `src/tui/render.ts`, add a new function after `contextUsedColor`:

```ts
function contextRemainingColor(
  remainingPercent: number,
): "success" | "warning" | "error" {
  if (remainingPercent <= 20) return "error";
  if (remainingPercent <= 40) return "warning";
  return "success";
}
```

- [ ] **Step 2: Rewrite the `context-remaining` case in `formatSegment`**

Replace the existing `case "context-remaining"` block:

```ts
    case "context-remaining": {
      const total = input.contextUsage?.tokens;
      const window = input.contextUsage?.contextWindow;
      const percent = input.contextUsage?.percent;
      if (
        total === undefined || total === null || window === undefined ||
        percent === undefined || percent === null
      ) {
        return null;
      }
      const remaining = Math.max(0, window - total);
      return [`${formatCompactNumber(remaining)} left`, contextColor(percent)];
    }
```

with:

```ts
    case "context-remaining": {
      const tokens = input.contextUsage?.tokens;
      const ctxWindow = input.contextUsage?.contextWindow;
      const percent = input.contextUsage?.percent;
      if (tokens == null || ctxWindow === undefined || percent == null) return null;
      const remaining = Math.max(0, ctxWindow - tokens);
      const remainingPercent = Math.max(0, Math.round(100 - percent));
      const c = contextRemainingColor(remainingPercent);
      const dim = (s: string) => theme.fg("dim", s);
      return [
        `${theme.fg(c, formatCompactNumber(remaining))}${dim(" / ")}${dim(formatCompactNumber(ctxWindow))}${dim(" (")}${theme.fg(c, `${remainingPercent}%`)}${dim(")")}`,
        null,
      ];
    }
```

- [ ] **Step 3: Remove the old `contextColor` function**

The `contextColor` function is no longer used by any case. Remove it:

```ts
function contextColor(
  percent: number | null | undefined,
): "success" | "warning" | "error" | "dim" {
  if (percent === undefined || percent === null) return "dim";
  if (percent < 70) return "success";
  if (percent < 90) return "warning";
  return "error";
}
```

Delete the entire function.

### Task 6.3: Update editor description for context-remaining

**Files:**
- Modify: `src/tui/editor.ts`

- [ ] **Step 1: Update the description in SEGMENT_ORDER**

In `src/tui/editor.ts`, change the `context-remaining` entry's description:

```ts
  {
    id: "context-remaining",
    label: "Context Remaining",
    description:
      "Percentage of context window remaining (omitted when unknown)",
  },
```

to:

```ts
  {
    id: "context-remaining",
    label: "Context Remaining",
    description:
      "Context tokens remaining vs window size (omitted when unknown)",
  },
```

### Task 6.4: Verify Phase 6

- [ ] **Step 1: Run the full check suite**

Run: `pnpm check`

Expected: All lint, typecheck, and tests pass.

- [ ] **Step 2: Commit**

```bash
git add src/tui/render.ts src/tui/editor.ts tests/render.test.ts
git commit -m "feat: new context-remaining format with mixed-color thresholds"
```

---

## Final Verification

- [ ] **Step 1: Run the full suite one last time**

Run: `pnpm check`

Expected: All lint, typecheck, and tests pass with zero failures.

- [ ] **Step 2: Review the diff**

Run: `git diff master...HEAD --stat` to confirm only the expected files were touched and the diff is reasonable in size.
