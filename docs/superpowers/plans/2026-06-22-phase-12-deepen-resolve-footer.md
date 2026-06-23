# Phase 12: Deepen Resolve Footer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `snapshot.ts` to `resolve-footer.ts` and add a `resolveFooter()` function that owns the full decision chain (segment resolution + null dropping + extension status filtering), leaving `buildFooterLine` as a thin color-applier and joiner.

**Architecture:** The new `resolveFooter` takes a snapshot + config + theme, returns `ResolvedSegment[]` (ready-to-paint text/color pairs). `buildFooterLine` shrinks to: apply colors, join with separator, truncate. This deepens the module by giving it real responsibility instead of being a passthrough.

**Tech Stack:** TypeScript 6, Vitest 4, Biome 2.5, pnpm

**Branch:** `refactor/deepen-resolve-footer`

**Verification:**
```bash
pnpm lint && pnpm typecheck && pnpm test
```

---

## File Structure

```
src/core/resolve-footer.ts   (renamed from snapshot.ts, adds resolveFooter)
src/tui/render.ts            (buildFooterLine slimmed OR new thin buildFooterLineFromResolved)
src/index.ts                 (updated imports)
tests/core/resolve-footer.test.ts (renamed from snapshot.test.ts, adds resolveFooter tests)
```

---

### Task 1: Rename snapshot files

**Files:**
- Rename: `src/core/snapshot.ts` → `src/core/resolve-footer.ts`
- Rename: `tests/core/snapshot.test.ts` → `tests/core/resolve-footer.test.ts`
- Modify: `src/index.ts`
- Modify: `tests/core/resolve-footer.test.ts`

- [ ] **Step 1: Git rename source**

```bash
git mv src/core/snapshot.ts src/core/resolve-footer.ts
```

- [ ] **Step 2: Git rename test**

```bash
git mv tests/core/snapshot.test.ts tests/core/resolve-footer.test.ts
```

- [ ] **Step 3: Update import in `src/index.ts`**

Change line 6:
```ts
import { buildSnapshot } from "./core/snapshot.ts";
```
To:
```ts
import { buildSnapshot } from "./core/resolve-footer.ts";
```

- [ ] **Step 4: Update import in `tests/core/resolve-footer.test.ts`**

Change line 2:
```ts
import { buildSnapshot, type SnapshotInput } from "../../src/core/snapshot.ts";
```
To:
```ts
import { buildSnapshot, type SnapshotInput } from "../../src/core/resolve-footer.ts";
```

- [ ] **Step 5: Run verification**

```bash
pnpm lint && pnpm typecheck && pnpm test
```
Expected: all pass, zero behavior change.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: rename snapshot.ts → resolve-footer.ts

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
```

---

### Task 2: Add ResolvedSegment type and resolveFooter function

**Files:**
- Modify: `src/core/resolve-footer.ts`

- [ ] **Step 1: Add imports at the top of `src/core/resolve-footer.ts`**

Add after the existing import:

```ts
import {
  buildFooterLine,
  formatSegment,
  type FooterRenderColor,
  type ThemeLike,
} from "../tui/render.ts";
import type { PiStatusConfig } from "../shared/types.ts";
```

- [ ] **Step 2: Add ResolvedSegment type**

Add after the `SnapshotInput` type:

```ts
export interface ResolvedSegment {
  text: string;
  color: FooterRenderColor | null;
}
```

- [ ] **Step 3: Add resolveFooter function**

Add at the bottom of the file:

```ts
export function resolveFooter(
  snapshot: Omit<FooterRenderInput, "segments" | "extensionSegments">,
  config: PiStatusConfig,
  theme: ThemeLike,
): ResolvedSegment[] {
  const input: FooterRenderInput = {
    ...snapshot,
    segments: config.segments,
    extensionSegments: config.extensionSegments,
  };

  return input.segments
    .map((id) => formatSegment(id, input, theme))
    .filter((x): x is [string, FooterRenderColor | null] => x !== null)
    .map(([text, color]) => ({ text, color }));
}
```

- [ ] **Step 4: Run verification**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add resolveFooter function with ResolvedSegment type

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
```

---

### Task 3: Add resolveFooter tests

**Files:**
- Modify: `tests/core/resolve-footer.test.ts`

- [ ] **Step 1: Add imports for resolveFooter**

Add at the top of the test file:

