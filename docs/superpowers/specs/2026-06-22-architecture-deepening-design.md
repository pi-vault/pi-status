# Architecture Deepening — Design Spec

**Goal:** Transform shallow modules into deep ones across 5 phases, improving locality, leverage, and testability without changing external behavior.

**Delivery model:** Separate PR per phase. Each phase leaves the codebase green (lint + typecheck + tests pass). Phases ordered simplest → most complex.

---

## Phase 1: Deepen snapshot → resolve-footer

**Branch:** `refactor/deepen-resolve-footer`

### Current State

`src/core/snapshot.ts` exports `buildSnapshot()` which maps fields from `SnapshotInput` to `FooterRenderInput` with minimal logic (run-state derivation + branch totals aggregation). The module fails the deletion test — its interface is nearly as complex as its implementation.

Meanwhile, `buildFooterLine()` in `src/tui/render.ts` handles both resolution (which segments to render, extension status filtering) and presentation (color application, joining, truncation).

### Design

Rename `src/core/snapshot.ts` → `src/core/resolve-footer.ts`. The new `resolveFooter()` function owns the full decision chain:

1. Derive run state from `isIdle` + `hasPendingMessages`
2. Aggregate branch totals (input/output/totalTokens)
3. Call `formatSegment()` for each configured segment ID
4. Drop null results
5. Filter extension statuses by the hidden list, format visible ones
6. Return `Array<{ text: string; color: string | null }>` — ready-to-paint pairs

`buildFooterLine()` in render.ts shrinks to: apply `theme.fg(color, text)` to each pair, join with `" · "` separator, truncate to width. ~20 lines.

### Dependency Flow (no cycles)

```
index.ts → resolveFooter (resolve-footer.ts)
         → buildFooterLine (render.ts, now thin)
resolve-footer.ts → formatSegment (render.ts)
render.ts → types.ts (unchanged direction)
```

### File Changes

| Action | Path                                                                                           |
| ------ | ---------------------------------------------------------------------------------------------- |
| Rename | `src/core/snapshot.ts` → `src/core/resolve-footer.ts`                                          |
| Modify | `src/tui/render.ts` — remove resolution logic from `buildFooterLine`, keep it as a thin joiner |
| Modify | `src/index.ts` — update imports, call `resolveFooter()` then `buildFooterLine()`               |
| Rename | `tests/core/snapshot.test.ts` → `tests/core/resolve-footer.test.ts`                            |
| Modify | `tests/core/resolve-footer.test.ts` — adapt to new interface, add resolution tests             |
| Modify | `tests/tui/render.test.ts` — simplify buildFooterLine tests (only joiner behavior)             |

### Interface

```ts
// src/core/resolve-footer.ts

export interface ResolveFooterInput {
  config: PiStatusConfig;
  model?: ModelLike;
  cwd: string;
  thinkingLevel: string;
  gitBranch: string | null;
  isIdle: boolean;
  hasPendingMessages: boolean;
  contextUsage?: {
    tokens: number | null;
    contextWindow?: number;
    percent: number | null;
  };
  branch: unknown[];
  sessionId?: string;
  usageState?: unknown;
  extensionStatuses: Map<string, string>;
}

export interface ResolvedSegment {
  text: string;
  color: string | null;
}

export function resolveFooter(
  input: ResolveFooterInput,
  theme: ThemeLike,
): ResolvedSegment[];
```

```ts
// src/tui/render.ts (slimmed)

export function buildFooterLine(
  segments: ResolvedSegment[],
  theme: ThemeLike,
  width: number,
): string;
```

### Test Strategy

- Existing 12 snapshot tests adapt to `resolveFooter` interface (same assertions, new input shape)
- Add tests for segment resolution: null dropping, order preservation, extension status filtering
- render.test.ts tests for `buildFooterLine` simplify to: given resolved pairs → assert joined output with correct colors and truncation

---

## Phase 2: Segment Formatter Registry

**Branch:** `refactor/segment-formatter-registry`

### Current State

`formatSegment()` in `src/tui/render.ts` is a ~200-line switch with 14 cases. Color thresholds (60%, 80%, 70%, 90%) are magic numbers. No locality — understanding one segment's logic requires scanning the entire switch.

