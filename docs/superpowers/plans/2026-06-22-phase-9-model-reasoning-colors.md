# Phase 9: Model with Reasoning — Per-Level Colors

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change `model-with-reasoning` from uniform `"accent"` coloring to mixed-color: model name in accent, bracket text colored by thinking level (progressive warmth), xhigh uses rainbow.

**Architecture:** Add `thinkingLevelColor()` mapping function. Refactor `formatModelWithReasoning` to accept a theme and return pre-styled mixed-color output for reasoning models. Non-reasoning models still return `[name, "accent"]` unchanged.

**Tech Stack:** TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-06-22-segment-color-refactor-design.md` (Section 2)

**Verification:** Run `pnpm check` (lint + typecheck + tests) at the end.

**Prerequisite:** Phase 8 committed (theme extension with thinking-level colors and rainbow).

---

### Task 9.1: Write failing tests for per-level model colors

**Files:**
- Modify: `tests/render.test.ts`

- [ ] **Step 1: Replace the `model-with-reasoning` segment test suite**

Remove the entire `describe("formatSegment — model-with-reasoning", ...)` block and replace with:

```ts
describe("formatSegment — model-with-reasoning", () => {
  it("returns accent-colored name for non-reasoning models", () => {
    const result = formatSegment(
      "model-with-reasoning",
      segmentInput({ model: { id: "x", name: "X", reasoning: false } }),
      markerTheme,
    );
    expect(result).toEqual(["X", "accent"]);
  });

  it("returns null when model is undefined", () => {
    const result = formatSegment(
      "model-with-reasoning",
      segmentInput(),
      markerTheme,
    );
    expect(result).toBeNull();
  });

  it("colors bracket with thinkingOff for level off", () => {
    const result = formatSegment(
      "model-with-reasoning",
      segmentInput({
        model: { id: "x", name: "X", reasoning: true },
        thinkingLevel: "off",
      }),
      markerTheme,
    );
    expect(result?.[0]).toBe("[accent:X] [thinkingOff:[off]]");
    expect(result?.[1]).toBeNull();
  });

  it("colors bracket with thinkingMinimal for level minimal", () => {
    const result = formatSegment(
      "model-with-reasoning",
      segmentInput({
        model: { id: "x", name: "X", reasoning: true },
        thinkingLevel: "minimal",
      }),
      markerTheme,
    );
    expect(result?.[0]).toBe("[accent:X] [thinkingMinimal:[min]]");
    expect(result?.[1]).toBeNull();
  });

  it("colors bracket with thinkingLow for level low", () => {
    const result = formatSegment(
      "model-with-reasoning",
      segmentInput({
        model: { id: "x", name: "X", reasoning: true },
        thinkingLevel: "low",
      }),
      markerTheme,
    );
    expect(result?.[0]).toBe("[accent:X] [thinkingLow:[low]]");
    expect(result?.[1]).toBeNull();
  });

  it("colors bracket with thinkingMedium for level medium", () => {
    const result = formatSegment(
      "model-with-reasoning",
      segmentInput({
        model: { id: "x", name: "X", reasoning: true },
        thinkingLevel: "medium",
      }),
      markerTheme,
    );
    expect(result?.[0]).toBe("[accent:X] [thinkingMedium:[med]]");
    expect(result?.[1]).toBeNull();
  });

  it("colors bracket with thinkingHigh for level high", () => {
    const result = formatSegment(
      "model-with-reasoning",
      segmentInput({
        model: { id: "x", name: "X", reasoning: true },
        thinkingLevel: "high",
      }),
      markerTheme,
    );
    expect(result?.[0]).toBe("[accent:X] [thinkingHigh:[high]]");
    expect(result?.[1]).toBeNull();
  });

  it("applies rainbow to bracket for level xhigh", () => {
    const result = formatSegment(
      "model-with-reasoning",
      segmentInput({
        model: { id: "x", name: "X", reasoning: true },
        thinkingLevel: "xhigh",
      }),
      markerTheme,
    );
    expect(result?.[0]).toBe("[accent:X] [rainbow:[xhigh]]");
    expect(result?.[1]).toBeNull();
  });

  it("uses model id when name is unavailable", () => {
    const result = formatSegment(
      "model-with-reasoning",
      segmentInput({
        model: { id: "gpt-5", reasoning: true },
        thinkingLevel: "medium",
      }),
      markerTheme,
    );
    expect(result?.[0]).toBe("[accent:gpt-5] [thinkingMedium:[med]]");
    expect(result?.[1]).toBeNull();
  });

  it("formats correctly with identityTheme (no color markers)", () => {
    const result = formatSegment(
      "model-with-reasoning",
      segmentInput({
        model: { id: "x", name: "X", reasoning: true },
        thinkingLevel: "medium",
      }),
      identityTheme,
    );
    expect(result).toEqual(["X [med]", null]);
  });
});
```

- [ ] **Step 2: Update the standalone `formatModelWithReasoning` tests**

The existing `it("formats model with reasoning", ...)` tests near the top of the file (around line 44) test `formatModelWithReasoning` directly. Since the signature changes to accept a theme, update these tests.

Find and replace the existing standalone tests:

```ts
  it("formats model with reasoning", () => {
    expect(
      formatModelWithReasoning(
        { id: "x", name: "X", reasoning: true },
        "medium",
        identityTheme,
      ),
    ).toEqual(["X [med]", null]);

    expect(
      formatModelWithReasoning(
        { id: "x", name: "X", reasoning: false },
        "medium",
        identityTheme,
      ),
    ).toEqual(["X", "accent"]);

    expect(formatModelWithReasoning(undefined, "medium", identityTheme)).toBeNull();
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test`

Expected: Tests fail because `formatModelWithReasoning` doesn't accept a theme argument yet and `model-with-reasoning` still returns `[text, "accent"]`.

---

### Task 9.2: Add thinkingLevelColor mapping and refactor formatModelWithReasoning

**Files:**
- Modify: `src/tui/render.ts`

- [ ] **Step 1: Add `thinkingLevelColor` function**

Add this function after the `rateColor` function (around line 142):

```ts
type ThinkingColor = Exclude<FooterRenderColor, "accent" | "dim" | "success" | "warning" | "error">;

function thinkingLevelColor(level: string): ThinkingColor {
  switch (level) {
    case "off":
      return "thinkingOff";
    case "minimal":
      return "thinkingMinimal";
    case "low":
      return "thinkingLow";
    case "medium":
      return "thinkingMedium";
    case "high":
      return "thinkingHigh";
    default:
      return "thinkingOff";
  }
}
```

- [ ] **Step 2: Refactor `formatModelWithReasoning` signature and implementation**

Replace the existing `formatModelWithReasoning` function:

```ts
export function formatModelWithReasoning(
  model: ModelLike | undefined,
  thinkingLevel: string,
  theme: ThemeLike,
): [text: string, color: FooterRenderColor | null] | null {
  const base = model?.name ?? model?.id;
  if (!base) return null;
  if (!model?.reasoning) return [base, "accent"];
  const abbrev = normalizeThinkingLevel(thinkingLevel);
  if (thinkingLevel === "xhigh") {
    return [`${theme.fg("accent", base)} ${theme.rainbow(`[${abbrev}]`)}`, null];
  }
  return [
    `${theme.fg("accent", base)} ${theme.fg(thinkingLevelColor(thinkingLevel), `[${abbrev}]`)}`,
    null,
  ];
}
```

- [ ] **Step 3: Update the `model-with-reasoning` case in `formatSegment`**

Replace the `case "model-with-reasoning"` block:

```ts
    case "model-with-reasoning":
      return formatModelWithReasoning(input.model, input.thinkingLevel, theme);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`

Expected: All tests pass.

- [ ] **Step 5: Run full verification**

Run: `pnpm check`

Expected: Lint, typecheck, and tests all pass.

- [ ] **Step 6: Commit**

```bash
git add src/tui/render.ts tests/render.test.ts
git commit -m "feat: per-level reasoning colors with progressive warmth"
```
