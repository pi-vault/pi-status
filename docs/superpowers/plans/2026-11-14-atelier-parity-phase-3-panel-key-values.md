# Atelier Parity Phase 3 — Richer panel API (release 0.8.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Parent plan:** `docs/superpowers/plans/2026-11-14-atelier-parity.md`. This file was revised after checking it against the repo at `v0.7.0` (`3f17c2b`), and the parent's Phase 3 section was updated to match. See "Revision notes" at the end.

**Spec:** `docs/superpowers/specs/2026-11-14-atelier-parity-design.md` (section "Phase 3")

**Reference implementation:** `/Users/lanh/Developer/pi-packages/michaelmjhhhh-pi-atelier`: `src/sidebar-panels.ts` (`sanitizeKeyValues`, ~281) and `src/sidebar.ts` (`labeledRow` ~150, `progressMeter` ~175, contributed panel rows ~1185).

**Tech Stack:** TypeScript 7, pnpm, Biome, vitest 5, `@earendil-works/pi-coding-agent` / `@earendil-works/pi-tui` 1.5.2, Node ≥ 24.15.0.

**Prerequisite:** Phase 2 is merged to `master` (`v0.7.0`, done). Baseline: 35 test files, 974 tests passing.

## Global Constraints

- Minimum and development host from Phase 0 on: `@earendil-works/pi-coding-agent@1.5.2`, `@earendil-works/pi-tui@1.5.2`.
- `peerDependencies` stay `"*"` for both Pi packages. `@pi-vault/pi-usage` stays a regular `dependency`. `engines.node` stays `">=24.15.0"`.
- Never retain or display changed-file paths. `statusline.json` stays global. No new dashboard tabs.
- Existing `pi-status:sidebar-panels` contributors keep working, and `SIDEBAR_PANEL_PROTOCOL_VERSION` stays `1`.
- Module layout: `src/core`, `src/tui`, `src/shared`; tests in `tests/tui`. Use the existing 2-space Biome style.
- Per phase: update `CHANGELOG.md` and the affected README sections, bump the `package.json` version, pass `pnpm release:check`, then PR, merge and tag `vX.Y.Z` (`release.yml` publishes).

## Execution Notes

- **Branch:** `20261114-pi-atelier-parity-phase-3-panel-key-values` (it already exists and matches the Phase 1/2 naming).
- "Run tests" means `pnpm test -- <file>` for the narrow check, then `pnpm check` before each commit that ends a task.
- Do not run vitest with `CI=true` in Task 3.0. Locally, vitest writes new inline snapshots on the first run. Under CI it fails them instead.
- Test casts: tests pass malformed input through the typed `register()` API. Cast those payloads with `as never`, as the existing malformed-input tests in `tests/tui/sidebar-panels.test.ts` do.

---

## Phase 3 — Richer panel API (release 0.8.0)

**Goal:** other extensions can publish aligned label/value rows with optional progress bars, and rows-only contributors render byte-identically to 0.7.0.

**Architecture:**

- `keyValues` is an optional, additive field on the contribution. The registry sanitizes it as a unit. Anything invalid drops the whole field, so the host falls back to `rows`.
- In the catalog (`sidebar-segments.ts`), a panel with `keyValues` emits one entry per key/value, with the new content kind `"keyValue"`, instead of its rows. A panel without `keyValues` emits exactly what it emits today.
- `entryRows` in `sidebar-render.ts` lays out each key/value at the panel's content width through an exported `renderKeyValueRow`.

### Phase 3 Review Focus

