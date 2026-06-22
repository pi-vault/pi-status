# Phase 8: Theme Extension — Thinking-Level Colors & Rainbow

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `ThemeLike` and `StatusLineTheme` to support thinking-level color names and a `rainbow()` function for per-character gradient coloring.

**Architecture:** Widen `FooterRenderColor` to include thinking-level colors. Add `rainbow` method to `ThemeLike` and `StatusLineTheme`. Implement `rainbow()` in `fromPiTheme()` using hex-to-ANSI per-character coloring. Add graceful fallback for unknown theme color names.

**Tech Stack:** TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-06-22-segment-color-refactor-design.md` (Section 1)

**Verification:** Run `pnpm check` (lint + typecheck + tests) at the end.

**Prerequisite:** Phase 7 committed (usage limits format).

---

### Task 8.1: Write failing tests for theme extension

**Files:**

- Modify: `tests/render.test.ts`

- [ ] **Step 1: Add rainbow to the test themes**

In `tests/render.test.ts`, update the `identityTheme` and `markerTheme` declarations to include `rainbow`:

Replace:

```ts
/** Theme that passes text through unchanged — isolates formatting logic from color application. */
const identityTheme: ThemeLike = { fg: (_c, t) => t };

/** Theme that tags colored text — isolates color verification from rendering. */
const markerTheme: ThemeLike = { fg: (c, t) => `[${c}:${t}]` };
```

With:

```ts
/** Theme that passes text through unchanged — isolates formatting logic from color application. */
const identityTheme: ThemeLike = { fg: (_c, t) => t, rainbow: (t) => t };

