# Statusline Editor Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up the statusline editor and rendering — remove redundant items, update visual indicators, improve context usage formatting, and fix selection tracking during reorder.

**Architecture:** Six atomic phases, ordered simplest to most complex. Each phase produces a usable, passing build. Phases modify `src/shared/types.ts`, `src/tui/editor.ts`, `src/tui/render.ts`, and their corresponding test files.

**Tech Stack:** TypeScript, Vitest, pi-tui (`truncateToWidth`, `visibleWidth`)

**Spec:** `docs/superpowers/specs/2026-06-21-statusline-editor-refactor-design.md`

**Verification:** After every phase, run `pnpm check` (lint + typecheck + tests). Do not proceed to the next phase until it passes.

---

## Phase 1: Visual Indicators

Update the editor's indicator character from literal `▸` to `\u25B8` (source hygiene) and the selected-item checkbox from `[x]` to `[\u2022]` (bullet).

### Task 1.1: Update indicator and checkbox in editor source

**Files:**

- Modify: `src/tui/editor.ts`

- [ ] **Step 1: Replace literal `▸` with `\u25B8` in `renderRowLine`**

In `src/tui/editor.ts`, in the `renderRowLine` function, replace:

```ts
const markerRaw = row.selected ? "▸" : " ";
```

with:

```ts
const markerRaw = row.selected ? "\u25B8" : " ";
```

- [ ] **Step 2: Replace literal `▸` with `\u25B8` in the `render` method's query line**

In the `render(width)` method of the component returned by `createStatusLineEditor`, replace:

```ts
lines.push(truncateToWidth(`▸ ${query}`, width));
```

with:

```ts
lines.push(truncateToWidth(`\u25B8 ${query}`, width));
```

- [ ] **Step 3: Replace `[x]` with `[\u2022]` for segment rows**

In the same `render` method, in the segment row rendering block (`if (row.type === "segment")`), replace:

```ts
const enabled = isEnabledSegment(row.id) ? "[x]" : "[ ]";
```

with:

```ts
const enabled = isEnabledSegment(row.id) ? "[\u2022]" : "[ ]";
```

- [ ] **Step 4: Replace `[x]` with `[\u2022]` for status rows**

In the status row rendering block (`if (row.type === "status")`), replace:

```ts
                checkbox: shown.has(row.key) ? "[x]" : "[ ]",
```

with:

```ts
                checkbox: shown.has(row.key) ? "[\u2022]" : "[ ]",
```

- [ ] **Step 5: Replace `[x]` with `[\u2022]` for the policy row**

In the policy row rendering block (the final `else` in the render loop), replace:

```ts
              checkbox: newPolicyShown ? "[x]" : "[ ]",
```

with:

```ts
              checkbox: newPolicyShown ? "[\u2022]" : "[ ]",
```

### Task 1.2: Update editor tests for new checkbox character

**Files:**

- Modify: `tests/editor.test.ts`

- [ ] **Step 1: Update the aligned-column test assertion**

In `tests/editor.test.ts`, in the test `"renders aligned label and description columns when width allows"`, replace:

```ts
expect(target).toBe(
  "▸ [x] Model + Reasoning (1)     Current model name with reasoning level",
);
```

with:

```ts
expect(target).toBe(
  "\u25B8 [\u2022] Model + Reasoning (1)     Current model name with reasoning level",
);
```

- [ ] **Step 2: Update the narrow-width fallback test assertion**

In the test `"falls back to label - description form on narrow widths"`, replace:

```ts
expect(target).toBe("▸ [x] Model + Reasoning (1) - Current...");
```

with:

```ts
expect(target).toBe("\u25B8 [\u2022] Model + Reasoning (1) - Current...");
```

- [ ] **Step 3: Update the wide-width hardening test assertion**

In the test `"keeps aligned wide-width row output exact and deterministic"`, replace:

```ts
expect(target).toBe(
  "▸ [x] Model + Reasoning (1)     Current model name with reasoning level",
);
```

with:

```ts
expect(target).toBe(
  "\u25B8 [\u2022] Model + Reasoning (1)     Current model name with reasoning level",
);
```

