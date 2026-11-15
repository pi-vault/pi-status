# Atelier Parity Phase 5 — Fullscreen sidebar (release 0.10.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Parent plan:** `docs/superpowers/plans/2026-11-14-atelier-parity.md` (this file is Phase 5, copied verbatim)

**Spec:** `docs/superpowers/specs/2026-11-14-atelier-parity-design.md` (section "Phase 5")

**Tech Stack:** TypeScript 7, pnpm, Biome, vitest, `@earendil-works/pi-coding-agent` / `@earendil-works/pi-tui` 1.5.2, Node ≥ 24.15.0.

**Prerequisite:** Phase 4 is merged to `master`.

## Global Constraints

- Minimum and development host from Phase 0 on: `@earendil-works/pi-coding-agent@1.5.2`, `@earendil-works/pi-tui@1.5.2`.
- Dependency bumps take the latest stable version published at least 48 hours earlier, or the second latest if the latest is younger.
- `peerDependencies` stay `"*"` for both Pi packages; the minimum is stated in README and CHANGELOG only.
- `@pi-vault/pi-usage` stays a regular `dependency`.
- `engines.node` stays `">=24.15.0"`.
- Never run any Git command in a project Pi has not trusted.
- Never retain or display changed-file paths. `statusline.json` stays global. No new dashboard tabs.
- Default behaviour is unchanged without opt-in: `sidebarMode` defaults to `"manual"`, `sidebarWidth` defaults to `44`.
- Existing `pi-status:sidebar-panels` contributors keep working; the protocol version is unchanged.
- Pi's `render` and fullscreen layout root are restored after `session_shutdown`, `/reload`, or a render error.
- Module layout: `src/core`, `src/tui`, `src/shared`; test layout: `tests/core`, `tests/tui`, `tests/index-*.test.ts`. Match the existing 2-space Biome style.
- Per phase: branch `YYYYMMDD-<phase-slug>` from `master`; update `CHANGELOG.md` and the affected README sections; bump `package.json` version; `pnpm release:check` passes; PR, merge, tag `vX.Y.Z` (`release.yml` publishes).

## Execution Notes

- Every phase starts from an up-to-date `master` that contains the previous phase's merge.
- "Run tests" means `pnpm test -- <file>` for the narrow check, then `pnpm check` before each commit that ends a task.
- Phases 0, 4 and 5 each end with a manual smoke run in Pi 1.5.2. The steps are listed in each phase's last task.

---

## Phase 5 — Fullscreen sidebar (release 0.10.0)

**Goal:** the sidebar is visible beside the chat in Pi's fullscreen mode, with the same panels, mode and keyboard resize as regular mode.

**Architecture:** A new `src/tui/fullscreen-layout.ts` wraps the fullscreen TUI's current layout root in an `HStack` (main, sidebar) via the public `setLayoutRoot()`. It records ownership on the TUI under a `Symbol.for` key, so a later restore only undoes our own root and a second install never stacks. `SplitPaneController.attach` picks this path when `isViewportTUI(tui) && tui.mode === "fullscreen"`, and otherwise keeps the render-wrapping path unchanged. Width, mode, hysteresis and keyboard resize stay in the split pane. The HStack's `visible({ width })` callback replaces the render-time reconcile.

Facts from Pi 1.5.2 source that shape this phase:
- Extensions receive a proxy TUI (`createInteractiveTuiReference`, `tui-renderer.ts:53`), so `layoutRoot` reads and `setLayoutRoot` calls reach the current renderer.
- Pi refuses to switch TUI mode while overlay entries exist (`switchTuiMode`, `interactive-mode.ts:940`). pi-status's hidden lifecycle overlay therefore blocks a mid-session switch, and detecting fullscreen at attach time is sufficient. Task 5.3 confirms this manually.
- Pi already captures the mouse in fullscreen. *(Builder's call: fullscreen ships keyboard-only resize, as the spec's fallback allows. No mouse-reporting writes in fullscreen.)*

