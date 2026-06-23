# Phase 12: Deepen Resolve Footer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `snapshot.ts` to `resolve-footer.ts` and add a `resolveFooter()` function that owns the full decision chain (segment resolution + null dropping + extension status filtering). The main render path in `index.ts` switches to `resolveFooter` → `buildFooterLineFromResolved`. The old `buildFooterLine` stays exported for the editor preview path.

**Architecture:**

- `ResolvedSegment` type lives in `render.ts` (avoids circular deps — resolve-footer.ts imports from render.ts, never the reverse)
- `resolveFooter` returns `{ segments: ResolvedSegment[], extensionStatusText: string | null }` — owns both segment resolution and extension status formatting
- `buildFooterLineFromResolved` takes individual params (segments, extensionStatusText, theme, width) — pure paint + join + truncate
- `formatExtensionStatuses` gets exported from render.ts so resolveFooter can call it
- `buildFooterLine` stays unchanged for editor preview backward compat

**Dependency direction (no cycles):**

```
resolve-footer.ts → render.ts → formatters.ts
                  → shared/types.ts
```

**Tech Stack:** TypeScript 6, Vitest 4, Biome 2.5, pnpm

**Branch:** `20260622-phase-12-deepen-resolve-footer`

**Verification:**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

---

## File Structure

```
src/tui/render.ts            (adds ResolvedSegment type, exports formatExtensionStatuses, adds buildFooterLineFromResolved)
src/core/resolve-footer.ts   (renamed from snapshot.ts, adds resolveFooter)
src/index.ts                 (wired to resolveFooter → buildFooterLineFromResolved)
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

Change:

```ts
import { buildSnapshot } from "./core/snapshot.ts";
```

To:

```ts
import { buildSnapshot } from "./core/resolve-footer.ts";
```

- [ ] **Step 4: Update import in `tests/core/resolve-footer.test.ts`**

Change:

```ts
import { buildSnapshot, type SnapshotInput } from "../../src/core/snapshot.ts";
```

To:

```ts
import {
  buildSnapshot,
  type SnapshotInput,
} from "../../src/core/resolve-footer.ts";
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

### Task 2: Add ResolvedSegment type to render.ts and export formatExtensionStatuses

**Files:**

- Modify: `src/tui/render.ts`

- [ ] **Step 1: Add ResolvedSegment type**

Add after the `ThemeLike` type (around line 25):

```ts
export interface ResolvedSegment {
  text: string;
  color: FooterRenderColor | null;
}
```

- [ ] **Step 2: Export formatExtensionStatuses**

Change the existing `function formatExtensionStatuses(` to `export function formatExtensionStatuses(` (add `export` keyword, ~line 116).

- [ ] **Step 3: Run verification**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: add ResolvedSegment type and export formatExtensionStatuses

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
```

---

### Task 3: Add resolveFooter function

**Files:**

- Modify: `src/core/resolve-footer.ts`

- [ ] **Step 1: Add imports at the top of `src/core/resolve-footer.ts`**

Add after the existing import line:

```ts
import {
  formatExtensionStatuses,
  formatSegment,
  type FooterRenderColor,
  type ResolvedSegment,
  type ThemeLike,
} from "../tui/render.ts";
import type { PiStatusConfig } from "../shared/types.ts";
```

Note: Do NOT import `buildFooterLine` — it is not used by resolveFooter.

- [ ] **Step 2: Add resolveFooter function**

Add at the bottom of the file:

```ts
export function resolveFooter(
  snapshot: Omit<FooterRenderInput, "segments" | "extensionSegments">,
  config: PiStatusConfig,
  theme: ThemeLike,
): { segments: ResolvedSegment[]; extensionStatusText: string | null } {
  const input: FooterRenderInput = {
    ...snapshot,
    segments: config.segments,
    extensionSegments: config.extensionSegments,
  };

  const segments = input.segments
    .map((id) => formatSegment(id, input, theme))
    .filter((x): x is [string, FooterRenderColor | null] => x !== null)
    .map(([text, color]) => ({ text, color }));

  const extensionStatusText = formatExtensionStatuses(input, theme);

  return { segments, extensionStatusText };
}
```

- [ ] **Step 3: Run verification**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add resolveFooter function owning full decision chain

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
```

---

### Task 4: Add resolveFooter tests

**Files:**

- Modify: `tests/core/resolve-footer.test.ts`

- [ ] **Step 1: Update imports**

Replace the existing import line with:

```ts
import {
  buildSnapshot,
  resolveFooter,
  type SnapshotInput,
} from "../../src/core/resolve-footer.ts";
import type { ThemeLike } from "../../src/tui/render.ts";
```