- [ ] **Step 4: Update the narrow-width hardening test assertion**

In the test `"keeps narrow-width fallback row output exact and deterministic"`, replace:

```ts
expect(target).toBe("▸ [x] Model + Reasoning... - .");
```

with:

```ts
expect(target).toBe("\u25B8 [\u2022] Model + Reasoning... - .");
```

### Task 1.3: Verify Phase 1

- [ ] **Step 1: Run the full check suite**

Run: `pnpm check`

Expected: All lint, typecheck, and tests pass.

- [ ] **Step 2: Commit**

```bash
git add src/tui/editor.ts tests/editor.test.ts
git commit -m "refactor: update editor indicator to \u25B8 and checkbox to \u2022"
```

---

## Phase 2: Selection Follows Item During Reorder

When pressing LEFT/RIGHT to reorder a segment, the selection indicator stays at the same index while the item moves. Fix so the indicator follows the moved item.

### Task 2.1: Write failing test for reorder selection tracking

**Files:**

- Modify: `tests/editor.test.ts`

- [ ] **Step 1: Add the test**

In `tests/editor.test.ts`, inside the `"statusline editor interactions"` describe block, add a new test after the existing reorder tests:

```ts
it("keeps the selection indicator on the moved item after reorder", () => {
  const { editor } = makeEditor({
    config: makeConfig({ segments: ["model", "current-dir", "git-branch"] }),
    theme: HIGHLIGHT_THEME,
  });
  editor.handleInput(DOWN); // select current-dir (index 1)
  expect(activeInteractiveRow(editor.render(200))).toContain("Current Dir");

  editor.handleInput(LEFT); // move current-dir before model
  expect(activeInteractiveRow(editor.render(200))).toContain("Current Dir");

  editor.handleInput(RIGHT); // move current-dir back after model
  expect(activeInteractiveRow(editor.render(200))).toContain("Current Dir");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/editor.test.ts -t "keeps the selection indicator"`

Expected: FAIL — after LEFT, the selection moves to the wrong row (Model instead of Current Dir).

### Task 2.2: Implement reorder selection tracking

**Files:**

- Modify: `src/tui/editor.ts`

- [ ] **Step 1: Update `moveSegment` to adjust `selected`**

In `src/tui/editor.ts`, in the `moveSegment` function, add `selected += delta;` after the swap:

```ts
function moveSegment(delta: -1 | 1, row: InteractiveRow): void {
  if (query || row.type !== "segment") return;
  const idx = enabledSegments.indexOf(row.id);
  if (idx < 0) return;
  const next = idx + delta;
  if (next < 0 || next >= enabledSegments.length) return;
  const copy = [...enabledSegments];
  const [item] = copy.splice(idx, 1);
  copy.splice(next, 0, item);
  enabledSegments = copy;
  selected += delta;
}
```

Only the last line (`selected += delta;`) is new. This works because enabled segments are listed first in the interactive rows in their `enabledSegments` order, so moving a segment by `delta` in the array also moves its interactive-row index by `delta`.

### Task 2.3: Verify Phase 2

- [ ] **Step 1: Run the full check suite**

Run: `pnpm check`

Expected: All lint, typecheck, and tests pass.

- [ ] **Step 2: Commit**

```bash
git add src/tui/editor.ts tests/editor.test.ts
git commit -m "fix: selection indicator follows item during reorder"
```

---

## Phase 3: Remove `context-window-size` Segment

Remove the standalone context window size segment. Its information will be embedded in the new Context Used / Context Remaining formats (Phases 5–6).

### Task 3.1: Remove `context-window-size` from types

**Files:**

- Modify: `src/shared/types.ts`

- [ ] **Step 1: Remove from `StatusLineSegmentId` union**

In `src/shared/types.ts`, remove the `| "context-window-size"` line from the `StatusLineSegmentId` type.

- [ ] **Step 2: Remove from `KNOWN_SEGMENTS` array**

In the same file, remove `"context-window-size",` from the `KNOWN_SEGMENTS` array.

### Task 3.2: Remove `context-window-size` from editor and render

**Files:**