**Branch:** `20261114-fullscreen-sidebar`

### Phase 5 Review Focus

- `/reload` in fullscreen: the old instance's `dispose` restores the root, and the new instance wraps Pi's root, not our stale HStack. Test in Task 5.1 (second owner after restore).
- Terminal narrower than 92 columns (manual) or below the auto threshold in fullscreen: the HStack hides the sidebar entry and the main pane gets the full width. Test in Task 5.2.
- A selection that starts outside the transcript (e.g. in the editor) may copy sidebar text, because Pi selects by screen columns there. Check manually in Task 5.3. If it reproduces, document it as a known limitation; atelier patches `getSelectionColumns`, which is out of scope.
- An error thrown inside our sidebar component must not break Pi's layout. `renderSidebar` already returns `"Sidebar unavailable"` rows. Test in Task 5.2.
- The `/statusline` overlay renders above both panes. Check manually in Task 5.3.

### Task 5.1: Fullscreen layout adapter

**Files:**
- Create: `src/tui/fullscreen-layout.ts`
- Test: `tests/tui/fullscreen-layout.test.ts`

**Interfaces:**
- Produces:

```ts
import type { Component, TUI, ViewportTUI } from "@earendil-works/pi-tui";
export function isFullscreenTui(tui: TUI | undefined): tui is ViewportTUI; // isViewportTUI(tui) && tui.mode === "fullscreen"
export interface FullscreenSidebarLayoutOptions {
  tui: ViewportTUI;
  sidebar: Component;
  getSidebarWidth(): number;
  isSidebarVisible(viewportWidth: number): boolean;
  minMainWidth: number; minSidebarWidth: number; maxSidebarWidth: number;
}
export interface FullscreenSidebarLayout {
  sync(): boolean;   // install or rebuild; false when no root or another owner holds it
  restore(): void;   // owner-checked
  isInstalled(): boolean;
}
export function createFullscreenSidebarLayout(options: FullscreenSidebarLayoutOptions): FullscreenSidebarLayout;
```

- [ ] **Step 1: Write the failing tests**

Stub: `{ mode: "fullscreen", [Symbol.for("@earendil-works/pi-tui/viewport")]: true, layoutRoot: main, setLayoutRoot(c) { this.layoutRoot = c }, terminal: { columns: 160, rows: 40 }, requestRender: vi.fn() }`. `main.render(w)` returns `[\`main:${w}\`]` and `sidebar.render(w)` returns `[\`side:${w}\`]`.

- `it("detects fullscreen only for viewport TUIs in fullscreen mode")`: regular stub (no symbol) → false; symbol with `mode: "regular"` → false; fullscreen stub → true.
- `it("wraps the current root in an HStack")`: `sync()` is true, `layoutRoot !== main`, and `layoutRoot.render(160)[0]` contains `main:116` and `side:44`.
- `it("restores the original root")`.
- `it("does not restore when someone else replaced the root")`: after sync, `tui.layoutRoot = other`, then `restore()` → still `other`.
- `it("does not stack on a second sync with the same width")`: the root object is identical after two syncs.
- `it("rebuilds with the new width but keeps the original root")`: width 50 → `side:50`; restore → `main`.
- `it("wraps a replaced root on the next sync")`: replaced by `other`, then sync → the HStack wraps `other`; restore → `other`.
- `it("refuses to wrap a root owned by another live instance")`: instance A syncs, instance B `sync()` → false and the root is unchanged.
- `it("lets a new instance wrap after the previous one restored")` (the `/reload` case).
- `it("hides the sidebar entry when isSidebarVisible is false")`: `render(160)` → `main:160` only.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- tests/tui/fullscreen-layout.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