- **Byte identity.** A rows-only contributed panel renders the same as 0.7.0. Task 3.0 pins this with a characterization snapshot taken before any code change.
- **Wide characters** (CJK/emoji) in a label or value. Alignment uses `visibleWidth`, and no row exceeds the content width. Tested in Task 3.3.
- **Truncation artifacts.** pi-tui's `truncateToWidth` defaults to a 3-column `"..."` and appends `\x1b[0m` whenever it truncates, even with no colour. Key/value text uses a local `fitToWidth` helper (`sliceByColumn(text, 0, max - 1, true) + "…"`) instead. Tested in Task 3.3 (no `\x1b` under NO_COLOR, even when truncated).
- **`progress` exactly `0` and `1`.** These draw an all-empty and an all-filled bar. Tested in Task 3.3.
- **`rows: []` with valid `keyValues`.** The key/values render. Hosts that only know `rows` render nothing for that panel. Tested in Task 3.2.
- **A contributor that changes only `keyValues`** (identical `rows`) must bump the `generation`. Tested in Task 3.1 (`panelsEqual`).
- **`valueRole` absent with a panel `role`.** The value uses the panel role. Tested in Task 3.2.
- **Identity churn (accepted, existing behaviour).** Key/value entries use generation-scoped anonymous IDs, like anonymous rows today. Every content change (for example a progress tick) produces new session IDs. The entries return to the contributed panel, and a per-row move or hide made in the Sidebar tab does not survive the update. Do not add stable key/value IDs in this phase.
- **Explicit row IDs.** While `keyValues` is present, rows with explicit IDs (`contribution:<panel>:<rowId>`) are not in the catalog, so they do not render. Their saved layout positions are kept because stable IDs are always accepted, and they render again when `keyValues` is withdrawn.

### Task 3.0: Pin rows-only output (characterization)

**Files:**

- Test: `tests/tui/sidebar-render.test.ts`

- [ ] **Step 1: Write the characterization test**

Add it to the `describe` that holds "renders a contributed panel with its own title". It uses a tagging theme, so the output records each role as well as the text:

```ts
function tagTheme(): StatusLineTheme {
  return {
    ...noColorTheme(),
    fg: (color, text) => `<${color}>${text}</${color}>`,
  };
}

it("renders a rows-only contributed panel exactly as 0.7.0", () => {
  const input = makeInput();
  const layout = [
    ...input.config.sidebarPanelLayout.map((panel) => ({
      ...panel,
      visible: false,
    })),
    { id: "ext:sample" as never, visible: true, segments: [] },
  ];
  const lines = render(
    {
      ...input,
      config: { ...input.config, sidebarPanelLayout: layout },
      sidebarPanels: [contributedPanel()],
    },
    44,
    12,
    { colorEnabled: true },
    tagTheme(),
  );
  expect(lines).toMatchInlineSnapshot();
});
```

If every built-in panel hidden trips the "at least one visible panel" rule, keep `agent` visible instead. The snapshot is the evidence, so its exact content does not matter.

- [ ] **Step 2: Record and check the snapshot**

Run: `pnpm test -- tests/tui/sidebar-render.test.ts` (without `CI=true`).
Expected: PASS, and vitest writes the inline snapshot into the file. Open the file, confirm the snapshot contains `row one` and `<accent>row two</accent>`, and run the command again. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/tui/sidebar-render.test.ts
git commit -m "test: pin rows-only contributed panel rendering"
```

### Task 3.1: Contract and sanitization

**Files:**

- Modify: `src/tui/sidebar-panels.ts`: types (~66-96), new `sanitizeKeyValues` before `sanitizeContribution` (~236), `sanitizeContribution`, `panelsEqual` (~399)
- Test: `tests/tui/sidebar-panels.test.ts`

**Interfaces:**

- Produces (exported from `src/tui/sidebar-panels.ts`):

```ts
/** Responsive label/value rows laid out by pi-status at the current sidebar width. */
export interface SidebarPanelKeyValue {
  label: string;
  value: string;
  labelRole?: SidebarPanelRole;
  valueRole?: SidebarPanelRole;
  /** Optional finite fraction from 0 to 1, inclusive. Invalid values are dropped. */
  progress?: number;
}
// SidebarPanelContribution gains:
//   /** Optional preferred representation; `rows` remains the compatibility fallback. */
//   keyValues?: readonly SidebarPanelKeyValue[];
// SanitizedSidebarPanelContribution gains: keyValues?: SidebarPanelKeyValue[];
// SidebarPanelData inherits keyValues through Omit<SidebarPanelContribution, "rows">.
```

- [ ] **Step 1: Write the failing tests**

Add a new `describe("contributed keyValues", …)`. Each test uses `createSidebarPanelRegistry().register(...)` and then `registry.get("vendor:kv")`, like the existing tests:

- `it("keeps valid keyValues with sanitized text, roles and progress")`: `{ label: "CPU\x1b[31m", value: "42%", valueRole: "warning", progress: 0.42 }` is stored as `{ label: "CPU", value: "42%", valueRole: "warning", progress: 0.42 }`.
- `it("drops keyValues and keeps rows when the list is empty, not an array, or longer than SIDEBAR_PANEL_MAX_ROWS")`: three cases. In each, `panel.keyValues` is `undefined`, `panel.rows` is intact, and `register` returns `true`.
- `it("drops keyValues when any entry is malformed")`: four cases, each with one good entry plus one bad one: a non-record entry (`"x"`), an entry missing `value`, a non-string `label`, and a `label` of `"a".repeat(SIDEBAR_PANEL_MAX_ROW_CHARS + 1)`. Each gives `keyValues === undefined`, with the rows kept.
- `it("skips entries whose label and value are both empty after sanitizing")`: `[{ label: "\x1b[0m", value: " " }, { label: "A", value: "1" }]` gives `[{ label: "A", value: "1" }]`. When every entry is empty, the result is `keyValues === undefined`. This matches atelier.
- `it("drops an invalid role but keeps the entry")`: `labelRole: "nope"` gives an entry without `labelRole`.
- `it("drops out-of-range or non-finite progress but keeps the entry")`: `-0.1`, `1.1`, `NaN`, `Infinity` and `"0.5"` give no `progress`. `0` and `1` are kept.
- `it("bumps generation when only keyValues change")`: register with the same `rows` and the value `"1"`, then `"2"`. `generation` goes from 1 to 2. Registering the second payload again leaves it at 2.
- `it("publishes keyValues through registerSidebarPanel")`: use the publisher test pattern at ~line 465. A registry on the same fake bus receives the sanitized `keyValues`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- tests/tui/sidebar-panels.test.ts`
Expected: the new tests FAIL. Existing tests PASS.

