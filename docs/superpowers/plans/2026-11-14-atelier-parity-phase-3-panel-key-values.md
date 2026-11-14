# Atelier Parity Phase 3 — Richer panel API (release 0.8.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Parent plan:** `docs/superpowers/plans/2026-11-14-atelier-parity.md` (this file is Phase 3, copied verbatim)

**Spec:** `docs/superpowers/specs/2026-11-14-atelier-parity-design.md` (section "Phase 3")

**Tech Stack:** TypeScript 7, pnpm, Biome, vitest, `@earendil-works/pi-coding-agent` / `@earendil-works/pi-tui` 1.5.2, Node ≥ 24.15.0.

**Prerequisite:** Phase 2 is merged to `master`.

## Global Constraints

- Minimum and development host from Phase 0 on: `@earendil-works/pi-coding-agent@1.5.2`, `@earendil-works/pi-tui@1.5.2`.
- Dependency bumps take the latest stable version published at least 48 hours earlier, or the second latest if the latest is younger.
- `peerDependencies` stay `"*"` for both Pi packages; the minimum is stated in README and CHANGELOG only.
- `@pi-vault/pi-usage` stays a regular `dependency`.
- `engines.node` stays `">=24.15.0"`.
- Never run any Git command in a project Pi has not trusted.
- Never retain or display changed-file paths. `statusline.json` stays global. No new dashboard tabs.
- Default behaviour is unchanged without opt-in: `sidebarMode` defaults to `"manual"`, `toggleShortcut` defaults to `""`.
- Existing `pi-status:sidebar-panels` contributors keep working; the protocol version is unchanged.
- Pi's `render` and fullscreen layout root are restored after `session_shutdown`, `/reload`, or a render error.
- Module layout: `src/core`, `src/tui`, `src/shared`; test layout: `tests/core`, `tests/tui`, `tests/index-*.test.ts`. Match the existing 2-space Biome style.
- Per phase: branch `YYYYMMDD-<phase-slug>` from `master`; update `CHANGELOG.md` and the affected README sections; bump `package.json` version; `pnpm release:check` passes; PR, merge, tag `vX.Y.Z` (`release.yml` publishes).

## Execution Notes

- Every phase starts from an up-to-date `master` that contains the previous phase's merge.
- "Run tests" means `pnpm test -- <file>` for the narrow check, then `pnpm check` before each commit that ends a task.
- Phases 0, 4 and 5 each end with a manual smoke run in Pi 1.5.2. The steps are listed in each phase's last task.

---

## Phase 3 — Richer panel API (release 0.8.0)

**Goal:** other extensions can publish aligned label/value rows with optional progress bars, and existing rows-only contributors render byte-identically.

**Architecture:** `keyValues` is an optional, additive field on the contribution. The registry sanitizes it as a unit; anything invalid drops the field, so the host falls back to `rows`. In the catalog, each key/value becomes a segment with a new content kind `"keyValue"`. `entryRows` in `sidebar-render.ts` lays it out at the panel's content width. The protocol version is unchanged.

**Branch:** `20261114-panel-key-values`

### Phase 3 Review Focus

- Wide characters (CJK/emoji) in label or value: alignment uses `visibleWidth`, and no row exceeds the content width. Test in Task 3.3.
- `progress` exactly `0` and `1`: all-empty and all-filled bars. Test in Task 3.3.
- `rows: []` with valid `keyValues`: renders the key/values. Rows-only hosts render nothing for that panel. Test in Task 3.2.
- A contributor that changes only `keyValues` (identical `rows`) must bump the generation and re-render. Test in Task 3.1 (`panelsEqual`).
- `valueRole` absent with a panel `role`: the value uses the panel role. Test in Task 3.2.

### Task 3.1: Contract and sanitization

**Files:**
- Modify: `src/tui/sidebar-panels.ts`: types (~66-96), `sanitizeContribution` (~236), `panelsEqual` (~399)
- Test: `tests/tui/sidebar-panels.test.ts`

**Interfaces:**
- Produces (exported from `src/tui/sidebar-panels.ts`):

```ts
export interface SidebarPanelKeyValue {
  label: string;
  value: string;
  labelRole?: SidebarPanelRole;
  valueRole?: SidebarPanelRole;
  progress?: number;
}
// SidebarPanelContribution gains: keyValues?: readonly SidebarPanelKeyValue[];
// SanitizedSidebarPanelContribution gains: keyValues?: SidebarPanelKeyValue[];
// SidebarPanelData inherits keyValues via Omit<SidebarPanelContribution, "rows">.
```