- Modify: `src/tui/editor.ts`
- Modify: `src/tui/render.ts`

- [ ] **Step 1: Remove from `SEGMENT_ORDER` in editor**

In `src/tui/editor.ts`, remove the `context-window-size` entry from `SEGMENT_ORDER`:

```ts
  {
    id: "context-window-size",
    label: "Context Window",
    description: "Total context window size in tokens (omitted when unknown)",
  },
```

Remove that entire object from the array.

- [ ] **Step 2: Remove the `case "context-window-size"` from `formatSegment`**

In `src/tui/render.ts`, remove this case from the `formatSegment` switch:

```ts
    case "context-window-size": {
      const value = input.contextUsage?.contextWindow;
      return value === undefined ? null : [`${formatCompactNumber(value)} ctx`, "dim"];
    }
```

### Task 3.3: Update tests

**Files:**

- Modify: `tests/render.test.ts`
- Modify: `tests/editor.test.ts`

- [ ] **Step 1: Remove the `context-window-size` test suite from render tests**

In `tests/render.test.ts`, remove the entire describe block:

```ts
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

- [ ] **Step 2: Update navigation step counts in editor tests (first pair)**

In `tests/editor.test.ts`, the removal of `context-window-size` from `SEGMENT_ORDER` reduces the total segment rows from 16 to 15. Update the two tests that navigate `16` times down to the policy row:

At line 458 (inside `"keeps left/right as no-ops for the policy row and discovered rows"`):

```ts
for (let i = 0; i < 16; i++) editor.handleInput(DOWN);
```

Change to:

```ts
for (let i = 0; i < 15; i++) editor.handleInput(DOWN);
```

At line 602 (inside `"updates filter state when toggling the policy row"`):

```ts
for (let i = 0; i < 16; i++) editor.handleInput(DOWN);
```

Change to:

```ts
for (let i = 0; i < 15; i++) editor.handleInput(DOWN);
```

- [ ] **Step 3: Update navigation step counts in editor tests (second pair)**

The two tests that navigate `17` times (to reach the first status row past the policy) drop to `16`:

At line 763 (inside `"saves filter: { mode: 'all', hidden: [...] }"`):

```ts
for (let i = 0; i < 17; i++) editor.handleInput(DOWN);
```

Change to:

```ts
for (let i = 0; i < 16; i++) editor.handleInput(DOWN);
```

At line 783 (inside `"saves filter: { mode: 'only', shown: [...] }"`):

```ts
for (let i = 0; i < 17; i++) editor.handleInput(DOWN);
```

Change to:

```ts
for (let i = 0; i < 16; i++) editor.handleInput(DOWN);
```

### Task 3.4: Verify Phase 3

- [ ] **Step 1: Run the full check suite**

Run: `pnpm check`

Expected: All lint, typecheck, and tests pass.

- [ ] **Step 2: Commit**

```bash
git add src/shared/types.ts src/tui/editor.ts src/tui/render.ts tests/render.test.ts tests/editor.test.ts
git commit -m "refactor: remove context-window-size segment"
```

---

## Phase 4: Remove `extension-statuses` Segment and Auto-Append

Remove `extension-statuses` from the segment list. Extension statuses now auto-append to the footer based on per-key filters, instead of being gated behind the segment toggle.

### Task 4.1: Remove `extension-statuses` from types

**Files:**

- Modify: `src/shared/types.ts`

- [ ] **Step 1: Remove from `StatusLineSegmentId` union**

In `src/shared/types.ts`, remove the `| "extension-statuses"` line from the `StatusLineSegmentId` type.

- [ ] **Step 2: Remove from `KNOWN_SEGMENTS` array**

In the same file, remove `"extension-statuses",` from the `KNOWN_SEGMENTS` array.

### Task 4.2: Remove from editor and update render

**Files:**

- Modify: `src/tui/editor.ts`
- Modify: `src/tui/render.ts`

- [ ] **Step 1: Remove from `SEGMENT_ORDER` in editor**

In `src/tui/editor.ts`, remove the `extension-statuses` entry from `SEGMENT_ORDER`:

```ts
  {
    id: "extension-statuses",
    label: "Extension Statuses",
    description:
      "Visible extension status values (omitted when none are visible)",
  },
