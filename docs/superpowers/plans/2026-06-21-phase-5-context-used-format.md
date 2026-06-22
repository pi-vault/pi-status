# Phase 5: New Context Used Format

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change `context-used` from `46% ctx` (single color) to `187.4k / 200k (94%)` with mixed threshold colors. Tokens and percentage are colored; separator and context window are dim.

**Architecture:** Add `contextUsedColor()` function, rewrite `case "context-used"` to produce mixed-color string, update tests with a new `markerTheme` helper for color verification.

**Tech Stack:** TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-06-21-statusline-editor-refactor-design.md`

**Verification:** Run `pnpm check` (lint + typecheck + tests) at the end.

**Prerequisite:** Phase 4 committed.

**New thresholds:** success < 60%, warning >= 60%, error >= 80%.

---

### Task 5.1: Write failing tests for new context-used format

**Files:**
- Modify: `tests/render.test.ts`

- [ ] **Step 1: Add a marker theme helper**

Near the top of `tests/render.test.ts`, after the `identityTheme` declaration, add:

```ts
/** Theme that tags colored text — isolates color verification from rendering. */
const markerTheme: ThemeLike = { fg: (c, t) => `[${c}:${t}]` };
```

- [ ] **Step 2: Replace the `context-used` test suite**

Remove the entire `describe("formatSegment — context-used", ...)` block and replace with:

```ts
describe("formatSegment — context-used", () => {
  it("formats as tokens / window (percent%)", () => {
    const result = formatSegment(
      "context-used",
      segmentInput({
        contextUsage: { tokens: 50000, contextWindow: 200000, percent: 25 },
      }),
      identityTheme,
    );
    expect(result).toEqual(["50k / 200k (25%)", null]);
  });

  it("applies success color to tokens and percent when usage is under 60%", () => {
    const result = formatSegment(
      "context-used",
      segmentInput({
        contextUsage: { tokens: 50000, contextWindow: 200000, percent: 25 },
      }),
      markerTheme,
    );
    expect(result?.[0]).toContain("[success:50k]");
    expect(result?.[0]).toContain("[success:25%]");
    expect(result?.[0]).toContain("[dim:200k]");
  });

  it("applies warning color when percent is between 60-79", () => {
    const result = formatSegment(
      "context-used",
      segmentInput({
        contextUsage: { tokens: 150000, contextWindow: 200000, percent: 75 },
      }),
      markerTheme,
    );
    expect(result?.[0]).toContain("[warning:150k]");
    expect(result?.[0]).toContain("[warning:75%]");
  });

  it("applies error color when percent is 80+", () => {
    const result = formatSegment(
      "context-used",
      segmentInput({
        contextUsage: { tokens: 190000, contextWindow: 200000, percent: 95 },
      }),
      markerTheme,
    );
    expect(result?.[0]).toContain("[error:190k]");
    expect(result?.[0]).toContain("[error:95%]");
  });

  it("returns null when tokens is null", () => {
    const result = formatSegment(
      "context-used",
      segmentInput({
        contextUsage: { tokens: null, contextWindow: 200000, percent: 25 },
      }),
      identityTheme,
    );
    expect(result).toBeNull();
  });

  it("returns null when contextWindow is undefined", () => {
    const result = formatSegment(
      "context-used",
      segmentInput({ contextUsage: { percent: 25 } }),
      identityTheme,
    );
    expect(result).toBeNull();
  });

  it("returns null when percent is null", () => {
    const result = formatSegment(
      "context-used",
      segmentInput({
        contextUsage: { tokens: 50000, contextWindow: 200000, percent: null },
      }),
      identityTheme,
    );
    expect(result).toBeNull();
  });

  it("returns null when contextUsage is undefined", () => {
    const result = formatSegment("context-used", segmentInput(), identityTheme);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify tests fail**

Run: `pnpm vitest run tests/render.test.ts -t "formatSegment — context-used"`

Expected: FAIL — output is still `["46% ctx", "success"]` instead of the new format.

### Task 5.2: Implement new context-used format

**Files:**
- Modify: `src/tui/render.ts`

- [ ] **Step 1: Add `contextUsedColor` function**

In `src/tui/render.ts`, add a new function after the existing `contextColor` function:

```ts
function contextUsedColor(percent: number): "success" | "warning" | "error" {
  if (percent < 60) return "success";
  if (percent < 80) return "warning";
  return "error";
}
```

- [ ] **Step 2: Rewrite the `context-used` case in `formatSegment`**

Replace the existing `case "context-used"` block:

```ts
    case "context-used": {
      const percent = input.contextUsage?.percent;
      return percent === undefined || percent === null
        ? null
        : [`${Math.round(percent)}% ctx`, contextColor(percent)];
    }
```

with:

```ts
    case "context-used": {
      const tokens = input.contextUsage?.tokens;
      const ctxWindow = input.contextUsage?.contextWindow;
      const percent = input.contextUsage?.percent;
      if (tokens == null || ctxWindow === undefined || percent == null) return null;
      const c = contextUsedColor(percent);
      const dim = (s: string) => theme.fg("dim", s);
      return [
        `${theme.fg(c, formatCompactNumber(tokens))}${dim(" / ")}${dim(formatCompactNumber(ctxWindow))}${dim(" (")}${theme.fg(c, `${Math.round(percent)}%`)}${dim(")")}`,
        null,
      ];
    }
```

### Task 5.3: Update editor description for context-used

**Files:**
- Modify: `src/tui/editor.ts`

- [ ] **Step 1: Update the description in SEGMENT_ORDER**

In `src/tui/editor.ts`, change the `context-used` entry's description:

```ts
  {
    id: "context-used",
    label: "Context Used",
    description:
      "Percentage of context window used (omitted when unknown)",
  },
```

to:

```ts
  {
    id: "context-used",
    label: "Context Used",
    description:
      "Context tokens used vs window size (omitted when unknown)",
  },
```

### Task 5.4: Verify Phase 5

- [ ] **Step 1: Run the full check suite**

Run: `pnpm check`

Expected: All lint, typecheck, and tests pass.

- [ ] **Step 2: Commit**

```bash
git add src/tui/render.ts src/tui/editor.ts tests/render.test.ts
git commit -m "feat: new context-used format with mixed-color thresholds"
```