/** Theme that tags colored text — isolates color verification from rendering. */
const markerTheme: ThemeLike = {
  fg: (c, t) => `[${c}:${t}]`,
  rainbow: (t) => `[rainbow:${t}]`,
};
```

- [ ] **Step 2: Add a test for thinking-level colors passing through**

Add a new describe block after the existing `"formatSegment — model"` block:

```ts
describe("theme — thinking-level colors", () => {
  it("accepts thinking-level color names in fg()", () => {
    const result = markerTheme.fg("thinkingMinimal", "test");
    expect(result).toBe("[thinkingMinimal:test]");
  });

  it("accepts thinkingHigh color name", () => {
    const result = markerTheme.fg("thinkingHigh", "test");
    expect(result).toBe("[thinkingHigh:test]");
  });

  it("rainbow returns marker in markerTheme", () => {
    expect(markerTheme.rainbow("[xhigh]")).toBe("[rainbow:[xhigh]]");
  });

  it("rainbow returns text unchanged in identityTheme", () => {
    expect(identityTheme.rainbow("[xhigh]")).toBe("[xhigh]");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test`

Expected: TypeScript compilation fails because `ThemeLike` doesn't have `rainbow` property yet, and `FooterRenderColor` doesn't include `"thinkingMinimal"`.

---

### Task 8.2: Extend FooterRenderColor and ThemeLike types

**Files:**

- Modify: `src/tui/render.ts`

- [ ] **Step 1: Widen FooterRenderColor**

In `src/tui/render.ts`, replace the `FooterRenderColor` type:

```ts
export type FooterRenderColor =
  | "accent"
  | "dim"
  | "success"
  | "warning"
  | "error"
  | "thinkingOff"
  | "thinkingMinimal"
  | "thinkingLow"
  | "thinkingMedium"
  | "thinkingHigh";
```

- [ ] **Step 2: Add rainbow to ThemeLike**

Replace the `ThemeLike` type:

```ts
export type ThemeLike = {
  fg: (color: FooterRenderColor, text: string) => string;
  rainbow: (text: string) => string;
};
```

- [ ] **Step 3: Run typecheck to verify types compile**

Run: `pnpm typecheck`

Expected: May have errors in theme.ts if `StatusLineTheme` doesn't match yet, but render.ts types should compile.

---

### Task 8.3: Update StatusLineTheme and implement rainbow

**Files:**

- Modify: `src/tui/theme.ts`

- [ ] **Step 1: Rewrite `src/tui/theme.ts` entirely**

Replace the full contents of `src/tui/theme.ts` with:

```ts
import type { FooterRenderColor } from "./render.ts";

export type StatusLineMenuColor = FooterRenderColor | "borderMuted";

export type StatusLineTheme = {
  fg: (color: StatusLineMenuColor, text: string) => string;
  bold: (text: string) => string;
  dim: (text: string) => string;
  rainbow: (text: string) => string;
};

type PiThemeLike = {
  fg: (color: string, text: string) => string;
  bold: (text: string) => string;
};

function isPiThemeLike(value: unknown): value is PiThemeLike {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { fg?: unknown; bold?: unknown };
  return (
    typeof candidate.fg === "function" && typeof candidate.bold === "function"
  );
}

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

function hexToAnsi(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

function rainbow(text: string): string {
  let result = "";
  let colorIndex = 0;
  for (const char of text) {
    if (char === " " || char === ":") {
      result += char;
    } else {
      result +=
        hexToAnsi(RAINBOW_COLORS[colorIndex % RAINBOW_COLORS.length]) + char;
      colorIndex++;
    }
  }
  return result + "\x1b[0m";
}

function safeFg(theme: PiThemeLike, color: string, text: string): string {
  try {
    return theme.fg(color, text);
  } catch {
    return theme.fg("accent", text);
  }
}

export const noTheme: StatusLineTheme = {
  fg: (_color, text) => text,
  bold: (text) => text,
  dim: (text) => text,
  rainbow: (text) => text,
};

export function fromPiTheme(theme: unknown): StatusLineTheme {
  if (!isPiThemeLike(theme)) return noTheme;
  return {
    fg: (color, text) => safeFg(theme, color, text),
    bold: (text) => theme.bold(text),
    dim: (text) => theme.fg("dim", text),
    rainbow: (text) => rainbow(text),
  };
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`

Expected: All types compile cleanly.

---

### Task 8.4: Update callers and test-helpers

**Files:**

- Modify: `src/index.ts`
- Modify: `tests/render.test.ts`
- Modify: `tests/test-helpers.ts`

- [ ] **Step 1: Wrap theme with `fromPiTheme` in `src/index.ts`**

The `FooterFactory` receives a raw Pi theme (`{ fg }`) and passes it directly to `buildFooterLine()`. Now that `ThemeLike` requires `rainbow`, we must convert it first.

In `src/index.ts`, add to the existing imports from `./tui/theme.ts`:

```ts
import { fromPiTheme } from "./tui/theme.ts";
```

Then in the `render()` method of the footer factory (around line 113), replace:

```ts
const line = buildFooterLine(
  {
    ...snapshot,
    extensionSegments: state.config.extensionSegments,
    segments: state.config.segments,
  },
  theme,
  width,
);
```

With:

```ts
const line = buildFooterLine(
  {
    ...snapshot,
    extensionSegments: state.config.extensionSegments,
    segments: state.config.segments,
  },
  fromPiTheme(theme),
  width,
);
```

Note: When extension tests pass `{ fg }` without `bold`, `fromPiTheme` returns `noTheme` (identity for all methods), preserving existing test behavior.

- [ ] **Step 2: Add `rainbow` to inline themes in `tests/render.test.ts`**

Three inline `{ fg: (_c, t) => t }` objects are passed directly to `buildFooterLine`. Add `rainbow`:

Replace each occurrence (lines ~78, ~92, ~118):

```ts
      { fg: (_c, t) => t },
```

With:

```ts
      { fg: (_c, t) => t, rainbow: (t) => t },
```

- [ ] **Step 3: Update renderWithFactory theme mock in `tests/test-helpers.ts`**

In `tests/test-helpers.ts`, the `renderWithFactory` function has an inline theme: `{ fg: (_c: string, t: string) => t }`. Add rainbow:

Replace:

```ts
    { fg: (_c: string, t: string) => t },
```

With:

```ts
    { fg: (_c: string, t: string) => t, rainbow: (t: string) => t },
```

- [ ] **Step 4: Run full verification**

Run: `pnpm check`

Expected: Lint, typecheck, and all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts src/tui/render.ts src/tui/theme.ts tests/render.test.ts tests/test-helpers.ts
git commit -m "feat: extend theme with thinking-level colors and rainbow"
```