```

Remove that entire object from the array.

- [ ] **Step 2: Remove the `case "extension-statuses"` from `formatSegment`**

In `src/tui/render.ts`, remove this case from the `formatSegment` switch:

```ts
    case "extension-statuses": {
      const value = formatExtensionStatuses(input, theme);
      return value ? [value, null] : null;
    }
```

- [ ] **Step 3: Auto-append extension statuses in `buildFooterLine`**

In `src/tui/render.ts`, update `buildFooterLine` to always append extension statuses at the end:

Replace:

```ts
export function buildFooterLine(
  input: FooterRenderInput,
  theme: ThemeLike,
  width: number,
): string {
  const parts = input.segments
    .map((id) => formatSegment(id, input, theme))
    .filter((x): x is [string, FooterRenderColor | null] => x !== null)
    .map(([text, color]) => (color ? theme.fg(color, text) : text));

  const line = parts.join(theme.fg("dim", " · "));
  return truncateToWidth(line, width);
}
```

with:

```ts
export function buildFooterLine(
  input: FooterRenderInput,
  theme: ThemeLike,
  width: number,
): string {
  const parts = input.segments
    .map((id) => formatSegment(id, input, theme))
    .filter((x): x is [string, FooterRenderColor | null] => x !== null)
    .map(([text, color]) => (color ? theme.fg(color, text) : text));

  const extStatus = formatExtensionStatuses(input, theme);
  if (extStatus) parts.push(extStatus);

  const line = parts.join(theme.fg("dim", " · "));
  return truncateToWidth(line, width);
}
```

### Task 4.3: Update render tests

**Files:**

- Modify: `tests/render.test.ts`

- [ ] **Step 1: Replace the `formatSegment — extension-statuses` suite with `buildFooterLine` extension-status tests**

Remove the entire `describe("formatSegment — extension-statuses", ...)` block (lines 650–735) and replace with tests that verify extension statuses are auto-appended through `buildFooterLine`:

```ts
describe("buildFooterLine — extension statuses", () => {
  it("appends extension statuses after segment parts", () => {
    const line = buildFooterLine(
      {
        ...segmentInput({
          segments: ["run-state"],
          extensionStatuses: new Map([
            ["alpha", "running"],
            ["beta", "paused"],
          ]),
          filter: { mode: "all", hidden: [] },
        }),
      },
      identityTheme,
      200,
    );
    expect(line).toContain("idle");
    expect(line).toContain("running");
    expect(line).toContain("paused");
  });

  it("respects the hidden filter", () => {
    const line = buildFooterLine(
      {
        ...segmentInput({
          segments: ["run-state"],
          extensionStatuses: new Map([
            ["alpha", "running"],
            ["beta", "paused"],
          ]),
          filter: { mode: "all", hidden: ["alpha"] },
        }),
      },
      identityTheme,
      200,
    );
    expect(line).not.toContain("running");
    expect(line).toContain("paused");
  });

  it("respects the only filter", () => {
    const line = buildFooterLine(
      {
        ...segmentInput({
          segments: ["run-state"],
          extensionStatuses: new Map([
            ["alpha", "running"],
            ["beta", "paused"],
          ]),
          filter: { mode: "only", shown: ["alpha"] },
        }),
      },
      identityTheme,
      200,
    );
    expect(line).toContain("running");
    expect(line).not.toContain("paused");
  });

  it("omits extension statuses when none exist", () => {
    const line = buildFooterLine(
      {
        ...segmentInput({
          segments: ["run-state"],
          extensionStatuses: new Map(),
        }),
      },
      identityTheme,
      200,
    );
    expect(line).toBe("idle");
  });

  it("omits extension statuses when all are hidden", () => {
    const line = buildFooterLine(
      {
        ...segmentInput({
          segments: ["run-state"],
          extensionStatuses: new Map([["alpha", "running"]]),
          filter: { mode: "all", hidden: ["alpha"] },
        }),
      },
      identityTheme,
      200,
    );
    expect(line).toBe("idle");
  });

  it("strips key prefix from status values", () => {
    const line = buildFooterLine(
      {
        ...segmentInput({
          segments: [],
          extensionStatuses: new Map([["alpha", "alpha: running"]]),
          filter: { mode: "all", hidden: [] },
        }),
      },
      identityTheme,
      200,
    );
    expect(line).toBe("running");
  });
});
```

### Task 4.4: Update editor tests

**Files:**

- Modify: `tests/editor.test.ts`

- [ ] **Step 1: Update navigation step counts**

With `extension-statuses` also removed from `SEGMENT_ORDER`, the total segment rows drop from 15 to 14. Update the four navigation counts:

Change all `for (let i = 0; i < 15; i++)` (set in Phase 3) to `for (let i = 0; i < 14; i++)`.
Change all `for (let i = 0; i < 16; i++)` (set in Phase 3) to `for (let i = 0; i < 15; i++)`.

Specifically:

In `"keeps left/right as no-ops for the policy row and discovered rows"`:

```ts
for (let i = 0; i < 14; i++) editor.handleInput(DOWN);
```

In `"updates filter state when toggling the policy row"`:

```ts
for (let i = 0; i < 14; i++) editor.handleInput(DOWN);
```

In `"saves filter: { mode: 'all', hidden: [...] }"`:

```ts
for (let i = 0; i < 15; i++) editor.handleInput(DOWN);
```

In `"saves filter: { mode: 'only', shown: [...] }"`:

```ts
for (let i = 0; i < 15; i++) editor.handleInput(DOWN);
```

- [ ] **Step 2: Update the editor description test**

In the test `"renders generic descriptions for discovered rows and the policy row"`, the assertion checks for the text `"Visible when extension-statuses is enabled"`. This is the `STATUS_ROW_DESCRIPTION` constant in `editor.ts` which describes individual extension-status rows. Since we removed the `extension-statuses` segment, update the description constant and the test.

In `src/tui/editor.ts`, change:

```ts
const STATUS_ROW_DESCRIPTION = "Visible when extension-statuses is enabled";
```

to:

```ts
const STATUS_ROW_DESCRIPTION = "Toggle visibility in the status line";
```

In `tests/editor.test.ts`, in the test `"renders generic descriptions for discovered rows and the policy row"`, change:

```ts
expect(
  lines.some((line) =>
    line.includes("Visible when extension-statuses is enabled"),
  ),
).toBe(true);
```

to:

```ts
expect(
  lines.some((line) => line.includes("Toggle visibility in the status line")),
).toBe(true);
```

- [ ] **Step 3: Update the search test for status row description**

The test `"searches discovered status rows by key and generic description"` fuzzy-searches for `"enabled"` which matched the old description. With the new description `"Toggle visibility in the status line"`, change the search term to `"visibility"`.

In `tests/editor.test.ts`, in the second part of that test, replace:

```ts
for (const char of "enabled") editor.handleInput(char);
```

with:

```ts
for (const char of "visibility") editor.handleInput(char);
```

### Task 4.5: Verify Phase 4

- [ ] **Step 1: Run the full check suite**

Run: `pnpm check`

Expected: All lint, typecheck, and tests pass.

- [ ] **Step 2: Commit**

```bash
git add src/shared/types.ts src/tui/editor.ts src/tui/render.ts tests/render.test.ts tests/editor.test.ts
git commit -m "refactor: remove extension-statuses segment, auto-append to footer"
```

---

## Phase 5: New Context Used Format

Change `context-used` from `46% ctx` (single color) to `187.4k / 200k (94%)` with mixed threshold colors. Tokens and percentage are colored; separator and context window are dim.

New thresholds: success < 60%, warning >= 60%, error >= 80%.

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

---

## Phase 6: New Context Remaining Format

Change `context-remaining` from `150k left` (single color) to `12.6k / 200k (6%)` with mixed threshold colors. Remaining tokens and percentage are colored; separator and context window are dim.

New thresholds (on remaining %): success > 40%, warning <= 40%, error <= 20%.

After this phase, the old `contextColor` function is unused and removed.

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