- [ ] **Step 1: Write the failing tests**

All go through the registry's register path, like the existing tests in this file:
- `it("keeps valid keyValues with sanitized text, roles and progress")`: `{ label: "CPU\x1b[31m", value: "42%", valueRole: "warning", progress: 0.42 }` → stored `{ label: "CPU", value: "42%", valueRole: "warning", progress: 0.42 }`.
- `it("drops keyValues and keeps rows when the list is empty, not an array, or longer than SIDEBAR_PANEL_MAX_ROWS")`: three cases, each `panel.keyValues === undefined` and `panel.rows` intact.
- `it("drops keyValues when any entry is malformed")`: an entry missing `value`, a non-string `label`, a label over `SIDEBAR_PANEL_MAX_ROW_CHARS`.
- `it("drops an invalid role but keeps the entry")`: `labelRole: "nope"` → entry kept without `labelRole`.
- `it("drops out-of-range or non-finite progress but keeps the entry")`: `-0.1`, `1.1`, `NaN`, `Infinity`, `"0.5"` → no `progress`. `0` and `1` are kept.
- `it("bumps generation when only keyValues change")`: register twice with the same rows and a different value → `generation` increments.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- tests/tui/sidebar-panels.test.ts`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement**

Add `function sanitizeKeyValues(value: unknown): SidebarPanelKeyValue[] | undefined` and call it from `sanitizeContribution`. Include `keyValues` only when the result is defined. The function returns `undefined` for any of: not an array; length `0` or `> SIDEBAR_PANEL_MAX_ROWS`; an entry that is not a record; `label`/`value` not a string, failing `isSidebarPanelTextWithinRawLimit(_, SIDEBAR_PANEL_MAX_RAW_ROW_CODE_UNITS)`, or failing `fitsSidebarPanelText(_, SIDEBAR_PANEL_MAX_ROW_CHARS)`. Each limit applies to label and value separately. Text goes through `sanitizeSidebarPanelText(_, SIDEBAR_PANEL_MAX_ROW_CHARS)`. Roles must pass `isSidebarPanelRole`. Keep `progress` only when `typeof === "number"`, finite, and in `[0, 1]`. Extend `panelsEqual` to compare `keyValues` length and every field.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- tests/tui/sidebar-panels.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tui/sidebar-panels.ts tests/tui/sidebar-panels.test.ts
git commit -m "feat: accept keyValues in sidebar panel contributions"
```

### Task 3.2: Catalog content kind

**Files:**
- Modify: `src/shared/types.ts` (~121-134, `SidebarSegmentContent`)
- Modify: `src/tui/sidebar-segments.ts` (`contributionSegments` ~740)
- Test: `tests/tui/sidebar-segments.test.ts`

**Interfaces:**
- Consumes: `SidebarPanelData.keyValues` (Task 3.1).
- Produces:

```ts
export interface SidebarKeyValueContent {
  kind: "keyValue";
  label: SidebarSegmentSpan;
  value: SidebarSegmentSpan;
  progress?: number;
}
export type SidebarSegmentContent = SidebarMetricContent | SidebarBlockContent | SidebarKeyValueContent;
```

- [ ] **Step 1: Write the failing tests**

- `it("builds one keyValue entry per contributed key/value instead of rows")`: a panel with 2 rows and 3 keyValues → 3 entries, ids `sidebarAnonymousContributionSegmentId(panel.id, panel.generation, i)`, `persistence: "session"`, `content.kind === "keyValue"`.
- `it("defaults label role to muted and value role to the panel role, else primary")`: panel role `"accent"` → value role `"accent"`; no panel role → `"primary"`; label role `"muted"`.
- `it("renders keyValues when rows is empty")`: `rows: []` with 1 keyValue → 1 entry.
- `it("keeps rows entries unchanged when keyValues is absent")`: deep-equal to the current output for a rows-only panel.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- tests/tui/sidebar-segments.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