- [ ] **Step 3: Implement**

`function sanitizeKeyValues(value: unknown): SidebarPanelKeyValue[] | undefined`:

1. Return `undefined` when `value` is not an array, or when its length is `0` or `> SIDEBAR_PANEL_MAX_ROWS`.
2. For each entry, return `undefined` when any of these is true:
   - the entry is not a record (`isRecord`);
   - `label` or `value` is not a string;
   - `label` or `value` fails `isSidebarPanelTextWithinRawLimit(_, SIDEBAR_PANEL_MAX_RAW_ROW_CODE_UNITS)`;
   - `label` or `value` fails `fitsSidebarPanelText(_, SIDEBAR_PANEL_MAX_ROW_CHARS)`.
     Each limit applies to the label and the value separately.
3. Sanitize the text with `sanitizeSidebarPanelText(_, SIDEBAR_PANEL_MAX_ROW_CHARS)`. Skip the entry when both results are `""`.
4. Keep `labelRole` and `valueRole` only when `isSidebarPanelRole` passes. Keep `progress` only when it is a finite number in `[0, 1]`.
5. Return `undefined` when no entries remain.

In `sanitizeContribution`, compute `const keyValues = sanitizeKeyValues(value.keyValues)` after the rows loop and spread `...(keyValues ? { keyValues } : {})`. `rows` validation is unchanged: invalid `rows` still rejects the whole panel.