### Design

Replace the switch with a `Map<StatusLineSegmentId, SegmentFormatter>`. Each formatter is a named export in a new `src/tui/formatters.ts`. Shared utilities (`formatCompactNumber`, `abbreviateHomeDir`, `findProjectRootLabel`, `normalizeThinkingLevel`) move to `src/tui/render-utils.ts`.

### File Layout After

```
src/tui/
├── render.ts          (buildFooterLine joiner + formatSegment as registry lookup + type exports)
├── render-utils.ts    (NEW: shared formatting utilities)
├── formatters.ts      (NEW: 14 named formatters + segmentFormatters registry + threshold constants)
├── editor.ts
└── theme.ts
```

### Dependency Flow (no cycles)

```
resolve-footer.ts → formatSegment (render.ts)
render.ts → segmentFormatters (formatters.ts)
formatters.ts → render-utils.ts
render.ts → render-utils.ts (re-exports for backward compat)
```

### Interface

```ts
// src/tui/formatters.ts

export type SegmentFormatter = (
  input: FooterRenderInput,
  theme: ThemeLike,
) => [text: string, color: string | null] | null;

export const segmentFormatters: Map<StatusLineSegmentId, SegmentFormatter>;

// Named exports for each formatter:
export function formatModel(
  input: FooterRenderInput,
  theme: ThemeLike,
): [string, string | null] | null;
export function formatModelWithReasoning(
  input: FooterRenderInput,
  theme: ThemeLike,
): [string, string | null] | null;
export function formatContextUsed(
  input: FooterRenderInput,
  theme: ThemeLike,
): [string, string | null] | null;
// ... etc for all 14

// Threshold constants:
export const CONTEXT_WARNING_THRESHOLD = 60;
export const CONTEXT_ERROR_THRESHOLD = 80;
export const RATE_WARNING_THRESHOLD = 70;
export const RATE_ERROR_THRESHOLD = 90;
export const REMAINING_WARNING_THRESHOLD = 40;
export const REMAINING_ERROR_THRESHOLD = 20;
```

```ts
// src/tui/render-utils.ts

export function formatCompactNumber(value: number): string;
export function abbreviateHomeDir(cwd: string, home?: string): string;
export function findProjectRootLabel(cwd: string): string | null;
export function normalizeThinkingLevel(level: string | undefined): string;
```

```ts
// src/tui/render.ts (updated)

export function formatSegment(
  id: StatusLineSegmentId,
  input: FooterRenderInput,
  theme: ThemeLike,
): [string, string | null] | null {
  return segmentFormatters.get(id)?.(input, theme) ?? null;
}

// Re-exports for backward compatibility:
export {
  formatCompactNumber,
  abbreviateHomeDir,
  findProjectRootLabel,
} from "./render-utils.ts";
```

### Test Strategy

- `tests/tui/render.test.ts` stays unchanged — it tests through `formatSegment` which keeps the same interface
- Zero test changes required (the registry is an implementation detail)
- Optional: add direct unit tests for individual formatters later

---

## Phase 3: Settings Store Seam

**Branch:** `refactor/settings-store-seam`

### Current State

`loadConfig` and `saveConfigToSettings` in `src/core/config.ts` directly import Node.js `fs` and `path`. Tests create real temp directories and override `process.env.HOME`. Tests are slow, fragile, and tightly coupled to filesystem.

### Design

Introduce a `SettingsStore` interface. The real `FsSettingsStore` adapter wraps current atomic-write logic. A `MemorySettingsStore` in test helpers enables fast, deterministic tests.

### Interface

```ts
// src/shared/types.ts (addition)

export interface SettingsStore {
  exists(path: string): boolean;
  read(path: string): string | null;
  write(path: string, data: string): void;
}
```

```ts
// src/core/config.ts (internal, not exported)

class FsSettingsStore implements SettingsStore {
  exists(path: string): boolean {
    /* existsSync */
  }
  read(path: string): string | null {
    /* readFileSync, null on error */
  }
  write(path: string, data: string): void {
    /* mkdirSync + mkdtempSync + writeFileSync + renameSync */
  }
}

const defaultStore = new FsSettingsStore();

export function loadConfig(options?: {
  cwd?: string;
  store?: SettingsStore;
}): ConfigLoadResult;
export function saveConfigToSettings(
  config: PiStatusConfig,
  options?: { cwd?: string; store?: SettingsStore },
): { target: string };
```

