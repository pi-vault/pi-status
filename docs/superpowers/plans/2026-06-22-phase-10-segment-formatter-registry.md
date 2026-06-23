# Phase 10: Segment Formatter Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 200-line switch statement in `formatSegment` with a `Map<SegmentId, Formatter>` registry, improving locality and making each formatter independently testable.

**Architecture:** Extract shared utilities (`formatCompactNumber`, `abbreviateHomeDir`, `findProjectRootLabel`, `normalizeThinkingLevel`) into `src/tui/render-utils.ts`. Move each switch case into a named formatter function in `src/tui/formatters.ts`. The `formatSegment` function becomes a 1-line registry lookup. Zero test changes required.

**Tech Stack:** TypeScript 6, Vitest 4, Biome 2.5, pnpm

**Branch:** `refactor/segment-formatter-registry`

**Verification:**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

---

## File Structure

```
src/tui/
├── render.ts          (slimmed: buildFooterLine + formatSegment as registry lookup + re-exports)
├── render-utils.ts    (NEW: shared formatting utilities)
├── formatters.ts      (NEW: 14 named formatters + registry map + threshold constants)
├── editor.ts          (unchanged)
└── theme.ts           (unchanged)
```

---

### Task 1: Extract render-utils.ts

**Files:**

- Create: `src/tui/render-utils.ts`
- Modify: `src/tui/render.ts`

- [ ] **Step 1: Create `src/tui/render-utils.ts` with shared utilities**

```ts
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { FooterRenderColor } from "./render.ts";

export function formatCompactNumber(value: number): string {
  if (value < 1000) return String(Math.trunc(value));
  const unit = value >= 1_000_000 ? "M" : "k";
  const divisor = unit === "M" ? 1_000_000 : 1_000;
  const short = (value / divisor).toFixed(1).replace(/\.0$/, "");
  return `${short}${unit}`;
}

export function abbreviateHomeDir(cwd: string, home = homedir()): string {
  if (!home) return cwd;
  if (cwd === home) return "~";
  if (cwd.startsWith(`${home}/`)) return `~${cwd.slice(home.length)}`;
  return cwd;
}

export function findProjectRootLabel(cwd: string): string | null {
  let current = cwd;
  while (true) {
    if (
      existsSync(join(current, ".git")) ||
      existsSync(join(current, ".pi/settings.json"))
    ) {
      const base = basename(current);
      return base || current;
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function normalizeThinkingLevel(level: string): string {
  switch (level) {
    case "minimal":
      return "min";
    case "medium":
      return "med";
    default:
      return level;
  }
}

export type ThinkingColor = Exclude<
  FooterRenderColor,
  "accent" | "dim" | "success" | "warning" | "error"
>;

/** Map thinking level to color — progressive warmth: off (dim gray) → high (gold). */
export function thinkingLevelColor(level: string): ThinkingColor {
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
      // Unknown levels fall back to the coolest color. If new levels are
      // added upstream, add a case here to preserve the warmth gradient.
      return "thinkingOff";
  }
}
```

> **Note:** `render-utils.ts` imports `FooterRenderColor` as a type-only import from `render.ts`. This creates a type-level circular reference (`render.ts` → `render-utils.ts` → `render.ts`), but TypeScript handles type-only circular imports without issue since they are erased at runtime.

- [ ] **Step 2: Update `src/tui/render.ts` — remove moved functions, add imports + re-exports**

Remove the function bodies of `formatCompactNumber`, `abbreviateHomeDir`, `findProjectRootLabel`, `normalizeThinkingLevel`, `thinkingLevelColor` and the `ThinkingColor` type alias from `render.ts`.

Remove the now-unused imports from `render.ts`:

```ts
// REMOVE these lines:
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
```

Add at the top of `render.ts` (after the `truncateToWidth` import):

```ts
import {
  abbreviateHomeDir,
  findProjectRootLabel,
  formatCompactNumber,
  normalizeThinkingLevel,
  thinkingLevelColor,
} from "./render-utils.ts";
```

`thinkingLevelColor` is needed by `formatModelWithReasoning` which remains in `render.ts`.

Add re-exports for backward compatibility (after the `DEFAULT_SEGMENTS` re-export on line 67):

```ts
export {
  abbreviateHomeDir,
  findProjectRootLabel,
  formatCompactNumber,
  normalizeThinkingLevel,
} from "./render-utils.ts";
```

- [ ] **Step 3: Run verification**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected: all pass, zero behavior change. Tests import from `render.ts` which re-exports.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: extract render-utils.ts with shared formatting utilities

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
```

---

### Task 2: Create formatters.ts with all 14 formatters

**Files:**

- Create: `src/tui/formatters.ts`

- [ ] **Step 1: Create `src/tui/formatters.ts`**

```ts
import type { StatusLineSegmentId } from "../shared/types.ts";
import type {
  FooterRenderColor,
  FooterRenderInput,
  ThemeLike,
} from "./render.ts";
import {
  abbreviateHomeDir,
  findProjectRootLabel,
  formatCompactNumber,
  normalizeThinkingLevel,
  thinkingLevelColor,
} from "./render-utils.ts";

