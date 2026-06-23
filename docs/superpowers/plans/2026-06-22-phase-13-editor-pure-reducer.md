# Phase 13: Editor Pure Reducer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 512-LOC `editor.ts` closure into three focused files: pure state+reducer, pure render, and thin shell. Make state transitions testable without rendering, and rendering testable without key simulation.

**Architecture:** `editor-state.ts` owns `EditorState` type + `editorReducer` (pure function: state + action → result). `editor-render.ts` owns `renderEditor` (state → string[]). `editor.ts` shrinks to ~60 lines gluing key presses → actions → reducer → render.

**Tech Stack:** TypeScript 6, Vitest 4, Biome 2.5, pnpm

**Branch:** `20260622-phase-13-editor-pure-reducer`

**Verification:**
```bash
pnpm lint && pnpm typecheck && pnpm test
```

---

## File Structure

```
src/tui/
├── editor.ts            (Shell: ~60 lines — key→action dispatch, calls reducer+render)
├── editor-state.ts      (NEW: ~180 lines — EditorState, EditorAction, editorReducer, initEditorState)
├── editor-render.ts     (NEW: ~220 lines — renderEditor, row rendering helpers)
├── render.ts            (buildFooterLine delegates to buildFooterLineFromResolved)
└── theme.ts             (unchanged)

tests/tui/
├── editor.test.ts            (existing 60 tests stay as regression net — unchanged)
├── editor-state.test.ts      (NEW: pure state transition tests)
├── editor-render.test.ts     (NEW: state → output assertions)
```

---

### Task 0: Consolidate buildFooterLine → buildFooterLineFromResolved

**Why:** Phase 12 introduced `buildFooterLineFromResolved` as a thin joiner, but `buildFooterLine` still duplicates the same join+truncate logic inline. Consolidating now means `editor-render.ts` (Task 3) inherits a single code path from day one.

**Files:**
- Modify: `src/tui/render.ts`

- [ ] **Step 1: Make buildFooterLine delegate to buildFooterLineFromResolved**

Replace the body of `buildFooterLine` so it resolves segments, then delegates:

```ts
export function buildFooterLine(
  input: FooterRenderInput,
  theme: ThemeLike,
  width: number,
): string {
  const segments = input.segments
    .map((id) => formatSegment(id, input, theme))
    .filter((x): x is [string, FooterRenderColor | null] => x !== null)
    .map(([text, color]) => ({ text, color }));

  const extensionStatusText = formatExtensionStatuses(input, theme);

  return buildFooterLineFromResolved(segments, extensionStatusText, theme, width);
}
```

- [ ] **Step 2: Run verification**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

All 255+ existing tests must pass unchanged — this is a pure refactor.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: buildFooterLine delegates to buildFooterLineFromResolved

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
```

---

### Task 1: Create editor-state.ts with types and initEditorState

**Files:**
- Create: `src/tui/editor-state.ts`

- [ ] **Step 1: Create the file with types and init function**

```ts
import type { PiStatusConfig, StatusLineSegmentId } from "../shared/types.ts";
import { isUsageSegment } from "../shared/types.ts";

type SegmentMetadata = {
  id: StatusLineSegmentId;
  label: string;
  description: string;
};

const SEGMENT_ORDER: readonly SegmentMetadata[] = [
  { id: "model", label: "Model", description: "Current model name" },
  {
    id: "model-with-reasoning",
    label: "Model + Reasoning",
    description: "Current model name with reasoning level",
  },
  {
    id: "project-name",
    label: "Project Name",
    description: "Project name (omitted when unavailable)",
  },
  {
    id: "current-dir",
    label: "Current Dir",
    description: "Current working directory",
  },
  {
    id: "git-branch",
    label: "Git Branch",
    description: "Current Git branch (omitted when unavailable)",
  },
  {
    id: "run-state",
    label: "Run State",
    description: "Pi status (idle, queued, busy)",
  },
  {
    id: "context-remaining",
    label: "Context Remaining",
    description:
      "Context tokens remaining vs window size (omitted when unknown)",
  },
  {
    id: "context-used",
    label: "Context Used",
    description: "Context tokens used vs window size (omitted when unknown)",
  },
  {
    id: "used-tokens",
    label: "Used Tokens",
    description: "Total tokens used in session (omitted when zero)",
  },
  {
    id: "total-input-tokens",
    label: "Input Tokens",
    description: "Total input tokens used in session",
  },
  {
    id: "total-output-tokens",
    label: "Output Tokens",
    description: "Total output tokens used in session",
  },
  {
    id: "session-id",
    label: "Session ID",
    description: "Current session ID (omitted when unavailable)",
  },
  {
    id: "five-hour-limit",
    label: "5h Limit",
    description:
      "Remaining usage on the primary usage limit (omitted when unavailable)",
  },
  {
    id: "weekly-limit",
    label: "Weekly Limit",
    description:
      "Remaining usage on the secondary usage limit (omitted when unavailable)",
  },
] as const;