```ts
// tests/helpers.ts (addition)

export class MemorySettingsStore implements SettingsStore {
  private files = new Map<string, string>();

  seed(path: string, content: string): void {
    this.files.set(path, content);
  }
  exists(path: string): boolean {
    return this.files.has(path);
  }
  read(path: string): string | null {
    return this.files.get(path) ?? null;
  }
  write(path: string, data: string): void {
    this.files.set(path, data);
  }
}
```

### File Changes

| Action | Path                                                                        |
| ------ | --------------------------------------------------------------------------- |
| Modify | `src/shared/types.ts` — add `SettingsStore` interface                       |
| Modify | `src/core/config.ts` — add `FsSettingsStore`, accept optional `store` param |
| Modify | `tests/helpers.ts` — add `MemorySettingsStore`                              |
| Modify | `tests/core/config.test.ts` — refactor to use `MemorySettingsStore`         |

### Test Strategy

- Config tests use `MemorySettingsStore`: seed files with `.seed()`, assert writes by reading back
- No `mkdtempSync`, no `process.env.HOME` overrides, no real filesystem
- One optional integration test verifies `FsSettingsStore` writes atomically to a real temp dir
- Backward compatible: callers without `store` param continue using `FsSettingsStore`

---

## Phase 4: Runtime State Machine

**Branch:** `refactor/runtime-state-machine`

### Current State

`createExtension` in `src/index.ts` (232 LOC) manages a `RuntimeState` object mutated across 5+ event handlers. State transitions are implicit. Any handler can write any field. No single place to understand the full lifecycle.

### Design

Extract a `RuntimeState` module with a formal event-driven interface. Config lives inside the state machine (reloaded via `session_tree` event). Event handlers in index.ts become one-line adapters.

### Interface

```ts
// src/core/runtime-state.ts

export type RuntimeEvent =
  | { type: "session_start"; ctx: ExtensionContext; config: PiStatusConfig }
  | { type: "session_tree"; config: PiStatusConfig }
  | { type: "model_selected"; model: ModelLike }
  | { type: "thinking_level_changed"; level: string }
  | { type: "usage_update"; state: UsageCoreState }
  | {
      type: "branch_change";
      gitBranch: string | null;
      extensionStatuses: Map<string, string>;
    };

export interface RuntimeSnapshot {
  config: PiStatusConfig;
  model?: ModelLike;
  cwd: string;
  thinkingLevel: string;
  gitBranch: string | null;
  isIdle: boolean;
  hasPendingMessages: boolean;
  contextUsage?: {
    tokens: number | null;
    contextWindow?: number;
    percent: number | null;
  };
  branch: unknown[];
  sessionId?: string;
  usageState?: unknown;
  extensionStatuses: Map<string, string>;
}

export interface RuntimeStateMachine {
  update(event: RuntimeEvent): void;
  getSnapshot(): RuntimeSnapshot;
  onInvalidate(cb: () => void): void;
  dispose(): void;
}

export function createRuntimeState(): RuntimeStateMachine;
```

### How It Composes (after Phases 1-2)

```ts
// src/index.ts footer render():
const snapshot = runtimeState.getSnapshot();
const pairs = resolveFooter(snapshot, theme);
const line = buildFooterLine(pairs, theme, width);
```

### File Changes

| Action | Path                                                                                       |
| ------ | ------------------------------------------------------------------------------------------ |
| Create | `src/core/runtime-state.ts`                                                                |
| Modify | `src/index.ts` — replace imperative state with `createRuntimeState()`, thin event adapters |
| Create | `tests/core/runtime-state.test.ts`                                                         |
| Modify | `tests/extension.test.ts` — remains as integration test, may simplify                      |

### Test Strategy

- New `tests/core/runtime-state.test.ts`: tests state transitions as pure logic
  - Feed events → assert snapshot changes
  - Verify `onInvalidate` fires on meaningful updates only
  - Verify `dispose` cleans up listener
