# Statusline Editor Refactor

**Date:** 2026-06-21
**Branch:** `20260621-refactor-planning`

## Goal

Clean up the statusline editor and rendering: remove redundant items, update visual indicators, improve context usage formatting, and fix selection tracking during reorder.

## Changes

### 1. Remove `extension-statuses` segment

Individual extension statuses already have their own toggleable rows in the editor (e.g. `[x] mcp`). The top-level `extension-statuses` segment is a redundant gate.

**Remove from segment vocabulary:**
- `StatusLineSegmentId` union: drop `"extension-statuses"`
- `KNOWN_SEGMENTS` array: drop `"extension-statuses"`
- `SEGMENT_ORDER` in editor: drop the entry

**Change footer rendering:** Extension statuses currently render only when `"extension-statuses"` is in the configured segments list. After removal, `buildFooterLine()` always appends extension statuses at the end of the footer (after all segment parts), gated only by the per-key filter (the "Extension statuses" section in the editor).

**Keep intact:** The "Extension statuses" section in the editor (policy row, individual status rows, section header, divider, empty hint) stays unchanged. The per-key filter (`StatusFilter`) and `formatExtensionStatuses()` remain.

**Remove from `formatSegment()`:** Drop the `case "extension-statuses"` branch.

### 2. Remove `context-window-size` segment

Context window size is now embedded in the new Context Used / Context Remaining formats, making the standalone segment redundant.

**Remove from segment vocabulary:**
- `StatusLineSegmentId` union: drop `"context-window-size"`
- `KNOWN_SEGMENTS` array: drop `"context-window-size"`
- `SEGMENT_ORDER` in editor: drop the entry

**Remove from `formatSegment()`:** Drop the `case "context-window-size"` branch.

### 3. Change indicator character in source

Replace the literal `▸` character with its Unicode escape `\u25B8` throughout `editor.ts`. Same character, source hygiene only.

### 4. Change selected-item checkbox from `[x]` to `[\u2022]`

In the editor's `render()` method, enabled/shown items display `[\u2022]` (bullet `\u2022`) instead of `[x]`. Disabled/hidden items remain `[ ]`.

Applies to all three interactive row types: segment rows, status rows, and the policy row.

### 5. Selection follows item during reorder

When pressing LEFT/RIGHT to reorder an enabled segment, the selection indicator currently stays at the same list index while the item moves. After this change, `selected` tracks the moved item's new position so the indicator follows.

**Implementation:** After `moveSegment()` swaps positions in `enabledSegments`, recalculate `selected` to the index of the moved item in `getFilteredInteractiveRows()`.

### 6. New Context Used format

**Before:** `46% ctx` (single color)

**After:** `187.4k / 200k (94%)` where:
- `[Tokens]` = `formatCompactNumber(tokens)` with threshold color
- ` / ` = dim
- `[Context Window]` = `formatCompactNumber(contextWindow)` in dim
- ` (` = dim
- `[Usage %]` = `Math.round(percent)` + `%` with threshold color
- `)` = dim

**Color thresholds (usage percentage):**
| Range | Color |
|---|---|
| < 60% | `success` (green) |
| >= 60% | `warning` (yellow) |
| >= 80% | `error` (red) |

**Return type:** `[pre-styled string, null]` since the text has mixed colors applied via the theme parameter inside `formatSegment`. Same pattern used by `extension-statuses`.

**Null conditions (unchanged):** Returns `null` when `tokens` is null/undefined, `contextWindow` is undefined, or `percent` is null/undefined.

### 7. New Context Remaining format

**Before:** `150k left` (single color based on usage %)

**After:** `12.6k / 200k (6%)` where:
- `[Remaining Tokens]` = `formatCompactNumber(Math.max(0, contextWindow - tokens))` with threshold color
- ` / ` = dim
- `[Context Window]` = `formatCompactNumber(contextWindow)` in dim
- ` (` = dim
- `[Remaining %]` = `Math.round(100 - percent)` + `%` with threshold color
- `)` = dim

**Color thresholds (remaining percentage):**
| Range | Color |
|---|---|
| > 40% | `success` (green) |
| <= 40% and > 20% | `warning` (yellow) |
| <= 20% | `error` (red) |

**Return type:** `[pre-styled string, null]` (same mixed-color pattern).

**Null conditions (unchanged):** Returns `null` when `tokens` is null/undefined, `contextWindow` is undefined, or `percent` is null/undefined.

## Files Affected

| File | Changes |
|---|---|
| `src/shared/types.ts` | Remove `extension-statuses` and `context-window-size` from `StatusLineSegmentId` and `KNOWN_SEGMENTS` |
| `src/tui/editor.ts` | Remove 2 entries from `SEGMENT_ORDER`; change `▸` to `\u25B8`; change `[x]` to `[\u2022]`; fix reorder selection tracking |
| `src/tui/render.ts` | Remove 2 cases from `formatSegment`; rewrite `context-used` and `context-remaining` cases with mixed-color formatting; replace `contextColor()` with `contextUsedColor()` and `contextRemainingColor()`; move extension-status appending into `buildFooterLine()` |
| `tests/render.test.ts` | Update expected values for context-used, context-remaining; remove context-window-size and extension-statuses suites; update color threshold expectations; update buildFooterLine tests for auto-appended extension statuses |
| `tests/editor.test.ts` | Update `[x]` to `[\u2022]` in expectations; update `▸` references; update row counts (2 fewer segments); add reorder-follows-selection test; adjust navigation step counts |
| `tests/config.test.ts` | Update if normalization tests reference removed segment IDs |

## Backward Compatibility

Existing user configs that include `"extension-statuses"` or `"context-window-size"` in their segments list will have those entries silently removed by `normalizeSegments()`, which validates against `KNOWN_SEGMENTS`. This is the existing behavior for unknown segment IDs and requires no special handling.

## Editor Description Updates

The descriptions in `SEGMENT_ORDER` for the context segments should be updated to reflect the new format:

| Segment | Old description | New description |
|---|---|---|
| `context-used` | "Percentage of context window used (omitted when unknown)" | "Context tokens used vs window size (omitted when unknown)" |
| `context-remaining` | "Percentage of context window remaining (omitted when unknown)" | "Context tokens remaining vs window size (omitted when unknown)" |

## Out of Scope

- No changes to config loading/saving logic
- No changes to the "Extension statuses" section in the editor (policy row, individual rows)
- No changes to theme, snapshot, usage-runtime, or index.ts (beyond what the extension-statuses rendering change requires in buildFooterLine's call site)
- No changes to rate limit segments (five-hour-limit, weekly-limit)