export const SEGMENT_METADATA = new Map(
  SEGMENT_ORDER.map((segment) => [segment.id, segment]),
);

export interface EditorState {
  enabledSegments: StatusLineSegmentId[];
  visibleSegments: readonly SegmentMetadata[];
  orderedStatuses: string[];
  shownStatuses: Set<string>;
  selectedIndex: number;
  query: string;
}

export type EditorAction =
  | { type: "move_up" }
  | { type: "move_down" }
  | { type: "toggle" }
  | { type: "reorder_left" }
  | { type: "reorder_right" }
  | { type: "type_char"; char: string }
  | { type: "backspace" }
  | { type: "save" }
  | { type: "cancel" };

export type EditorResult =
  | { type: "next"; state: EditorState }
  | { type: "done"; config: PiStatusConfig | null };

export type SegmentInteractiveRow = { type: "segment"; id: StatusLineSegmentId };
export type StatusInteractiveRow = { type: "status"; key: string };
export type InteractiveRow = SegmentInteractiveRow | StatusInteractiveRow;

export function collectHiddenStatuses(input: {
  discoveredKeys: string[];
  shownKeys: Iterable<string>;
}): string[] {
  const discovered = [...input.discoveredKeys].sort((a, b) =>
    a.localeCompare(b),
  );
  const shown = new Set(input.shownKeys);
  return discovered.filter((k) => !shown.has(k));
}

function includesFuzzy(haystack: string, needle: string): boolean {
  if (!needle) return true;
  let j = 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  for (let i = 0; i < h.length && j < n.length; i++) if (h[i] === n[j]) j++;
  return j === n.length;
}

export function isEnabledSegment(
  state: EditorState,
  id: StatusLineSegmentId,
): boolean {
  return state.enabledSegments.includes(id);
}

export function getInteractiveRows(state: EditorState): InteractiveRow[] {
  const enabled = state.enabledSegments
    .filter((id): id is StatusLineSegmentId =>
      state.visibleSegments.some((segment) => segment.id === id),
    )
    .map((id) => ({ type: "segment" as const, id }));

  const disabled = state.visibleSegments
    .filter((segment) => !isEnabledSegment(state, segment.id))
    .map((segment) => ({ type: "segment" as const, id: segment.id }));

  const statuses = state.orderedStatuses.map((key) => ({
    type: "status" as const,
    key,
  }));

  return [...enabled, ...disabled, ...statuses];
}

function rowMatchesQuery(state: EditorState, row: InteractiveRow): boolean {
  if (!state.query) return true;
  if (row.type === "segment") {
    const meta = SEGMENT_METADATA.get(row.id);
    if (!meta) return false;
    return includesFuzzy(`${meta.label} ${meta.description}`, state.query);
  }
  return includesFuzzy(
    `${row.key} Toggle visibility in the status line`,
    state.query,
  );
}

export function getFilteredRows(state: EditorState): InteractiveRow[] {
  return getInteractiveRows(state).filter((row) =>
    rowMatchesQuery(state, row),
  );
}

function clampIndex(state: EditorState, index: number): number {
  const list = getFilteredRows(state);
  if (list.length === 0) return 0;
  if (index < 0) return 0;
  if (index >= list.length) return list.length - 1;
  return index;
}

function toConfig(state: EditorState): PiStatusConfig {
  return {
    segments: state.enabledSegments,
    extensionSegments: {
      hidden: collectHiddenStatuses({
        discoveredKeys: state.orderedStatuses,
        shownKeys: state.shownStatuses,
      }),
    },
  };
}

