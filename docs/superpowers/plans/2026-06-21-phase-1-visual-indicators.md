# Phase 1: Visual Indicators

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the editor's indicator character from literal `▸` to `\u25B8` (source hygiene) and the selected-item checkbox from `[x]` to `[\u2022]` (bullet).

**Architecture:** Pure character substitution in editor source and corresponding test assertions. No logic changes.

**Tech Stack:** TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-06-21-statusline-editor-refactor-design.md`

**Verification:** Run `pnpm check` (lint + typecheck + tests) at the end.

---

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