- State key: `const STATE = Symbol.for("@pi-vault/pi-status/fullscreen-layout")`, storing `{ owner: object; originalRoot: Component; splitRoot: Component; width: number }` on the TUI.
- Read the root via `(tui as unknown as { layoutRoot?: Component }).layoutRoot`, with the comment `// Non-public field; atelier relies on it too. Re-check on Pi upgrades.`
- Split root: `new HStack([{ component: originalRoot, basis: 0, grow: 1, shrink: 1, minSize: minMainWidth }, { component: sidebar, basis: getSidebarWidth(), grow: 0, shrink: 1, minSize: minSidebarWidth, maxSize: maxSidebarWidth, visible: ({ width }) => isSidebarVisible(width) }])`.
- `sync()` rules, in order:
  1. A foreign owner whose `splitRoot` is current → false.
  2. Own state with `splitRoot` current and the same width → true.
  3. Own state with `splitRoot` current and a new width → rebuild from `originalRoot`.
  4. Otherwise, wrap the current root if defined (else false).

  Every install calls `requestRender()`.
- `restore()`: only when `state.owner === me`. Set the original root back only if the current root is our `splitRoot`. Always clear our state.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- tests/tui/fullscreen-layout.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tui/fullscreen-layout.ts tests/tui/fullscreen-layout.test.ts
git commit -m "feat: add owner-checked fullscreen sidebar layout adapter"
```

### Task 5.2: Use the adapter from the split pane and sidebar

**Files:**
- Modify: `src/tui/split-pane.ts` (`attach` ~181, `show`/`hide`/`setSidebarWidth`/`beginResize`/`handleResizeInput`/`dispose`)
- Modify: `src/tui/sidebar.ts` (remove `VIEWPORT_TUI` ~40-43; `supportsSidebar`; resize banner option)
- Modify: `src/tui/sidebar-render.ts` (banner ~417)
- Modify: `src/index.ts` (`saveAndApplyConfig` commit path: call `activeSidebarController?.syncLayout()`)
- Test: `tests/tui/split-pane.test.ts`, `tests/tui/sidebar.test.ts`, `tests/tui/sidebar-render.test.ts`

**Interfaces:**
- Consumes: `isFullscreenTui`, `createFullscreenSidebarLayout` (Task 5.1). Mode, hysteresis and `onResizeCommit` (Phase 4).
- Produces:
  - `SplitPaneController.syncLayout(): void` (no-op in regular mode) and `SplitPaneController.isFullscreen(): boolean`.
  - `SidebarController.syncLayout(): void`.
  - `renderSidebarLines` option `keyboardOnlyResize?: boolean`.

- [ ] **Step 1: Write the failing tests**

`split-pane.test.ts`, `describe("fullscreen")`, using the Task 5.1 stub:
- `it("installs the HStack instead of patching render")`: after `attach` + `show`, `tui.render` is unchanged and `layoutRoot` is wrapped.
- `it("restores the root on hide and re-wraps on show")`.
- `it("restores the root on dispose")`.
- `it("hides the sidebar entry below 92 columns in manual mode and per hysteresis in auto mode")`: render the root at 91 → main only; auto at 123 → main only.
- `it("resizes with arrow keys, rebuilds the HStack, and commits on Enter without mouse sequences")`: `write` is never called with mouse enable/disable sequences, and mouse input is not consumed.
- `it("keeps the regular render-wrapping path for non-viewport TUIs")`: the existing harness still passes (existing tests).

`sidebar.test.ts`:
- `it("supports regular and fullscreen TUIs and rejects a viewport TUI in regular mode")`. Update any existing test that asserted fullscreen is unsupported.
- `it("keeps Pi's layout when the sidebar component throws")`: the `getView` throw path renders `"Sidebar unavailable"` rows inside the HStack.

`sidebar-render.test.ts`:
- `it("shows a keyboard-only resize banner")`: `keyboardOnlyResize: true` → contains `RESIZE · ←/→ Enter/Esc`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- tests/tui/split-pane.test.ts tests/tui/sidebar.test.ts tests/tui/sidebar-render.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

`attach(tui, renderTrailing)`: when `isFullscreenTui(tui)`, create the layout with:
- `sidebar = { render: (w) => renderTrailing?.(w, tui.terminal.rows) ?? [], invalidate() {} }`;
- `getSidebarWidth: () => sidebarWidth`;
- `isSidebarVisible: (w) => { if (mode === "auto") autoVisible = autoSidebarVisible(w, sidebarWidth, autoVisible); reconcileResizeWidth(w); return visibleAt(w); }`;
- the min/max constants.

Do not touch `tui.render`. Then:
- `show()` → `layout.sync()`. `hide()` and `dispose()` → `layout.restore()`.
- `setSidebarWidth` → `layout.sync()` after updating the width.
- `syncLayout()` → `if (enabled) layout?.sync()`.
- If `sync()` throws: `restore()`, `enabled = false`, `onError`.
- `beginResize` in fullscreen skips `tui.terminal.write(ENABLE_MOUSE)`. `handleResizeInput` ignores mouse input (returns `undefined`) in fullscreen.

`sidebar.ts`:
- `supportsSidebar = (tui) => tui !== undefined && (!isViewportTUI(tui) || tui.mode === "fullscreen")`;
- pass `keyboardOnlyResize: split.isFullscreen()` into `renderSidebarLines`;
- add `syncLayout: () => split.syncLayout()`.

`sidebar-render.ts`: the banner text is `"RESIZE · ←/→ Enter/Esc"` when `keyboardOnlyResize`, else unchanged. `index.ts`: call `activeSidebarController?.syncLayout()` after a successful `/statusline` save. Sidebar show and `session_start` already reach `split.show()`/`attach`.

- [ ] **Step 4: Run the tests and full check**

Run: `pnpm test -- tests/tui/split-pane.test.ts tests/tui/sidebar.test.ts tests/tui/sidebar-render.test.ts && pnpm check`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tui/split-pane.ts src/tui/sidebar.ts src/tui/sidebar-render.ts src/index.ts tests/
git commit -m "feat: show the sidebar in Pi fullscreen mode"
```