Add the identityTheme helper after the `makeInput` function:

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
    expect(result.segments).toEqual([{ text: "idle", color: "dim" }]);
    expect(result.extensionStatusText).toBeNull();
  });

  it("drops null segments (model undefined)", () => {
    const snapshot = buildSnapshot(makeInput({ model: undefined }));
    const config = {
      segments: ["model" as const, "run-state" as const],
      extensionSegments: { hidden: [] },
    };
    const result = resolveFooter(snapshot, config, identityTheme);
    expect(result.segments).toEqual([{ text: "idle", color: "dim" }]);
  });

  it("preserves segment order from config", () => {
    const snapshot = buildSnapshot(makeInput({ gitBranch: "main" }));
    const config = {
      segments: ["git-branch" as const, "run-state" as const],
      extensionSegments: { hidden: [] },
    };
    const result = resolveFooter(snapshot, config, identityTheme);
    expect(result.segments[0]).toEqual({ text: "main", color: "warning" });
    expect(result.segments[1]).toEqual({ text: "idle", color: "dim" });
  });

  it("returns empty segments when all resolve to null", () => {
    const snapshot = buildSnapshot(
      makeInput({ model: undefined, gitBranch: null }),
    );
    const config = {
      segments: ["model" as const, "git-branch" as const],
      extensionSegments: { hidden: [] },
    };
    const result = resolveFooter(snapshot, config, identityTheme);
    expect(result.segments).toEqual([]);
  });

  it("handles empty segments array", () => {
    const snapshot = buildSnapshot(makeInput());
    const config = {
      segments: [] as const,
      extensionSegments: { hidden: [] },
    };
    const result = resolveFooter(snapshot, config, identityTheme);
    expect(result.segments).toEqual([]);
  });

  it("includes extension status text", () => {
    const snapshot = buildSnapshot(
      makeInput({
        extensionStatuses: new Map([["pi-usage", "5h: 60%"]]),
      }),
    );
    const config = {
      segments: ["run-state" as const],
      extensionSegments: { hidden: [] },
    };
    const result = resolveFooter(snapshot, config, identityTheme);
    expect(result.extensionStatusText).toBe("5h: 60%");
  });

  it("filters hidden extension statuses", () => {
    const snapshot = buildSnapshot(
      makeInput({
        extensionStatuses: new Map([
          ["pi-usage", "5h: 60%"],
          ["other-ext", "ok"],
        ]),
      }),
    );
    const config = {
      segments: ["run-state" as const],
      extensionSegments: { hidden: ["pi-usage"] },
    };
    const result = resolveFooter(snapshot, config, identityTheme);
    expect(result.extensionStatusText).toBe("ok");
  });

  it("returns null extensionStatusText when no extension statuses", () => {
    const snapshot = buildSnapshot(makeInput());
    const config = {
      segments: ["run-state" as const],
      extensionSegments: { hidden: [] },
    };
    const result = resolveFooter(snapshot, config, identityTheme);
    expect(result.extensionStatusText).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests**

```bash
pnpm test
```

Expected: all pass including 8 new resolveFooter tests.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: add resolveFooter unit tests

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
```

---

### Task 5: Add buildFooterLineFromResolved thin joiner

**Files:**

- Modify: `src/tui/render.ts`

- [ ] **Step 1: Add buildFooterLineFromResolved function**

Add at the bottom of `src/tui/render.ts` (no new imports needed — `ResolvedSegment` is defined locally in this file):

```ts
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

### Task 6: Wire resolveFooter into index.ts render path

The main render path switches to `resolveFooter` → `buildFooterLineFromResolved`. The editor preview path in `editor.ts` continues using `buildFooterLine` directly (no changes to editor.ts).

**Files:**

- Modify: `src/index.ts`

- [ ] **Step 1: Update imports in `src/index.ts`**

Change:

```ts
import { buildSnapshot } from "./core/resolve-footer.ts";
```

To:

```ts
import { buildSnapshot, resolveFooter } from "./core/resolve-footer.ts";
```

Change:

```ts
import { buildFooterLine } from "./tui/render.ts";
```

To:

```ts
import { buildFooterLineFromResolved } from "./tui/render.ts";
```

Note: `buildFooterLine` is no longer imported in `index.ts`. The editor imports it directly from render.ts in its own file.

- [ ] **Step 2: Update render function in `installFooter`**

In the `render(width)` method (around line 94-122), replace the footer line construction:

Change:

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

To:

```ts
const statusTheme = fromPiTheme(theme);
const { segments, extensionStatusText } = resolveFooter(
  snapshot,
  state.config,
  statusTheme,
);
const line = buildFooterLineFromResolved(
  segments,
  extensionStatusText,
  statusTheme,
  width,
);
```

- [ ] **Step 3: Run verification**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected: all pass, identical runtime behavior.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: wire resolveFooter into main render path

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
```