```ts
import {
  buildSnapshot,
  resolveFooter,
  type ResolvedSegment,
  type SnapshotInput,
} from "../../src/core/resolve-footer.ts";
import type { ThemeLike } from "../../src/tui/render.ts";
```

And add the identityTheme helper:

```ts
const identityTheme: ThemeLike = { fg: (_c, t) => t, rainbow: (t) => t };
```

- [ ] **Step 2: Add resolveFooter describe block**

Add at the bottom of the file:

```ts
describe("resolveFooter", () => {
  it("resolves configured segments into text/color pairs", () => {
    const snapshot = buildSnapshot(makeInput());
    const config = {
      segments: ["run-state" as const],
      extensionSegments: { hidden: [] },
    };
    const result = resolveFooter(snapshot, config, identityTheme);
    expect(result).toEqual([{ text: "idle", color: "dim" }]);
  });

  it("drops null segments (model undefined)", () => {
    const snapshot = buildSnapshot(makeInput({ model: undefined }));
    const config = {
      segments: ["model" as const, "run-state" as const],
      extensionSegments: { hidden: [] },
    };
    const result = resolveFooter(snapshot, config, identityTheme);
    expect(result).toEqual([{ text: "idle", color: "dim" }]);
  });

  it("preserves segment order from config", () => {
    const snapshot = buildSnapshot(makeInput({ gitBranch: "main" }));
    const config = {
      segments: ["git-branch" as const, "run-state" as const],
      extensionSegments: { hidden: [] },
    };
    const result = resolveFooter(snapshot, config, identityTheme);
    expect(result[0]).toEqual({ text: "main", color: "warning" });
    expect(result[1]).toEqual({ text: "idle", color: "dim" });
  });

  it("returns empty array when all segments resolve to null", () => {
    const snapshot = buildSnapshot(
      makeInput({ model: undefined, gitBranch: null }),
    );
    const config = {
      segments: ["model" as const, "git-branch" as const],
      extensionSegments: { hidden: [] },
    };
    const result = resolveFooter(snapshot, config, identityTheme);
    expect(result).toEqual([]);
  });

  it("handles empty segments array", () => {
    const snapshot = buildSnapshot(makeInput());
    const config = {
      segments: [] as const,
      extensionSegments: { hidden: [] },
    };
    const result = resolveFooter(snapshot, config, identityTheme);
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
pnpm test
```
Expected: all pass including 5 new tests.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: add resolveFooter unit tests

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
```

---

### Task 4: Add buildFooterLineFromResolved thin joiner

**Files:**
- Modify: `src/tui/render.ts`

- [ ] **Step 1: Add buildFooterLineFromResolved function**

Add at the bottom of `src/tui/render.ts`:

```ts
import type { ResolvedSegment } from "../core/resolve-footer.ts";

export function buildFooterLineFromResolved(
  segments: ResolvedSegment[],
  extensionStatusText: string | null,
  theme: ThemeLike,
  width: number,
): string {
  const parts = segments.map(({ text, color }) =>
    color ? theme.fg(color, text) : text,
  );
  if (extensionStatusText) parts.push(extensionStatusText);
  const line = parts.join(theme.fg("dim", " · "));
  return truncateToWidth(line, width);
}
```

- [ ] **Step 2: Run verification**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add buildFooterLineFromResolved thin joiner

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
```

---

### Task 5: Wire resolveFooter in index.ts render path (optional optimization)

This task makes the render path use the new `resolveFooter` → `buildFooterLineFromResolved` flow. The old `buildFooterLine` stays for backward compat (used by editor preview).

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Update footer render in index.ts**

In the `render(width)` function inside `installFooter`, after `buildSnapshot(...)`, add the new path:

```ts
import { buildSnapshot, resolveFooter } from "./core/resolve-footer.ts";
import { buildFooterLine, buildFooterLineFromResolved, formatExtensionStatuses } from "./tui/render.ts";
```

Note: `formatExtensionStatuses` is currently not exported. For now, keep using `buildFooterLine` in the main render path — the new function is available for future use when Phase 4 (Runtime State Machine) consolidates the render flow.

Actually, let's keep the current `buildFooterLine` call unchanged in `index.ts` for this phase. The key deliverable is that `resolveFooter` exists as a tested, usable function. Phase 4 will wire the full new flow.

- [ ] **Step 2: Run verification (no changes needed if keeping buildFooterLine)**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

- [ ] **Step 3: Commit (skip if no changes)**

No commit needed — this task is informational. The refactoring payoff comes in Phase 14 (Runtime State Machine).