Add the type. In `contributionSegments`, when `panel.keyValues` is defined, emit one definition per entry with `dropOrder: 24`, `priority: "optional"`, the label `text(panel.title)`, and a resolve that returns the `keyValue` content (texts wrapped with the file's `text()` sanitizer). Otherwise keep the current rows loop unchanged. In `entryRows` (`src/tui/sidebar-render.ts`), add `if (entry.content.kind === "keyValue") continue;` before the metric path so the union compiles; Task 3.3 replaces it.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm test -- tests/tui/sidebar-segments.test.ts && pnpm typecheck`
Expected: PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/tui/sidebar-segments.ts src/tui/sidebar-render.ts tests/tui/sidebar-segments.test.ts
git commit -m "feat: add keyValue sidebar segment content"
```

### Task 3.3: Aligned rendering with progress bars

**Files:**
- Modify: `src/tui/sidebar-render.ts` (`entryRows` ~326)
- Test: `tests/tui/sidebar-render.test.ts`

**Interfaces:**
- Produces: `export function renderKeyValueRow(content: SidebarKeyValueContent, width: number, palette: Palette): string`. `Palette` stays module-internal; tests call it through `renderSidebarLines`, or export the type if needed.

- [ ] **Step 1: Write the failing tests**

Use `renderSidebarLines` with a contributed panel that has keyValues, as in the existing contributed-panel tests. Use `noColorTheme()` for the plain-text assertions.
- `it("left-aligns the label and right-aligns the value at the content width")`: each key/value line has `visibleWidth === contentWidth`, starts with the label and ends with the value.
- `it("draws a proportional bar when at least 4 columns fit")`: progress `0.5` with a known bar width → `filled === Math.round(0.5 * barWidth)` count of `█`, the rest `░`.
- `it("draws all-empty at 0 and all-filled at 1")`.
- `it("omits the bar when fewer than 4 columns remain")`: a width where `label + value + 2` leaves 3 columns → no `█`/`░`.
- `it("truncates label first and never exceeds the content width, including wide characters")`: label `"長いラベル名前テスト"`, value `"123456"`, narrow width → `visibleWidth(line) <= contentWidth` and the value is kept.
- `it("uses plain block characters under NO_COLOR")`: no `\x1b` in output, contains `█`.
- `it("renders a rows-only contributor byte-identically whether keyValues is absent or malformed")`: compare full `renderSidebarLines` output for the same panel with `keyValues` undefined vs `[{}]` (dropped by sanitization).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- tests/tui/sidebar-render.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement `renderKeyValueRow`**

Layout algorithm (glyphs and caps are builder's calls within the spec):
1. `value = truncateToWidth(value.text, Math.max(1, Math.floor(width / 2)))`.
2. `labelMax = width - visibleWidth(value) - 1`. `label = truncateToWidth(label.text, Math.max(0, labelMax))`.
3. `gap = width - visibleWidth(label) - visibleWidth(value)`.
4. If `progress !== undefined` and `gap - 2 >= 4`: `barWidth = gap - 2`, `filled = Math.round(progress * barWidth)`. The bar is `"█".repeat(filled) + "░".repeat(barWidth - filled)`, painted in the value role, with one space on each side. Otherwise pad `gap` spaces.
5. Paint the label in its role and the value in its role.

In `entryRows`, handle `entry.content.kind === "keyValue"` by pushing `renderKeyValueRow(entry.content, contentWidth, palette)`.

- [ ] **Step 4: Run tests and the full check**

Run: `pnpm test -- tests/tui/sidebar-render.test.ts && pnpm check`
Expected: PASS. All pre-existing sidebar-render tests pass unchanged, which proves rows-only output is identical.

- [ ] **Step 5: Commit**

```bash
git add src/tui/sidebar-render.ts tests/tui/sidebar-render.test.ts
git commit -m "feat: render aligned key/value rows with progress bars"
```

### Task 3.4: Docs and release 0.8.0

**Files:** `README.md` ("Contributing panels"), `CHANGELOG.md`, `package.json`

- [ ] **Step 1: Document**

README Contributing panels: the `keyValues` fields table (label, value, labelRole default `muted`, valueRole default panel role else `primary`, progress `0..1`), the limits (at most `SIDEBAR_PANEL_MAX_ROWS` entries, each label/value ≤ 160 chars), the fallback rule ("keep `rows` as the fallback; older hosts and invalid lists render `rows`"), and one example. CHANGELOG `## 0.8.0`, Added.

- [ ] **Step 2: Version and release check**

Version `0.8.0`. Run: `pnpm release:check`. Expected: exit 0.

- [ ] **Step 3: Commit, PR, tag**

```bash
git add README.md CHANGELOG.md package.json
git commit -m "chore: release v0.8.0"
```

After merge, tag `v0.8.0`.
