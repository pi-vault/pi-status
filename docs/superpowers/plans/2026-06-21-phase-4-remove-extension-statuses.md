# Phase 4: Remove `extension-statuses` Segment and Auto-Append

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `extension-statuses` from the segment list. Extension statuses now auto-append to the footer based on per-key filters, instead of being gated behind the segment toggle.

**Architecture:** Delete from types/editor/render, add auto-append logic to `buildFooterLine`, update description constants and tests.

**Tech Stack:** TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-06-21-statusline-editor-refactor-design.md`

**Verification:** Run `pnpm check` (lint + typecheck + tests) at the end.

**Prerequisite:** Phase 3 committed.

---

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
- Modify: `src/tui/editor.ts`
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

- [ ] **Step 2: Update the editor description test and constant**

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
      lines.some((line) =>
        line.includes("Toggle visibility in the status line"),
      ),
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
