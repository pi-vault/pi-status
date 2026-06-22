# Segment Color Refactor

Refactor `model-with-reasoning`, `five-hour-limit`, and `weekly-limit` segments to use mixed-color formatting with reasoning-level-aware colors.

## Changes

### 1. Theme Extension

Widen `StatusLineMenuColor` and `StatusLineTheme` to support thinking-level colors and rainbow.

**Type changes in `src/tui/theme.ts`:**

```typescript
export type StatusLineMenuColor =
  | FooterRenderColor
  | "borderMuted"
  | "thinkingOff"
  | "thinkingMinimal"
  | "thinkingLow"
  | "thinkingMedium"
  | "thinkingHigh";

export type StatusLineTheme = {
  fg: (color: StatusLineMenuColor, text: string) => string;
  bold: (text: string) => string;
  dim: (text: string) => string;
  rainbow: (text: string) => string;
};
```

**`fromPiTheme()` update:** Pass thinking-level color names directly to `theme.fg()`. Pi's theme supports `thinkingOff`, `thinkingMinimal`, `thinkingLow`, `thinkingMedium` already. For `thinkingHigh` (new — pi-powerline-footer uses rainbow for both high/xhigh), add graceful fallback: if pi's theme throws on an unknown color name, fall back to `"accent"`.

Implement `rainbow()` using per-character hex coloring with the same palette as pi-powerline-footer:

```typescript
const RAINBOW_COLORS = [
  "#b281d6",
  "#d787af",
  "#febc38",
  "#e4c00f",
  "#89d281",
  "#00afaf",
  "#178fb9",
  "#b281d6",
];
```

Rainbow skips spaces and colons, cycling through colors for all other characters (including brackets).

**`noTheme` update:** `rainbow` returns text unchanged (identity, like other `noTheme` methods).

**Test theme (`markerTheme`) update:** `rainbow` wraps text in `[rainbow:text]` marker for test assertions.

### 2. Model with Reasoning — Per-Level Colors

**Current:** Returns `[text, "accent"]` for the entire `"Claude [high]"` string.

**New:** Returns `[pre-styled text, null]` (mixed-color pattern). Model name in `accent`, bracket text colored by thinking level.

**Color mapping function `thinkingLevelColor(level: string)`:**

| Level     | Color                                |
| --------- | ------------------------------------ |
| `off`     | `thinkingOff` (dim gray)             |
| `minimal` | `thinkingMinimal` (blue)             |
| `low`     | `thinkingLow` (teal)                 |
| `medium`  | `thinkingMedium` (green)             |
| `high`    | `thinkingHigh` (gold)                |
| `xhigh`   | rainbow (special, not a `fg()` call) |

**Format:**

- Non-reasoning model: returns `[modelName, "accent"]` — unchanged behavior, no mixed-color needed
- Reasoning model, level != xhigh: returns `[theme.fg("accent", modelName) + " " + theme.fg(thinkingLevelColor(level), "[" + abbreviation + "]"), null]`
- Reasoning model, level == xhigh: returns `[theme.fg("accent", modelName) + " " + theme.rainbow("[xhigh]"), null]`

**Signature change for `formatModelWithReasoning`:** Must accept `theme` parameter to apply colors inline. For reasoning models, returns `[pre-styled string, null]`. For non-reasoning models, returns `[plain name, "accent"]` (unchanged path).

### 3. Usage Limits — Mixed-Color Format

**Current:** Returns `["5h 70% left", rateColor(usedPercent)]` (single color applied to entire text).

**New:** Returns `[pre-styled text, null]` (mixed-color pattern). Prefix and suffix dim, percentage colored by threshold.

**Format:**

```
dim("5h ") + fg(rateColor(usedPercent), remaining + "%") + dim(" left")
```

**Thresholds unchanged:**

- `usedPercent < 70` → `"success"` (green)
- `usedPercent < 90` → `"warning"` (yellow)
- `usedPercent >= 90` → `"error"` (red)

Same pattern for `weekly-limit` with prefix `"wk"`.

## Test Updates

### Model with Reasoning Tests

Update existing tests in `tests/render.test.ts` (around lines 151-190):

- Use `markerTheme` to verify mixed-color output
- Assert model name wrapped in `[accent:...]`
- Assert bracket wrapped in appropriate thinking-level color marker
- Assert xhigh uses `[rainbow:...]` marker
- Verify non-reasoning models still return `[modelName, "accent"]` (single-color, unchanged path)

### Usage Limit Tests

Update existing tests in `tests/render.test.ts` (around lines 586-790):

- Use `markerTheme` to verify mixed-color output
- Assert prefix (`5h`/`wk`) and suffix (`left`) wrapped in `[dim:...]`
- Assert percentage wrapped in threshold color marker
- Verify null returns for unavailable data (unchanged)

### Theme Tests

Add tests for:

- `rainbow()` produces correct markers in `markerTheme`
- `noTheme.rainbow()` returns text unchanged
- New color names pass through `fg()` correctly

## Scope

**Files modified:**

- `src/tui/theme.ts` — type widening, rainbow function, fromPiTheme update
- `src/tui/render.ts` — model-with-reasoning case, five-hour-limit case, weekly-limit case, formatModelWithReasoning signature
- `tests/render.test.ts` — updated assertions for new formatting

**Not changed:**

- `buildFooterLine()` — already handles `[text, null]` returns correctly
- Config, editor, snapshot — no changes needed
- Threshold values — kept as-is for rate limits