export function initEditorState(
  config: PiStatusConfig,
  discoveredStatuses: string[],
  usageAvailable = true,
): EditorState {
  const orderedStatuses = [...discoveredStatuses].sort((a, b) =>
    a.localeCompare(b),
  );
  const visibleSegments = SEGMENT_ORDER.filter(
    (segment) => usageAvailable || !isUsageSegment(segment.id),
  );
  const hiddenSet = new Set(config.extensionSegments.hidden);
  const shownStatuses = new Set(
    orderedStatuses.filter((x) => !hiddenSet.has(x)),
  );

  return {
    enabledSegments: [...config.segments],
    visibleSegments,
    orderedStatuses,
    shownStatuses,
    selectedIndex: 0,
    query: "",
  };
}

export function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorResult {
  switch (action.type) {
    case "cancel":
      return { type: "done", config: null };

    case "save":
      return { type: "done", config: toConfig(state) };

    case "move_up": {
      const next = clampIndex(state, state.selectedIndex - 1);
      return { type: "next", state: { ...state, selectedIndex: next } };
    }

    case "move_down": {
      const next = clampIndex(state, state.selectedIndex + 1);
      return { type: "next", state: { ...state, selectedIndex: next } };
    }

    case "toggle": {
      const list = getFilteredRows(state);
      const idx = clampIndex(state, state.selectedIndex);
      const current = list[idx];
      if (!current) return { type: "next", state };

      if (current.type === "segment") {
        const enabled = isEnabledSegment(state, current.id);
        const enabledSegments = enabled
          ? state.enabledSegments.filter((x) => x !== current.id)
          : [...state.enabledSegments, current.id];
        const newState = { ...state, enabledSegments, selectedIndex: idx };
        return {
          type: "next",
          state: {
            ...newState,
            selectedIndex: clampIndex(newState, idx),
          },
        };
      }

      // status toggle
      const shownStatuses = new Set(state.shownStatuses);
      if (shownStatuses.has(current.key)) shownStatuses.delete(current.key);
      else shownStatuses.add(current.key);
      return {
        type: "next",
        state: { ...state, shownStatuses, selectedIndex: idx },
      };
    }

    case "reorder_left":
    case "reorder_right": {
      if (state.query) return { type: "next", state };
      const list = getFilteredRows(state);
      const idx = clampIndex(state, state.selectedIndex);
      const current = list[idx];
      if (!current || current.type !== "segment") return { type: "next", state };

      const segIdx = state.enabledSegments.indexOf(current.id);
      if (segIdx < 0) return { type: "next", state };

      const delta = action.type === "reorder_left" ? -1 : 1;
      const next = segIdx + delta;
      if (next < 0 || next >= state.enabledSegments.length)
        return { type: "next", state };

      const copy = [...state.enabledSegments];
      const [item] = copy.splice(segIdx, 1);
      copy.splice(next, 0, item);
      const selectedIndex = clampIndex(
        { ...state, enabledSegments: copy },
        state.selectedIndex + delta,
      );
      return {
        type: "next",
        state: { ...state, enabledSegments: copy, selectedIndex },
      };
    }

    case "type_char": {
      const query = state.query + action.char;
      const newState = { ...state, query };
      return {
        type: "next",
        state: {
          ...newState,
          selectedIndex: clampIndex(newState, state.selectedIndex),
        },
      };
    }

    case "backspace": {
      if (state.query.length === 0) return { type: "next", state };
      const query = state.query.slice(0, -1);
      const newState = { ...state, query };
      return {
        type: "next",
        state: {
          ...newState,
          selectedIndex: clampIndex(newState, state.selectedIndex),
        },
      };
    }
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: extract editor-state.ts with pure reducer

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
```

---

### Task 2: Add editor-state unit tests

**Files:**
- Create: `tests/tui/editor-state.test.ts`

- [ ] **Step 1: Write tests**

```ts
import { describe, expect, it } from "vitest";
import {
  editorReducer,
  getFilteredRows,
  initEditorState,
} from "../../src/tui/editor-state.ts";

function makeState(overrides?: {
  segments?: Parameters<typeof initEditorState>[0]["segments"];
  discovered?: string[];
  usageAvailable?: boolean;
}) {
  return initEditorState(
    {
      segments: overrides?.segments ?? ["model-with-reasoning", "current-dir"],
      extensionSegments: { hidden: [] },
    },
    overrides?.discovered ?? [],
    overrides?.usageAvailable,
  );
}

describe("initEditorState", () => {
  it("initializes with config segments as enabled", () => {
    const state = makeState({ segments: ["model", "git-branch"] });
    expect(state.enabledSegments).toEqual(["model", "git-branch"]);
  });

  it("starts with selectedIndex 0 and empty query", () => {
    const state = makeState();
    expect(state.selectedIndex).toBe(0);
    expect(state.query).toBe("");
  });

  it("filters usage segments when usageAvailable is false", () => {
    const state = makeState({ usageAvailable: false });
    const ids = state.visibleSegments.map((s) => s.id);
    expect(ids).not.toContain("five-hour-limit");
    expect(ids).not.toContain("weekly-limit");
  });

  it("includes usage segments when usageAvailable is true", () => {
    const state = makeState({ usageAvailable: true });
    const ids = state.visibleSegments.map((s) => s.id);
    expect(ids).toContain("five-hour-limit");
    expect(ids).toContain("weekly-limit");
  });
});

describe("editorReducer — navigation", () => {
  it("move_down increments selectedIndex", () => {
    const state = makeState();
    const result = editorReducer(state, { type: "move_down" });
    expect(result.type).toBe("next");
    if (result.type === "next") {
      expect(result.state.selectedIndex).toBe(1);
    }
  });

  it("move_up decrements selectedIndex", () => {
    const state = { ...makeState(), selectedIndex: 2 };
    const result = editorReducer(state, { type: "move_up" });
    if (result.type === "next") {
      expect(result.state.selectedIndex).toBe(1);
    }
  });

  it("move_up clamps to 0", () => {
    const state = makeState();
    const result = editorReducer(state, { type: "move_up" });
    if (result.type === "next") {
      expect(result.state.selectedIndex).toBe(0);
    }
  });

  it("move_down clamps to last index", () => {
    const state = makeState();
    const list = getFilteredRows(state);
    const atEnd = { ...state, selectedIndex: list.length - 1 };
    const result = editorReducer(atEnd, { type: "move_down" });
    if (result.type === "next") {
      expect(result.state.selectedIndex).toBe(list.length - 1);
    }
  });
});

describe("editorReducer — toggle", () => {
  it("toggle removes first enabled segment", () => {
    const state = makeState({ segments: ["model", "current-dir"] });
    const result = editorReducer(state, { type: "toggle" });
    if (result.type === "next") {
      expect(result.state.enabledSegments).toEqual(["current-dir"]);
    }
  });

  it("toggle adds disabled segment", () => {
    const state = makeState({ segments: ["model"] });
    // move to first disabled segment (after model in the list)
    const list = getFilteredRows(state);
    const firstDisabledIdx = list.findIndex(
      (r) => r.type === "segment" && r.id !== "model",
    );
    const positioned = { ...state, selectedIndex: firstDisabledIdx };
    const result = editorReducer(positioned, { type: "toggle" });
    if (result.type === "next") {
      expect(result.state.enabledSegments.length).toBe(2);
    }
  });
});

describe("editorReducer — reorder", () => {
  it("reorder_right swaps segment forward", () => {
    const state = makeState({ segments: ["model", "current-dir", "git-branch"] });
    // selectedIndex 0 → model
    const result = editorReducer(state, { type: "reorder_right" });
    if (result.type === "next") {
      expect(result.state.enabledSegments).toEqual([
        "current-dir",
        "model",
        "git-branch",
      ]);
    }
  });

  it("reorder_left does nothing at index 0", () => {
    const state = makeState({ segments: ["model", "current-dir"] });
    const result = editorReducer(state, { type: "reorder_left" });
    if (result.type === "next") {
      expect(result.state.enabledSegments).toEqual(["model", "current-dir"]);
    }
  });

  it("reorder is disabled while searching", () => {
    const state = { ...makeState({ segments: ["model", "current-dir"] }), query: "m" };
    const result = editorReducer(state, { type: "reorder_right" });
    if (result.type === "next") {
      expect(result.state.enabledSegments).toEqual(["model", "current-dir"]);
    }
  });
});

describe("editorReducer — search", () => {
  it("type_char appends to query", () => {
    const state = makeState();
    const result = editorReducer(state, { type: "type_char", char: "m" });
    if (result.type === "next") {
      expect(result.state.query).toBe("m");
    }
  });

  it("backspace removes last char", () => {
    const state = { ...makeState(), query: "mod" };
    const result = editorReducer(state, { type: "backspace" });
    if (result.type === "next") {
      expect(result.state.query).toBe("mo");
    }
  });

  it("backspace on empty query is no-op", () => {
    const state = makeState();
    const result = editorReducer(state, { type: "backspace" });
    if (result.type === "next") {
      expect(result.state.query).toBe("");
    }
  });
});

describe("editorReducer — save/cancel", () => {
  it("save returns done with config", () => {
    const state = makeState({ segments: ["model"] });
    const result = editorReducer(state, { type: "save" });
    expect(result.type).toBe("done");
    if (result.type === "done") {
      expect(result.config).not.toBeNull();
      expect(result.config?.segments).toEqual(["model"]);
    }
  });

  it("cancel returns done with null", () => {
    const state = makeState();
    const result = editorReducer(state, { type: "cancel" });
    expect(result).toEqual({ type: "done", config: null });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm test tests/tui/editor-state.test.ts
```
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: add editor-state pure reducer tests

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
```

---

### Task 3: Create editor-render.ts

**Files:**
- Create: `src/tui/editor-render.ts`

- [ ] **Step 1: Create the file with render functions**

```ts
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { FooterRenderInput } from "./render.ts";
import { buildFooterLine } from "./render.ts";
import type { StatusLineTheme } from "./theme.ts";
import {
  type EditorState,
  type InteractiveRow,
  getFilteredRows,
  isEnabledSegment,
  SEGMENT_METADATA,
} from "./editor-state.ts";

const STATUS_ROW_DESCRIPTION = "Toggle visibility in the status line";
const EMPTY_EXTENSION_STATUSES_HINT = "No extension statuses yet.";
const SEGMENT_SECTION_TITLE = "Status line items";
const STATUS_SECTION_TITLE = "Extension statuses";

const LABEL_COLUMN_WIDTH = 24;
const LAYOUT_GAP = "  ";
const MIN_DESCRIPTION_WIDTH = 12;

const SHELL_TITLE = "Configure Status Line";
const SHELL_SUBTITLE = "Select which items to display in the status line.";
const SHELL_PLACEHOLDER = "Type to search";
const HELP_BASE =
  "Toggle: Space  •  Reorder: ← / →  •  Save: Enter  •  Cancel: Esc";
const HELP_SEARCHING =
  "Toggle: Space  •  Reorder: disabled while search is active  •  Save: Enter  •  Cancel: Esc";

type RenderRow =
  | { type: "header"; text: string }
  | { type: "divider" }
  | { type: "hint"; text: string }
  | { type: "interactive"; row: InteractiveRow; interactiveIndex: number };

function styleSelected(
  text: string,
  theme: StatusLineTheme,
  selected: boolean,
): string {
  return selected ? theme.fg("accent", theme.bold(text)) : text;
}

function renderRowLine(
  row: {
    selected: boolean;
    checkbox: string;
    labelWithOrder: string;
    description: string;
  },
  width: number,
  theme: StatusLineTheme,
): string {
  if (width < 1) return "";

  const markerRaw = row.selected ? "\u25B8" : " ";
  const marker = row.selected ? theme.fg("accent", markerRaw) : markerRaw;
  const prefixRaw = `${markerRaw} ${row.checkbox} `;
  const prefixWidth = visibleWidth(prefixRaw);
  const alignedMinWidth =
    prefixWidth +
    LABEL_COLUMN_WIDTH +
    LAYOUT_GAP.length +
    MIN_DESCRIPTION_WIDTH;

  const checkbox = styleSelected(row.checkbox, theme, row.selected);

  if (width < prefixWidth) return truncateToWidth(marker, width);

  if (width >= alignedMinWidth) {
    const labelFitted = truncateToWidth(row.labelWithOrder, LABEL_COLUMN_WIDTH);
    const labelPadded = labelFitted.padEnd(LABEL_COLUMN_WIDTH);
    const descWidth = Math.max(
      1,
      width - prefixWidth - LABEL_COLUMN_WIDTH - LAYOUT_GAP.length,
    );
    const desc = truncateToWidth(row.description, descWidth);
    const label = styleSelected(labelPadded, theme, row.selected);
    return `${marker} ${checkbox} ${label}${LAYOUT_GAP}${theme.dim(desc)}`;
  }

  const separator = " - ";
  const remainingWidth = width - prefixWidth;
  if (remainingWidth <= separator.length + 1) {
    const label = truncateToWidth(
      row.labelWithOrder,
      Math.max(0, width - prefixWidth),
    );
    return truncateToWidth(`${markerRaw} ${row.checkbox} ${label}`, width);
  }

  const labelWidth = Math.max(1, remainingWidth - separator.length - 1);
  const labelRaw = truncateToWidth(row.labelWithOrder, labelWidth);
  const fallbackBaseRaw = `${prefixRaw}${labelRaw}${separator}`;
  const fallbackDescWidth = Math.max(0, width - visibleWidth(fallbackBaseRaw));
  const desc = truncateToWidth(row.description, fallbackDescWidth);
  const label = styleSelected(labelRaw, theme, row.selected);
  return `${marker} ${checkbox} ${label}${separator}${theme.dim(desc)}`;
}

function renderSectionHeader(
  text: string,
  width: number,
  theme: StatusLineTheme,
): string {
  return truncateToWidth(theme.dim(text), width);
}

function renderDivider(width: number, theme: StatusLineTheme): string {
  return truncateToWidth(
    theme.fg("borderMuted", "─".repeat(Math.max(1, width))),
    width,
  );
}

function renderHint(
  text: string,
  width: number,
  theme: StatusLineTheme,
): string {
  return truncateToWidth(theme.dim(text), width);
}

function getRenderRows(state: EditorState): RenderRow[] {
  const filtered = getFilteredRows(state);
  if (state.query) {
    return filtered.map((row, interactiveIndex) => ({
      type: "interactive" as const,
      row,
      interactiveIndex,
    }));
  }

  const segmentRows = filtered.filter(
    (row): row is Extract<InteractiveRow, { type: "segment" }> =>
      row.type === "segment",
  );
  const extensionRows = filtered.filter(
    (row): row is Extract<InteractiveRow, { type: "status" }> =>
      row.type === "status",
  );

  const renderRows: RenderRow[] = [];
  let interactiveIndex = 0;
  renderRows.push({ type: "header", text: SEGMENT_SECTION_TITLE });
  for (const row of segmentRows)
    renderRows.push({
      type: "interactive",
      row,
      interactiveIndex: interactiveIndex++,
    });
  renderRows.push({ type: "divider" });
  renderRows.push({ type: "header", text: STATUS_SECTION_TITLE });
  for (const row of extensionRows)
    renderRows.push({
      type: "interactive",
      row,
      interactiveIndex: interactiveIndex++,
    });
  if (state.orderedStatuses.length === 0)
    renderRows.push({ type: "hint", text: EMPTY_EXTENSION_STATUSES_HINT });
  return renderRows;
}

export function renderEditor(
  state: EditorState,
  previewInput: Omit<FooterRenderInput, "segments" | "extensionSegments">,
  theme: StatusLineTheme,
  width: number,
): string[] {
  const renderRows = getRenderRows(state);
  const config = {
    segments: state.enabledSegments,
    extensionSegments: {
      hidden: state.orderedStatuses.filter(
        (k) => !state.shownStatuses.has(k),
      ),
    },
  };
  const preview = buildFooterLine(
    { ...previewInput, segments: config.segments, extensionSegments: config.extensionSegments },
    theme,
    width,
  );

  const lines: string[] = [];
  lines.push(
    truncateToWidth(theme.fg("accent", theme.bold(SHELL_TITLE)), width),
  );
  lines.push(truncateToWidth(theme.dim(SHELL_SUBTITLE), width));
  lines.push(truncateToWidth("", width));
  lines.push(truncateToWidth(theme.dim(SHELL_PLACEHOLDER), width));
  lines.push(truncateToWidth(`\u25B8 ${state.query}`, width));

  for (const renderRow of renderRows) {
    if (renderRow.type === "header") {
      lines.push(renderSectionHeader(renderRow.text, width, theme));
      continue;
    }
    if (renderRow.type === "divider") {
      lines.push(renderDivider(width, theme));
      continue;
    }
    if (renderRow.type === "hint") {
      lines.push(renderHint(renderRow.text, width, theme));
      continue;
    }

    const row = renderRow.row;
    const selectedRow = renderRow.interactiveIndex === state.selectedIndex;
    if (row.type === "segment") {
      const enabled = isEnabledSegment(state, row.id) ? "[\u2022]" : "[ ]";
      const order = isEnabledSegment(state, row.id)
        ? ` (${state.enabledSegments.indexOf(row.id) + 1})`
        : "";
      const meta = SEGMENT_METADATA.get(row.id);
      if (!meta) continue;
      lines.push(
        renderRowLine(
          {
            selected: selectedRow,
            checkbox: enabled,
            labelWithOrder: `${meta.label}${order}`,
            description: meta.description,
          },
          width,
          theme,
        ),
      );
      continue;
    }
    lines.push(
      renderRowLine(
        {
          selected: selectedRow,
          checkbox: state.shownStatuses.has(row.key) ? "[\u2022]" : "[ ]",
          labelWithOrder: row.key,
          description: STATUS_ROW_DESCRIPTION,
        },
        width,
        theme,
      ),
    );
  }

  lines.push(truncateToWidth("", width));
  lines.push(truncateToWidth(preview, width));
  lines.push(
    truncateToWidth(
      theme.dim(state.query ? HELP_SEARCHING : HELP_BASE),
      width,
    ),
  );
  return lines;
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: extract editor-render.ts

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
```

---

### Task 4: Rewrite editor.ts as thin shell

**Files:**
- Modify: `src/tui/editor.ts`

- [ ] **Step 1: Replace editor.ts contents with thin shell**

```ts
import {
  Key,
  matchesKey,
  type Component,
} from "@earendil-works/pi-tui";
import type { PiStatusConfig } from "../shared/types.ts";
import type { FooterRenderInput } from "./render.ts";
import type { StatusLineTheme } from "./theme.ts";
import {
  type EditorAction,
  collectHiddenStatuses,
  editorReducer,
  initEditorState,
} from "./editor-state.ts";
import { renderEditor } from "./editor-render.ts";

export { collectHiddenStatuses };

export function createStatusLineEditor(options: {
  config: PiStatusConfig;
  discoveredStatuses: string[];
  previewInput: Omit<FooterRenderInput, "segments" | "extensionSegments">;
  theme: StatusLineTheme;
  done: (result: PiStatusConfig | null) => void;
  requestRender: () => void;
  usageAvailable?: boolean;
}): Component {
  let state = initEditorState(
    options.config,
    options.discoveredStatuses,
    options.usageAvailable,
  );

  function dispatch(action: EditorAction): void {
    const result = editorReducer(state, action);
    if (result.type === "done") {
      options.done(result.config);
    } else {
      state = result.state;
      options.requestRender();
    }
  }

  return {
    invalidate(): void {},
    handleInput(data: string): void {
      if (matchesKey(data, Key.escape)) return dispatch({ type: "cancel" });
      if (matchesKey(data, Key.enter)) return dispatch({ type: "save" });
      if (matchesKey(data, Key.up)) return dispatch({ type: "move_up" });
      if (matchesKey(data, Key.down)) return dispatch({ type: "move_down" });
      if (matchesKey(data, Key.space)) return dispatch({ type: "toggle" });
      if (matchesKey(data, Key.left))
        return dispatch({ type: "reorder_left" });
      if (matchesKey(data, Key.right))
        return dispatch({ type: "reorder_right" });
      if (matchesKey(data, Key.backspace))
        return dispatch({ type: "backspace" });
      if (/^[\x21-\x7E]$/.test(data))
        return dispatch({ type: "type_char", char: data });
    },
    render(width: number): string[] {
      return renderEditor(state, options.previewInput, options.theme, width);
    },
  };
}
```

- [ ] **Step 2: Run full verification**

```bash
pnpm lint && pnpm typecheck && pnpm test
```
Expected: all 60 existing editor tests pass without modification (they test through the public `createStatusLineEditor` API).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: slim editor.ts to thin shell (~60 lines)

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
```

---

### Task 5: Add editor-render unit tests

**Why:** The file structure promises `editor-render.test.ts` for state-to-output assertions. The existing 60 editor integration tests exercise render through the `Component.render()` API, but dedicated render tests verify the render layer in isolation without key simulation.

**Files:**
- Create: `tests/tui/editor-render.test.ts`

- [ ] **Step 1: Write tests**

```ts
import { describe, expect, it } from "vitest";
import { visibleWidth } from "@earendil-works/pi-tui";
import { initEditorState, editorReducer } from "../../src/tui/editor-state.ts";
import { renderEditor } from "../../src/tui/editor-render.ts";
import { noTheme } from "../../src/tui/theme.ts";

const THEME = noTheme;
const WIDTH = 80;

function makePreviewInput() {
  return {
    model: { id: "test-model", name: "TestModel", reasoning: false },
    cwd: "/tmp/test",
    thinkingLevel: "off",
    runState: "idle" as const,
  };
}

function makeState(overrides?: {
  segments?: Parameters<typeof initEditorState>[0]["segments"];
  discovered?: string[];
}) {
  return initEditorState(
    {
      segments: overrides?.segments ?? ["model-with-reasoning", "current-dir"],
      extensionSegments: { hidden: [] },
    },
    overrides?.discovered ?? [],
  );
}

function render(state: ReturnType<typeof makeState>, width = WIDTH) {
  return renderEditor(state, makePreviewInput(), THEME, width);
}

describe("renderEditor — structure", () => {
  it("includes title and subtitle in first two lines", () => {
    const lines = render(makeState());
    expect(lines[0]).toContain("Configure Status Line");
    expect(lines[1]).toContain("Select which items to display");
  });

  it("includes search placeholder", () => {
    const lines = render(makeState());
    expect(lines[3]).toContain("Type to search");
  });

  it("includes section headers when not searching", () => {
    const lines = render(makeState());
    const joined = lines.join("\n");
    expect(joined).toContain("Status line items");
    expect(joined).toContain("Extension statuses");
  });

  it("omits section headers when searching", () => {
    let state = makeState();
    const result = editorReducer(state, { type: "type_char", char: "m" });
    if (result.type !== "next") throw new Error("expected next");
    const lines = render(result.state);
    const joined = lines.join("\n");
    expect(joined).not.toContain("Status line items");
    expect(joined).not.toContain("Extension statuses");
  });

  it("ends with help text", () => {
    const lines = render(makeState());
    const lastLine = lines[lines.length - 1];
    expect(lastLine).toContain("Toggle: Space");
    expect(lastLine).toContain("Reorder:");
  });

  it("shows searching help text when query is active", () => {
    let state = makeState();
    const result = editorReducer(state, { type: "type_char", char: "m" });
    if (result.type !== "next") throw new Error("expected next");
    const lines = render(result.state);
    const lastLine = lines[lines.length - 1];
    expect(lastLine).toContain("disabled while search is active");
  });
});

describe("renderEditor — segment rows", () => {
  it("shows enabled segments with filled checkbox", () => {
    const lines = render(makeState({ segments: ["model"] }));
    const joined = lines.join("\n");
    expect(joined).toMatch(/\[.\]\s*Model/);
  });

  it("shows disabled segments with empty checkbox", () => {
    const state = makeState({ segments: [] });
    const lines = render(state);
    const joined = lines.join("\n");
    expect(joined).toMatch(/\[ \]\s*Model/);
  });

  it("shows order numbers for enabled segments", () => {
    const lines = render(makeState({ segments: ["model", "current-dir"] }));
    const joined = lines.join("\n");
    expect(joined).toContain("(1)");
    expect(joined).toContain("(2)");
  });
});

describe("renderEditor — preview line", () => {
  it("includes a preview line near the bottom", () => {
    const lines = render(makeState({ segments: ["model-with-reasoning"] }));
    const secondToLast = lines[lines.length - 2];
    expect(secondToLast).toContain("TestModel");
  });
});

describe("renderEditor — width respect", () => {
  it("no line exceeds the given width", () => {
    const narrow = 40;
    const lines = render(makeState(), narrow);
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(narrow);
    }
  });
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm test tests/tui/editor-render.test.ts
```
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: add editor-render unit tests

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
```
