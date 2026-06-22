# Phase 2: Selection Follows Item During Reorder

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When pressing LEFT/RIGHT to reorder a segment, the selection indicator follows the moved item instead of staying at the same index.

**Architecture:** Single line addition to `moveSegment()` plus a new test. TDD approach: write failing test first, then implement.

**Tech Stack:** TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-06-21-statusline-editor-refactor-design.md`

**Verification:** Run `pnpm check` (lint + typecheck + tests) at the end.

**Prerequisite:** Phase 1 committed.

---

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