export type SegmentFormatter = (
  input: FooterRenderInput,
  theme: ThemeLike,
) => [text: string, color: FooterRenderColor | null] | null;

// Threshold constants
export const CONTEXT_WARNING_THRESHOLD = 60;
export const CONTEXT_ERROR_THRESHOLD = 80;
export const RATE_WARNING_THRESHOLD = 70;
export const RATE_ERROR_THRESHOLD = 90;
export const REMAINING_WARNING_THRESHOLD = 40;
export const REMAINING_ERROR_THRESHOLD = 20;

function contextUsedColor(percent: number): "success" | "warning" | "error" {
  if (percent < CONTEXT_WARNING_THRESHOLD) return "success";
  if (percent < CONTEXT_ERROR_THRESHOLD) return "warning";
  return "error";
}

function contextRemainingColor(
  remainingPercent: number,
): "success" | "warning" | "error" {
  if (remainingPercent <= REMAINING_ERROR_THRESHOLD) return "error";
  if (remainingPercent <= REMAINING_WARNING_THRESHOLD) return "warning";
  return "success";
}

function getRateWindow(
  input: FooterRenderInput,
  key: "fiveHour" | "weekly",
): { usedPercent: number } | null {
  const snapshot = input.usageState?.compatibility?.currentLiveProviderSnapshot;
  const window = snapshot?.windows.find((item) => item.key === key);
  if (
    !window ||
    typeof window.usedPercent !== "number" ||
    window.unavailableReason
  ) {
    return null;
  }
  return { usedPercent: window.usedPercent };
}

function rateColor(usedPercent: number): "success" | "warning" | "error" {
  if (usedPercent < RATE_WARNING_THRESHOLD) return "success";
  if (usedPercent < RATE_ERROR_THRESHOLD) return "warning";
  return "error";
}

export function formatModel(
  input: FooterRenderInput,
  _theme: ThemeLike,
): [string, FooterRenderColor | null] | null {
  const value = input.model?.name ?? input.model?.id;
  return value ? [value, "accent"] : null;
}

export function formatModelWithReasoningSegment(
  input: FooterRenderInput,
  theme: ThemeLike,
): [string, FooterRenderColor | null] | null {
  const base = input.model?.name ?? input.model?.id;
  if (!base) return null;
  if (!input.model?.reasoning) return [base, "accent"];
  const abbrev = normalizeThinkingLevel(input.thinkingLevel);
  if (input.thinkingLevel === "xhigh") {
    return [
      `${theme.fg("accent", base)} ${theme.rainbow(`[${abbrev}]`)}`,
      null,
    ];
  }
  return [
    `${theme.fg("accent", base)} ${theme.fg(thinkingLevelColor(input.thinkingLevel), `[${abbrev}]`)}`,
    null,
  ];
}

export function formatCurrentDir(
  input: FooterRenderInput,
  _theme: ThemeLike,
): [string, FooterRenderColor | null] | null {
  const value = abbreviateHomeDir(input.cwd);
  return value ? [value, "success"] : null;
}

export function formatProjectName(
  input: FooterRenderInput,
  _theme: ThemeLike,
): [string, FooterRenderColor | null] | null {
  const value = findProjectRootLabel(input.cwd);
  return value ? [value, "success"] : null;
}

export function formatGitBranch(
  input: FooterRenderInput,
  _theme: ThemeLike,
): [string, FooterRenderColor | null] | null {
  return input.gitBranch ? [input.gitBranch, "warning"] : null;
}

export function formatRunState(
  input: FooterRenderInput,
  _theme: ThemeLike,
): [string, FooterRenderColor | null] | null {
  return [input.runState, input.runState === "idle" ? "dim" : "accent"];
}