### Task 5.3: Manual verification, docs, release 0.10.0

**Files:** `README.md` (Sidebar), `CHANGELOG.md`, `package.json`

- [ ] **Step 1: Manual verification in Pi 1.5.2 fullscreen**

Set Pi's TUI mode to fullscreen in settings, restart, then run `pi -e ./src/index.ts`. Confirm each:
1. The sidebar is visible beside the transcript at ≥ 92 columns and hides when narrower.
2. Wheel scroll and drag selection inside the transcript work and do not copy sidebar text.
3. A selection that starts in the editor: note whether sidebar text is copied (Review Focus).
4. `/statusline` opens above both panes; saving re-wraps without stacking (the sidebar appears once).
5. Ctrl+Shift+R, arrows, Enter: the width changes and persists. Escape reverts.
6. Auto mode collapses and reopens per Phase 4 thresholds.
7. `/reload`: exactly one sidebar, with no gap where an old one was.
8. Pi Settings → TUI mode → regular, with the sidebar mounted: expect "Close active overlays before changing TUI mode". If Pi instead switches, confirm that no stale HStack remains and the regular sidebar appears after `/reload`, and record the result in the CHANGELOG.

- [ ] **Step 2: Document**

README Sidebar: replace "Fullscreen and viewport TUIs do not render the Sidebar" with the fullscreen behaviour, keyboard-only resize in fullscreen, and any limitation found in Step 1 (editor-start selection, mode switching). CHANGELOG `## 0.10.0`, Added.

- [ ] **Step 3: Version, release check, commit, PR, tag**

Version `0.10.0`. Run: `pnpm release:check`. Expected: exit 0.

```bash
git add README.md CHANGELOG.md package.json
git commit -m "chore: release v0.10.0"
```

After merge, tag `v0.10.0`.
