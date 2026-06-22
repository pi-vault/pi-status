# Phase 3: Remove `context-window-size` Segment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the standalone context window size segment. Its information will be embedded in the new Context Used / Context Remaining formats (Phases 5–6).

**Architecture:** Delete the segment from types, editor metadata, render switch, and tests. Update hardcoded navigation step counts in editor tests.

**Tech Stack:** TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-06-21-statusline-editor-refactor-design.md`

**Verification:** Run `pnpm check` (lint + typecheck + tests) at the end.

**Prerequisite:** Phase 2 committed.

---

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