- No ExtensionAPI mocking needed — just construct the state machine and feed events
- `tests/extension.test.ts` remains as integration test (verifies wiring between pi.on and state machine)

### index.ts After (~80-100 LOC)

Event handlers become one-liners:

```ts
pi.on("model_selected", (event) =>
  state.update({ type: "model_selected", model: event.model }),
);
pi.on("thinking_level_changed", () =>
  state.update({
    type: "thinking_level_changed",
    level: pi.getThinkingLevel(),
  }),
);
```

---

## Phase 5: Editor Pure Reducer

**Branch:** `refactor/editor-pure-reducer`

### Current State

`src/tui/editor.ts` (512 LOC) is a closure with mutable state (enabledSegments, query, selectedIndex, hiddenStatuses). State transitions happen inside `handleInput` mixed with side effects. Testing requires simulating full key sequences and parsing rendered ANSI output.

### Design

Split into three files with clean boundaries:

1. **State + Reducer** (`src/tui/editor-state.ts`): pure functions, no side effects
2. **Render** (`src/tui/editor-render.ts`): state → string[], no mutation
3. **Shell** (`src/tui/editor.ts`): Component glue, key→action mapping, callbacks

### Interface

```ts
// src/tui/editor-state.ts

export interface EditorState {
  enabledSegments: StatusLineSegmentId[];
  disabledSegments: StatusLineSegmentId[];
  discoveredStatuses: string[];
  hiddenStatuses: string[];
  query: string;
  selectedIndex: number;
  usageAvailable: boolean;
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

export function initEditorState(
  config: PiStatusConfig,
  discoveredStatuses: string[],
  usageAvailable?: boolean,
): EditorState;

export function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorResult;
```

```ts
// src/tui/editor-render.ts

export function renderEditor(
  state: EditorState,
  previewInput: Omit<FooterRenderInput, "segments" | "extensionSegments">,
  theme: StatusLineTheme,
  width: number,
): string[];
```

```ts
// src/tui/editor.ts (thin shell, ~60 lines)

export function createStatusLineEditor(options: EditorOptions): Component;
// Maps key presses → EditorAction
// Calls editorReducer(state, action)
// On { type: 'done' } → calls done() callback
// On { type: 'next' } → updates state, calls requestRender()
```

### File Layout After

```
src/tui/
├── editor.ts            (Shell: ~60 lines)
├── editor-state.ts      (NEW: ~150 lines)
├── editor-render.ts     (NEW: ~200 lines)
├── ...
```

### Test Layout After

```
tests/tui/
├── editor.test.ts            (Integration: existing 60 tests stay as regression net)
├── editor-state.test.ts      (NEW: pure state transitions)
├── editor-render.test.ts     (NEW: state → output assertions)
├── ...
```

### Test Strategy

- All 60 existing editor tests continue passing (regression net)
- New state tests verify transitions without rendering:
  ```ts
  it("toggle removes first enabled segment", () => {
    const state = initEditorState({ segments: ['model', 'current-dir'], ... }, []);
    const result = editorReducer(state, { type: 'toggle' });
    expect(result.type).toBe('next');
    expect(result.state.enabledSegments).toEqual(['current-dir']);
  });
  ```
- New render tests verify output without key simulation:
  ```ts
  it("renders query on line 5", () => {
    const state = { ...initState, query: "mod" };
    const lines = renderEditor(state, previewInput, noTheme, 120);
    expect(lines[4]).toBe("▸ mod");
  });
  ```

---

## Phase Dependencies

```
Phase 1 (resolve-footer) ─┐
                           ├─→ Phase 4 (state machine) ─→ can merge independently
Phase 2 (formatter registry) ─→ can merge independently
Phase 3 (settings seam) ─────→ can merge independently
Phase 5 (editor reducer) ────→ can merge independently
```

Phase 1 should land before Phase 4 (since Phase 4's `getSnapshot()` produces what `resolveFooter` consumes). All other phases are independent of each other.

---

## Verification

Each phase PR must pass:

- `pnpm lint` (biome, zero warnings)
- `pnpm typecheck` (tsc --noEmit)
- `pnpm test` (vitest, all tests green)

No behavioral changes. Existing test assertions continue to pass. New tests added for new modules.