Extend `panelsEqual`: return `false` when exactly one side has `keyValues` or the lengths differ, then compare every field of every entry (`label`, `value`, `labelRole`, `valueRole`, `progress`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- tests/tui/sidebar-panels.test.ts && pnpm typecheck`
Expected: PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/tui/sidebar-panels.ts tests/tui/sidebar-panels.test.ts
git commit -m "feat: accept keyValues in sidebar panel contributions"
```

### Task 3.2: Catalog content kind

**Files:**

- Modify: `src/shared/types.ts` (~121-134, `SidebarSegmentContent`)
- Modify: `src/tui/sidebar-segments.ts` (`contributionSegments` ~744)
- Modify: `src/tui/sidebar-render.ts` (`entryRows` ~336, a temporary guard)
- Modify: `tests/tui/sidebar-segments.test.ts` (`textOf` helper ~135, new tests)

**Interfaces:**

- Consumes: `SidebarPanelData.keyValues` (Task 3.1).
- Produces (`src/shared/types.ts`):

```ts
export interface SidebarKeyValueContent {
  kind: "keyValue";
  label: SidebarSegmentSpan;
  value: SidebarSegmentSpan;
  progress?: number;
}
export type SidebarSegmentContent =
  | SidebarMetricContent
  | SidebarBlockContent
  | SidebarKeyValueContent;
```

- [ ] **Step 1: Write the failing tests**

First update `textOf` in `tests/tui/sidebar-segments.test.ts`. Otherwise the widened union breaks typecheck at `entry.content.rows`:

```ts
if (entry.content.kind === "keyValue")
  return `${entry.content.label.text}=${entry.content.value.text}`;
```

Then add a `describe("contributed keyValues", …)` that uses the existing `contributedPanel()` fixture (generation 3, rows `row_one` plus one anonymous row):

- `it("builds one keyValue entry per key/value instead of rows")`: a panel with 2 rows and 3 keyValues gives exactly 3 `build:panel` entries. Their IDs are `sidebarAnonymousContributionSegmentId("build:panel", 3, i)` for i = 0..2. Each has `persistence: "session"`, `defaultPanelId: "build:panel"` and `content.kind === "keyValue"`, and `contribution:build%3Apanel:row_one` is absent.
- `it("defaults label role to muted and value role to the panel role, else primary")`: panel role `"accent"` gives value role `"accent"`. No panel role gives `"primary"`. The label role is `"muted"`. Explicit `labelRole`/`valueRole` win.
- `it("carries progress through to the content")`: `progress: 0` and `progress: 1` are kept, and an absent progress has no `progress` key.
- `it("renders keyValues when rows is empty")`: `rows: []` with 1 keyValue gives 1 entry.
- `it("keeps rows entries unchanged when keyValues is absent")`: the existing explicit and anonymous row assertions still hold (stable `row_one`, session `…:3:1`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- tests/tui/sidebar-segments.test.ts`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement**

- Add the type and widen the union.
- In `contributionSegments`, branch per panel:
  - `if (panel.keyValues !== undefined)`: `panel.keyValues.forEach((kv, index) => definitions.push({ … }))` with `id: sidebarAnonymousContributionSegmentId(panel.id, panel.generation, index)`, `label: text(panel.title)`, `description: \`Key/value row contributed by ${text(panel.source)}.\``, `defaultPanelId: panel.id`, `persistence: "session"`, `priority: "optional"`and`dropOrder: 24`. Its `resolve` returns:

    ```ts
    {
      kind: "keyValue",
      label: { text: text(kv.label), role: kv.labelRole ?? "muted" },
      value: { text: text(kv.value), role: kv.valueRole ?? panel.role ?? "primary" },
      ...(kv.progress !== undefined ? { progress: kv.progress } : {}),
    }
    ```

  - Otherwise, keep the current `panel.rows.forEach` loop byte for byte.

- In `entryRows` (`src/tui/sidebar-render.ts`), right after the `block` branch, add `if (entry.content.kind === "keyValue") continue;` so the union compiles. Task 3.3 replaces this line.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm test -- tests/tui/sidebar-segments.test.ts tests/tui/sidebar-render.test.ts && pnpm typecheck`
Expected: PASS, exit 0. The Task 3.0 snapshot is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/tui/sidebar-segments.ts src/tui/sidebar-render.ts tests/tui/sidebar-segments.test.ts
git commit -m "feat: add keyValue sidebar segment content"
```

### Task 3.3: Aligned rendering with progress bars

**Files:**

- Modify: `src/tui/sidebar-render.ts` (new exported `renderKeyValueRow`; `entryRows` ~336)
- Test: `tests/tui/sidebar-render.test.ts`

**Interfaces:**

- Consumes: `SidebarKeyValueContent` (Task 3.2), `Palette`/`createPalette` (already exported from `src/tui/sidebar-palette.ts`).
- Produces: `export function renderKeyValueRow(content: SidebarKeyValueContent, width: number, palette: Palette): string`.

- [ ] **Step 1: Write the failing tests**

Unit tests call `renderKeyValueRow` directly, with `const plain = createPalette(noColorTheme(), false)` and `kv(label, value, progress?)` building a `SidebarKeyValueContent` with roles `muted`/`primary`:

- `it("left-aligns the label and right-aligns the value at the width")`: `kv("CPU", "42%")` at 20 gives `"CPU" + " ".repeat(14) + "42%"`.
- `it("draws a proportional bar with one space on each side when at least 4 columns fit")`: `kv("CPU", "50%", 0.5)` at 20. The bar width is `20 - 3 - 3 - 2 = 12`, so the row is `"CPU " + "█".repeat(6) + "░".repeat(6) + " 50%"`.
- `it("draws all-empty at 0 and all-filled at 1")`.
- `it("omits the bar when fewer than 4 columns fit")`: `kv("CPU", "50%", 0.5)` at 11, which leaves a bar width of 3. The row has no `█`/`░` and `visibleWidth` is 11.
- `it("never exceeds the width and keeps the value when the label is wide")`: label `"長いラベル名前テスト"` (20 columns), value `"123456"`. At 12 the row is `"長い… 123456"`, and at 20 it is `"長いラベル名… 123456"`. At 8 the value is truncated too (`"1234…"`), because the label keeps its reserve of `floor(8 / 3) = 2` columns, and `visibleWidth` stays 8. Emoji `"😀😀😀😀"` with `"値値値値値値"` at 9 gives `visibleWidth <= 9`.
- `it("truncates an overlong value with a single-column ellipsis and no escape codes")`: value `"x".repeat(40)` at 20 gives `"CPU " + "x".repeat(15) + "…"`. It does not contain `"..."` or `"\x1b"`.
- `it("returns an empty string at width 0")`.
- `it("paints label, bar and value in their roles")`: a tagging palette `{ paint: (r, t) => \`<${r}>${t}</${r}>\` }`gives a label in`<muted>`, filled cells and value in the value role, and the track in `<dim>`.

Integration tests through `render(...)` use `colorEnabled: false`:

- `it("renders a registered keyValues panel inside its frame")`: build the panel through `createSidebarPanelRegistry().register({ id: "ext:kv", title: "kv", rows: ["fallback"], keyValues: [{ label: "CPU", value: "42%", progress: 0.42 }] })`, then `registry.get("ext:kv")`. Make the panel visible as in "renders a contributed panel with its own title". The output contains `CPU`, `42%` and `█`, does not contain `fallback`, and has no `\x1b`.
- `it("falls back to rows byte-identically when keyValues is malformed")`: register the Task 3.0 `contributedPanel()` contribution (id, title, rows, role) with `keyValues: [{}] as never` through the registry. Its rendered lines equal those of the same panel without `keyValues`. Sanitization only happens in the registry, so the panel must go through `register` to exercise the fallback.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- tests/tui/sidebar-render.test.ts`
Expected: the new tests FAIL. The Task 3.0 snapshot still PASSES.

- [ ] **Step 3: Implement `renderKeyValueRow`**

Layout. Atelier's `labeledRow` is the model. _(The glyphs and the label reserve are builder's calls within the spec.)_

```ts
const BAR_FILLED = "█";
const BAR_EMPTY = "░";
const MIN_BAR_WIDTH = 4;

/** Truncate to `max` columns with a one-column ellipsis; unlike truncateToWidth, it adds no reset codes. */
function fitToWidth(text: string, max: number): string {
  if (max <= 0) return "";
  if (visibleWidth(text) <= max) return text;
  return `${sliceByColumn(text, 0, max - 1, true)}…`;
}

export function renderKeyValueRow(
  content: SidebarKeyValueContent,
  width: number,
  palette: Palette,
): string {
  const safeWidth = Math.max(0, Math.trunc(width));
  if (safeWidth === 0) return "";
  // Reserve up to a third of the row for the label, so the value keeps priority but never hides the label.
  const labelReserve = Math.min(
    visibleWidth(content.label.text),
    Math.max(1, Math.floor(safeWidth / 3)),
  );
  const value = fitToWidth(
    content.value.text,
    Math.max(1, safeWidth - labelReserve - 1),
  );
  const label = fitToWidth(
    content.label.text,
    Math.max(0, safeWidth - visibleWidth(value) - 1),
  );
  const gap = Math.max(
    0,
    safeWidth - visibleWidth(label) - visibleWidth(value),
  );
  const barWidth = gap - 2;
  let middle = " ".repeat(gap);
  if (content.progress !== undefined && barWidth >= MIN_BAR_WIDTH) {
    const filled = Math.round(content.progress * barWidth);
    middle = ` ${palette.paint(content.value.role, BAR_FILLED.repeat(filled))}${palette.paint("dim", BAR_EMPTY.repeat(barWidth - filled))} `;
  }
  return `${palette.paint(content.label.role, label)}${middle}${palette.paint(content.value.role, value)}`;
}
```

Add `sliceByColumn` to the existing `@earendil-works/pi-tui` import. Every case listed in Step 1 was checked against pi-tui 1.5.2 while this plan was being revised.

Under `NO_COLOR` the palette returns plain text, so the bar is plain `█`/`░`, as the spec requires.

In `entryRows`, replace the Task 3.2 guard with:

```ts
if (entry.content.kind === "keyValue") {
  rows.push(renderKeyValueRow(entry.content, contentWidth, palette));
  continue;
}
```

`contentWidth` here is already the panel's inner width (`renderPanels` passes `width - 4`).

- [ ] **Step 4: Run tests and the full check**

Run: `pnpm test -- tests/tui/sidebar-render.test.ts && pnpm check`
Expected: PASS. The Task 3.0 snapshot and every pre-existing test pass unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/tui/sidebar-render.ts tests/tui/sidebar-render.test.ts
git commit -m "feat: render aligned key/value rows with progress bars"
```

### Task 3.4: Docs and release 0.8.0

**Files:** `README.md` ("Contributing panels", ~241), `CHANGELOG.md`, `package.json`

- [ ] **Step 1: Document**

README "Contributing panels" is a single paragraph today. Extend it with:

- one `registerSidebarPanel(pi, { id, title, rows, keyValues })` example in which `rows` mirrors the key/values as plain text;
- a fields table: `label` and `value` (required strings); `labelRole` (default `muted`); `valueRole` (default the panel `role`, else `primary`); `progress` (number from `0` to `1`; a bar is drawn when at least 4 columns fit);
- the limits: at most 24 entries (`SIDEBAR_PANEL_MAX_ROWS`), each label and value at most 160 visible characters;
- the fallback rule: "Keep `rows` as the fallback. Older pi-status versions, and any invalid `keyValues` list, render `rows`.";
- the identity note: key/value rows are session-only, so per-row moves in the Sidebar tab do not survive content updates.

CHANGELOG: `## 0.8.0 - <release date>`, under `### Added`: "`keyValues` on contributed sidebar panels: aligned label/value rows with optional progress bars. `rows` stays required as the fallback, and the protocol version is unchanged."

- [ ] **Step 2: Version and release check**

Set `package.json` `version` to `0.8.0`. Run `pnpm release:check`.
Expected: exit 0, and both verify messages are printed.

- [ ] **Step 3: Commit, PR, tag**

```bash
git add README.md CHANGELOG.md package.json
git commit -m "chore: release v0.8.0"
git push -u origin HEAD
```

Open the PR. After merge: `git tag v0.8.0 && git push origin v0.8.0`.

---

## Revision notes (vs. the parent plan's Phase 3)

1. **Typecheck break.** Widening `SidebarSegmentContent` breaks `textOf` in `tests/tui/sidebar-segments.test.ts`, whose `else` branch reads `.rows`. Task 3.2 now updates it.
2. **Invalid fallback test.** The parent's "malformed `[{}]`" test passed `SidebarPanelData` straight to the renderer. Sanitization only happens in the registry, so that test never exercised the fallback. It now goes through `register`.
3. **No byte-identity evidence.** The parent relied only on existing tests, and none of them assert colored output for contributed rows. Task 3.0 adds a role-tagged inline snapshot before any change.
4. **Truncation.** pi-tui's `truncateToWidth` defaults to `"..."` (3 columns, `packages/tui/src/utils.ts:1186`) and appends `\x1b[0m` when it truncates. That would break the NO_COLOR rule on truncated rows. The plan now uses a `sliceByColumn` helper instead.
5. **Layout contradiction.** The parent capped the value at half the width first, which contradicted "truncate the label first" and wasted space for short labels. It is replaced by atelier-style reserving: the label gets up to a third of the row, and the value gets the rest. Short labels lose nothing.
6. **`Palette` export.** `Palette` is already exported from `src/tui/sidebar-palette.ts`, so the unit tests call `renderKeyValueRow` directly.
7. **Atelier parity details.** Entries that are empty after sanitizing are skipped, a non-record entry is rejected, and the bar track is painted `dim`.
8. **Branch name.** The plan now uses the existing branch `20261114-pi-atelier-parity-phase-3-panel-key-values`.
9. **Accepted behaviours.** Generation-scoped ID churn and hidden explicit-ID rows are now listed under Review Focus.