export function formatContextUsed(
  input: FooterRenderInput,
  theme: ThemeLike,
): [string, FooterRenderColor | null] | null {
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

export function formatContextRemaining(
  input: FooterRenderInput,
  theme: ThemeLike,
): [string, FooterRenderColor | null] | null {
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

export function formatUsedTokens(
  input: FooterRenderInput,
  _theme: ThemeLike,
): [string, FooterRenderColor | null] | null {
  const value = input.branchTotals?.totalTokens;
  return value === undefined
    ? null
    : [`${formatCompactNumber(value)} tok`, "dim"];
}

export function formatTotalInputTokens(
  input: FooterRenderInput,
  _theme: ThemeLike,
): [string, FooterRenderColor | null] | null {
  const value = input.branchTotals?.input;
  return value === undefined ? null : [`↑${formatCompactNumber(value)}`, "dim"];
}

export function formatTotalOutputTokens(
  input: FooterRenderInput,
  _theme: ThemeLike,
): [string, FooterRenderColor | null] | null {
  const value = input.branchTotals?.output;
  return value === undefined ? null : [`↓${formatCompactNumber(value)}`, "dim"];
}

export function formatSessionId(
  input: FooterRenderInput,
  _theme: ThemeLike,
): [string, FooterRenderColor | null] | null {
  return input.sessionId ? [`sid ${input.sessionId.slice(0, 8)}`, "dim"] : null;
}

export function formatFiveHourLimit(
  input: FooterRenderInput,
  theme: ThemeLike,
): [string, FooterRenderColor | null] | null {
  const window = getRateWindow(input, "fiveHour");
  if (!window) return null;
  const remaining = Math.min(
    100,
    Math.max(0, 100 - Math.round(window.usedPercent)),
  );
  const dim = (s: string) => theme.fg("dim", s);
  return [
    `${dim("5h ")}${theme.fg(rateColor(window.usedPercent), `${remaining}%`)}${dim(" left")}`,
    null,
  ];
}

export function formatWeeklyLimit(
  input: FooterRenderInput,
  theme: ThemeLike,
): [string, FooterRenderColor | null] | null {
  const window = getRateWindow(input, "weekly");
  if (!window) return null;
  const remaining = Math.min(
    100,
    Math.max(0, 100 - Math.round(window.usedPercent)),
  );
  const dim = (s: string) => theme.fg("dim", s);
  return [
    `${dim("wk ")}${theme.fg(rateColor(window.usedPercent), `${remaining}%`)}${dim(" left")}`,
    null,
  ];
}

export const segmentFormatters = new Map<StatusLineSegmentId, SegmentFormatter>(
  [
    ["model", formatModel],
    ["model-with-reasoning", formatModelWithReasoningSegment],
    ["current-dir", formatCurrentDir],
    ["project-name", formatProjectName],
    ["git-branch", formatGitBranch],
    ["run-state", formatRunState],
    ["context-used", formatContextUsed],
    ["context-remaining", formatContextRemaining],
    ["used-tokens", formatUsedTokens],
    ["total-input-tokens", formatTotalInputTokens],
    ["total-output-tokens", formatTotalOutputTokens],
    ["session-id", formatSessionId],
    ["five-hour-limit", formatFiveHourLimit],
    ["weekly-limit", formatWeeklyLimit],
  ],
);
```

- [ ] **Step 2: Run typecheck to verify the new file compiles**

```bash
pnpm typecheck
```

Expected: PASS (file is valid but not yet wired in).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add formatters.ts with segment formatter registry

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
```

---

### Task 3: Wire formatSegment to use the registry

**Files:**

- Modify: `src/tui/render.ts`

- [ ] **Step 1: Replace formatSegment switch body with registry lookup**

In `src/tui/render.ts`, replace the entire `formatSegment` function (lines 226–313) with:

```ts
import { segmentFormatters } from "./formatters.ts";

export function formatSegment(
  id: StatusLineSegmentId,
  input: FooterRenderInput,
  theme: ThemeLike,
): [text: string, color: FooterRenderColor | null] | null {
  return segmentFormatters.get(id)?.(input, theme) ?? null;
}
```

- [ ] **Step 2: Remove dead code from render.ts**

Remove these functions that now live in `formatters.ts` (they are private helpers only used by the switch body):

- `contextUsedColor` (lines 126–130)
- `contextRemainingColor` (lines 132–138)
- `getRateWindow` (lines 140–150)
- `rateColor` (lines 152–156)

Note: `thinkingLevelColor` and `ThinkingColor` were already moved to `render-utils.ts` in Task 1 and imported back. They remain accessible to `formatModelWithReasoning`.

Keep `formatModelWithReasoning` function in render.ts (lines 88–104) as-is — it's a public API with a different signature `(model, thinkingLevel, theme)` that tests import directly. The internal `formatModelWithReasoningSegment` in `formatters.ts` duplicates the logic but reads from `input.model` / `input.thinkingLevel`. This minor duplication is acceptable since the exported wrapper is a separately-tested public API.

- [ ] **Step 3: Run verification**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected: all 1024+ lines of render tests pass unchanged. The `formatSegment` interface hasn't changed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: wire formatSegment to use formatter registry

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
```

---

### Task 4: Final cleanup — verify no dead code remains

**Files:**

- Modify: `src/tui/render.ts` (if needed)

- [ ] **Step 1: Review render.ts for orphaned imports/code**

After the previous steps, `src/tui/render.ts` should contain:

1. Import from `@earendil-works/pi-tui` (`truncateToWidth`)
2. Import from `../shared/types.ts` (`DEFAULT_SEGMENTS`, `ExtensionSegments`, `StatusLineSegmentId`)
3. Import from `./render-utils.ts` (re-exported utilities)
4. Import from `./formatters.ts` (`segmentFormatters`)
5. Type exports (`FooterRenderColor`, `ThemeLike`, `ModelLike`, `RunState`, `FooterRenderInput`)
6. Re-exports of utilities for backward compat
7. `formatModelWithReasoning` standalone function (public API)
8. `formatSegment` (1-line registry lookup)
9. `hasAnsi`, `normalizeFilterList`, `formatExtensionStatuses` (private helpers)
10. `buildFooterLine` function

Remove any imports no longer used (e.g., `homedir` from `node:os` if it was only used by `abbreviateHomeDir`).

- [ ] **Step 2: Run final verification**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected: all pass.

- [ ] **Step 3: Commit (only if changes were made)**

```bash
git add -A
git commit -m "chore: remove dead imports from render.ts

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
```
