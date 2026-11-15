# Atelier Parity Phase 5 — Fullscreen sidebar (release 0.10.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Parent plan:** `docs/superpowers/plans/2026-11-14-atelier-parity.md` (Phase 5; this file supersedes the parent's Phase 5 text after the 2026-11-15 readiness review)

**Spec:** `docs/superpowers/specs/2026-11-14-atelier-parity-design.md` (section "Phase 5")

**Tech Stack:** TypeScript 7, pnpm, Biome, vitest, `@earendil-works/pi-coding-agent` / `@earendil-works/pi-tui` 1.5.2, Node ≥ 24.15.0.

**Prerequisite:** Phase 4 is merged to `master` (done: PR #100, v0.9.0).

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
- Per phase: branch from `master`; update `CHANGELOG.md` and the affected README sections; bump `package.json` version; `pnpm release:check` passes; PR, merge, tag `vX.Y.Z` (`release.yml` publishes).

## Execution Notes

- "Run tests" means `pnpm test -- <file>` for the narrow check, then `pnpm check` before each commit that ends a task.
- Phase 5 ends with a manual smoke run in Pi 1.5.2 fullscreen (Task 5.3).

---

## Phase 5 — Fullscreen sidebar (release 0.10.0)

**Goal:** the sidebar is visible beside the chat in Pi's fullscreen mode, with the same panels and mode as regular mode, and keyboard resize.

**Architecture:** A new `src/tui/fullscreen-layout.ts` wraps the fullscreen TUI's current layout root in an `HStack` (main, sidebar) via the public `setLayoutRoot()`. It records ownership on the TUI under a `Symbol.for` key, so a restore only undoes our own root and a second install never stacks. `SplitPaneController.attach` takes this path when `isViewportTUI(tui) && tui.mode === "fullscreen"`, and otherwise keeps the render-wrapping path unchanged. Width, mode, hysteresis and keyboard resize stay in the split pane. The HStack's `visible({ width })` callback replaces the render-time reconcile.

The layout has two entry points with different strengths:
- `install()` wraps whatever root is current. Only lifecycle points call it: sidebar show, and `syncLayout()` after a `/statusline` save. This is how the spec's "do not fight a replaced root" rule is kept.
- `refresh()` rebuilds the HStack only when our root is still installed and the width changed. The split pane's internal `requestRender` helper calls it, so every path that changes `sidebarWidth` (arrow keys, Escape revert, `beginResize` normalising, `setMode`, a terminal-shrink clamp being undone) keeps the HStack basis in step without each path remembering to sync.

**Branch:** `20261115-pi-atelier-parity-phase-5-fullscreen-sidebar` (already created from `master` at `d8547a9`).

### Facts verified against Pi 1.5.2 (2026-11-15)

Checked in `node_modules/@earendil-works/*` 1.5.2 and `/Users/lanh/Developer/pi-packages/pi` (`v1.5.2-225`; no changes since 1.5.2 to `setLayoutRoot`, `layoutRoot`, stack layout, or `handleViewportInput`).

- `isViewportTUI`, `ViewportTUI.setLayoutRoot`, `HStack` and `StackEntry.visible` are exported from `@earendil-works/pi-tui`. `layoutRoot` is a TS-`private` field on `TuiAltScreen`, readable at runtime (atelier reads it too).
- Extensions receive a proxy TUI (`createInteractiveTuiReference`, `tui-renderer.js:37`). It forwards `get`, `set` and `has` to the current renderer, so `layoutRoot` reads, `setLayoutRoot` calls and our `Symbol.for` state all reach the live `TuiAltScreen`.
- Pi sets its fullscreen root in `init()` (`mountInteractiveTui`) before extensions bind, so `layoutRoot` is defined at `session_start`.
- `TuiAltScreen.doRender` lays out `layoutRoot` with `renderLayoutFrame(root, cols, rows)`. For an `hstack` node, it calls `visible({ width: cols, height: rows })`, uses a numeric `basis` directly, gives every child the full terminal height (`align: "stretch"`), and renders each child once per frame at its allocated width. With main `{ basis 0, grow 1, minSize 64 }` and sidebar `{ basis w, shrink 1, min 28, max 72 }`, the allocated sidebar width equals the split pane's `effectiveSidebarWidth` (e.g. 100 cols, w 44 → 36), so a render-time clamp needs no rebuild.
- `setLayoutRoot` clears `currentLayout` and requests a render. Calling it mid-frame (e.g. from a `visible` callback that ends a resize) is harmless: the current frame finishes on the old root, and the next frame uses the new one.
- Pi refuses to switch TUI mode while `hasOverlayEntries` (`switchTuiMode`, `interactive-mode.js:645`). pi-status's hidden lifecycle overlay stays in the overlay stack even when hidden, so this already blocks a mid-session switch in **both** directions (existing behaviour). Detecting fullscreen at attach time is therefore sufficient.
- `/reload` calls `resetExtensionUI()` (removes our overlay), then emits `session_shutdown` (reason `reload`) to the old runner (our `dispose` restores the root), then `session_start` to the new one.
- Input order: `TuiAltScreen` registers its viewport input listener in its constructor, before any extension listener. It consumes **every** SGR mouse event, so our resize listener never sees mouse input in fullscreen. It does not consume ←/→, Shift+←/→, Enter or Escape unless Pi's search overlay is focused (`tui.altScreen.searchNext`/`searchClose`), so keyboard resize reaches our listener.
- Pi already has mouse reporting on in fullscreen. **Writing `DISABLE_MOUSE` in fullscreen would switch off Pi's own wheel scroll and selection.** Fullscreen must never write `ENABLE_MOUSE` or `DISABLE_MOUSE`. (Builder's call: fullscreen ships keyboard-only resize, as the spec's fallback allows.)
- Selection: a drag that starts in the transcript `ScrollView` copies from `scrollContentLines` (main pane only). A drag that starts outside it (e.g. the editor) copies `previousScreen` by screen columns, so it can include sidebar text. Atelier patches `getSelectionColumns`/`applySelection`. That is out of scope here; document it as a known limitation.
- `compositeTuiLine` returns the base line untouched when it is a Kitty/iTerm2 image line, so sidebar rows beside an inline image row are blank. Regular mode already behaves this way (`composeTrailingColumn`). Atelier ships an image compositor; that is out of scope here.

### Phase 5 Review Focus

- **Width sync:** Escape after arrow presses must put the HStack back to the start width, not leave it at the last intermediate width. Test in Task 5.2.
- **Mouse in fullscreen:** no `ENABLE_MOUSE`/`DISABLE_MOUSE` write at any point (begin, Enter, Escape, hide, dispose, too-narrow auto-exit). Test in Task 5.2.
- **`/reload` in fullscreen:** the old instance's `dispose` restores the root, and the new instance wraps Pi's root, not our stale HStack. Test in Task 5.1.
- **Narrow terminals:** below 92 columns (manual) or below the auto threshold, the HStack hides the sidebar entry and the main pane gets the full width. Test in Task 5.2.
- **Errors:** a throw from the sidebar renderer must not reach Pi's `doRender`. The sidebar `Component` wrapper catches, reports via `onError`, and returns blank rows. Test in Task 5.2.
- **Do not fight a replaced root:** `refresh()` and ordinary `requestRender` calls never wrap a foreign root; only `install()` does. Test in Task 5.1.

### Task 5.1: Fullscreen layout adapter

**Files:**
- Create: `src/tui/fullscreen-layout.ts`
- Test: `tests/tui/fullscreen-layout.test.ts`

**Interfaces:**
- Produces:

```ts
import type { Component, TUI, ViewportTUI } from "@earendil-works/pi-tui";
export function isFullscreenTui(tui: TUI | undefined): tui is ViewportTUI; // tui !== undefined && isViewportTUI(tui) && tui.mode === "fullscreen"
export interface FullscreenSidebarLayoutOptions {
  tui: ViewportTUI;
  sidebar: Component;
  getSidebarWidth(): number;
  isSidebarVisible(viewportWidth: number): boolean;
  minMainWidth: number; minSidebarWidth: number; maxSidebarWidth: number;
}
export interface FullscreenSidebarLayout {
  install(): boolean; // wrap the current root; false when there is no root or another live owner holds it
  refresh(): void;    // rebuild only if our root is current and the width changed; never wraps a foreign root
  restore(): void;    // owner-checked
  isInstalled(): boolean; // our state exists and our splitRoot is the current root
}
export function createFullscreenSidebarLayout(options: FullscreenSidebarLayoutOptions): FullscreenSidebarLayout;
```

- [ ] **Step 1: Write the failing tests**

Stub helper `fullscreenStub(columns = 160)`: `{ mode: "fullscreen", [Symbol.for("@earendil-works/pi-tui/viewport")]: true, layoutRoot: main, setLayoutRoot(c) { this.layoutRoot = c }, terminal: { columns, rows: 40, write: vi.fn() }, requestRender: vi.fn() }`. `main.render(w)` returns `[\`main:${w}\`]`; `sidebar.render(w)` returns `[\`side:${w}\`]`. Width comes from a mutable `let width = 44`.

- `it("detects fullscreen only for viewport TUIs in fullscreen mode")`: `undefined` → false; regular stub (no symbol) → false; symbol with `mode: "regular"` → false; fullscreen stub → true.
- `it("wraps the current root in an HStack")`: `install()` is true, `layoutRoot !== main`, `isInstalled()` is true, `requestRender` was called, and `layoutRoot.render(160)[0]` contains `main:116` and `side:44`.
- `it("restores the original root")`: install, restore → `layoutRoot === main`, `isInstalled()` false.
- `it("does not restore when someone else replaced the root")`: install, `tui.layoutRoot = other`, restore → still `other`.
- `it("does not stack on a second install with the same width")`: the root object is identical after two installs.
- `it("refresh rebuilds with the new width but keeps the original root")`: install, `width = 50`, `refresh()` → `side:50`; restore → `main`.
- `it("refresh is a no-op when the width is unchanged")`: the root object is identical.
- `it("refresh never wraps a replaced root")`: install, `tui.layoutRoot = other`, `width = 50`, `refresh()` → still `other`.
- `it("install wraps a replaced root")`: install, replace with `other`, install → the HStack wraps `other`; restore → `other`.
- `it("refuses to wrap a root owned by another live instance")`: A installs; B `install()` → false, root unchanged; B `restore()` leaves A's root in place.
- `it("lets a new instance wrap after the previous one restored")` (the `/reload` case): A installs and restores; B installs → wraps `main`.
- `it("returns false without a root")`: `layoutRoot: undefined` → `install()` false, `setLayoutRoot` not called.
- `it("hides the sidebar entry when isSidebarVisible is false")`: `render(160)` → `["main:160"]`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- tests/tui/fullscreen-layout.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

- State key: `const STATE = Symbol.for("@pi-vault/pi-status/fullscreen-layout")`, storing `{ owner: object; originalRoot: Component; splitRoot: Component; width: number }` on the TUI. `Symbol.for` (not `Symbol`) so a reloaded module instance sees the previous instance's state.
- Read the root via `(tui as unknown as { layoutRoot?: Component }).layoutRoot`, with the comment `// Non-public field; atelier relies on it too. Re-check on Pi upgrades.`
- Split root: `new HStack([{ component: originalRoot, basis: 0, grow: 1, shrink: 1, minSize: minMainWidth }, { component: sidebar, basis: getSidebarWidth(), grow: 0, shrink: 1, minSize: minSidebarWidth, maxSize: maxSidebarWidth, visible: ({ width }) => isSidebarVisible(width) }])`.
- `install()` rules, in order:
  1. A foreign owner whose `splitRoot` is current → false.
  2. Own state with `splitRoot` current → `refresh()`, return true.
  3. Otherwise, if the current root is defined, wrap it, store fresh state (overwriting any stale state), `setLayoutRoot`, `requestRender()`, return true; else false.
- `refresh()`: only when own state exists, its `splitRoot` is current, and `getSidebarWidth() !== state.width`. Rebuild from `state.originalRoot`, `setLayoutRoot`, update `splitRoot`/`width`.
- `restore()`: only when `state.owner === me`. Set the original root back only if the current root is our `splitRoot`. Always clear our state.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- tests/tui/fullscreen-layout.test.ts && pnpm check`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tui/fullscreen-layout.ts tests/tui/fullscreen-layout.test.ts
git commit -m "feat: add owner-checked fullscreen sidebar layout adapter"
```

### Task 5.2: Use the adapter from the split pane and sidebar

**Files:**
- Modify: `src/tui/split-pane.ts` (`requestRender` helper ~171, `stopResize` ~173, `attach` ~196, `handleResizeInput` ~238, controller `show`/`hide`/`beginResize`/`dispose`; add `syncLayout`, `isFullscreen`)
- Modify: `src/tui/sidebar.ts` (remove `VIEWPORT_TUI` ~45; `supportsSidebar` ~47; pass `keyboardOnlyResize`; add `syncLayout`)
- Modify: `src/tui/sidebar-render.ts` (`renderSidebarLines`/`renderSidebarLinesInner` option type ~460/~492, banner ~464)
- Modify: `src/index.ts` (`saveAndApplyConfig` commit callback ~182: call `activeSidebarController?.syncLayout()` after `applySurfaceVisibility`)
- Test: `tests/tui/split-pane.test.ts`, `tests/tui/sidebar.test.ts`, `tests/tui/sidebar-render.test.ts`, `tests/index-sidebar-mode.test.ts`

**Interfaces:**
- Consumes: `isFullscreenTui`, `createFullscreenSidebarLayout` (Task 5.1). Mode, hysteresis, `chosenWidth` and `onResizeCommit` (Phase 4).
- Produces:
  - `SplitPaneController.syncLayout(): void` (re-wraps via `install()` when enabled; no-op in regular mode) and `SplitPaneController.isFullscreen(): boolean`.
  - `SidebarController.syncLayout(): void`.
  - `renderSidebarLines` option `keyboardOnlyResize?: boolean`.

- [ ] **Step 1: Write the failing tests**

`split-pane.test.ts`, new `describe("fullscreen")`. Add a `fullscreenHarness(columns = 160)` that builds the Task 5.1 stub plus a `render` spy, attaches with a `renderTrailing` of `(w, h) => [\`side:${w}x${h}\`]`, and exposes `send` like `resizeHarness`:
- `it("installs the HStack on show instead of patching render")`: after `attach`, `layoutRoot === main` (attach alone does not install); after `show`, `tui.render` is the original spy and `layoutRoot.render(160)[0]` contains `main:116` and `side:44x40`.
- `it("restores the root on hide and re-wraps on show")`.
- `it("restores the root on dispose")`.
- `it("hides the sidebar entry below 92 columns in manual mode and per hysteresis in auto mode")`: `layoutRoot.render(91)` → `["main:91"]`; in auto mode `render(123)` → main only, `render(124)` stays hidden (needs 132 to reopen), `render(132)` shows the sidebar.
- `it("rebuilds the HStack on arrow keys and commits on Enter")`: begin resize, `left` ×2 → `side:46x40`; Enter → `onResizeCommit(46)`.
- `it("reverts the HStack width on Escape")`: begin, `left` ×3, Escape → `layoutRoot.render(160)` contains `side:44x40` again.
- `it("never writes mouse reporting sequences in fullscreen")`: across begin, arrows, Enter, begin, Escape, begin then `hide()`, and begin then `dispose()`, `write` is never called.
- `it("does not consume mouse input during fullscreen resize")`: `send(press(117))` returns `undefined`.
- `it("does not re-wrap a root replaced by someone else on ordinary renders")`: after show, set `tui.layoutRoot = other`; `split.requestRender()` and `setSidebarWidth(50)` leave `other`; `split.syncLayout()` wraps `other`.
- `it("keeps Pi's layout when the trailing renderer throws")`: a `renderTrailing` that throws → `layoutRoot.render(160)` does not throw, the main pane still renders, and `onError` is called.
- The existing regular-mode tests stay green unchanged (non-viewport harness).

`sidebar.test.ts`:
- Rename `"isSupported() returns false when the host is a viewport TUI"` → `"isSupported() returns false for a viewport TUI that is not in fullscreen mode"` and `"does not install the trailing renderer on viewport TUIs"` → `"... on viewport TUIs in regular mode"`. Their stubs set the symbol without `mode: "fullscreen"`, so their assertions stay as they are.
- `it("supports a fullscreen viewport TUI")`: the stub with `mode: "fullscreen"`, `layoutRoot`, `setLayoutRoot` → `isSupported()` true, `isEffectivelyVisible()` true at 160 columns, and `layoutRoot` is wrapped after `setShown(true)`.
- `it("renders 'Sidebar unavailable' inside the HStack when getView throws")`.
- `it("syncLayout re-wraps a replaced fullscreen root")`.

`sidebar-render.test.ts`:
- `it("shows a keyboard-only resize banner")`: `{ resizing: true, keyboardOnlyResize: true }` → contains `RESIZE · ←/→ Enter/Esc`; `{ resizing: true }` still contains `RESIZE · drag divider`.

`index-sidebar-mode.test.ts`:
- `it("re-syncs the sidebar layout after a /statusline save")`: spy on the controller's `syncLayout` (or the fake TUI's `setLayoutRoot` with a fullscreen stub) and assert it is reached after a successful save. Follow the existing harness in that file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- tests/tui/split-pane.test.ts tests/tui/sidebar.test.ts tests/tui/sidebar-render.test.ts tests/index-sidebar-mode.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

`split-pane.ts`:
- New state: `let layout: FullscreenSidebarLayout | undefined`.
- `requestRender` helper → `() => { safely(() => layout?.refresh()); tui?.requestRender(); }`. Every width- or mode-changing path already goes through it (`stopResize`, `setSidebarWidth`, `setMode`, `beginResize`, `show`, `hide`), which closes the Escape/normalise gap. Keep `controller.requestRender` pointing at the same helper.
- `attach(tui, renderTrailing)`: after the existing guards, when `isFullscreenTui(tui)`, set `tui`/`trailingRenderer`, create the layout, `requestRender()`, and return without touching `tui.render`. Layout options:
  - `sidebar = { render: (w) => { try { return trailingRenderer?.(w, Math.max(0, Math.trunc(tui.terminal.rows))) ?? []; } catch (error) { safely(() => options.onError?.(error)); return []; } }, invalidate() {} }`;
  - `getSidebarWidth: () => sidebarWidth`;
  - `isSidebarVisible: (w) => { if (enabled && mode === "auto" && Number.isFinite(w)) autoVisible = autoSidebarVisible(w, sidebarWidth, autoVisible); reconcileResizeWidth(w); return visibleAt(w); }` (the same steps as the regular `wrappedRender`);
  - `minMainWidth: minimumMain`, `minSidebarWidth: minimumSidebar`, `maxSidebarWidth: maximumSidebar`.
- `show()`: after `enabled = true`, `layout?.install()` (inside `safely`; on failure report via `onError`).
- `hide()`: after `enabled = false`, `layout?.restore()`.
- `syncLayout()`: `if (enabled && !disposed) layout?.install()`, then `requestRender()`.
- `isFullscreen()`: `layout !== undefined`.
- `beginResize()`: write `ENABLE_MOUSE` and set `mouseReportingEnabled = true` only when `!layout`. `stopResize` then never writes `DISABLE_MOUSE` in fullscreen, because the flag stays false.
- `handleResizeInput`: when `layout` is set and the data parses as SGR mouse, return `undefined` (Pi's viewport listener consumes mouse events before ours anyway; this keeps the controller honest under test).
- `dispose()`: `layout?.restore()` and `layout = undefined` alongside the existing render restore.

`sidebar.ts`:
- `import { isViewportTUI } from "@earendil-works/pi-tui"`; drop the private `VIEWPORT_TUI` constant.
- `supportsSidebar = (tui) => tui !== undefined && (!isViewportTUI(tui) || tui.mode === "fullscreen")`.
- Pass `{ resizing: split.isResizing(), keyboardOnlyResize: split.isFullscreen() }` to `renderSidebarLines`.
- Add `syncLayout: () => safely(() => split.syncLayout())` to the interface and the returned object.

`sidebar-render.ts`: add `keyboardOnlyResize?: boolean` to both option types. The banner text is `"RESIZE · ←/→ Enter/Esc"` when `keyboardOnlyResize`, else unchanged.

`index.ts`: in the `saveAndApplyConfig` commit callback, call `activeSidebarController?.syncLayout()` after `applySurfaceVisibility(...)`. `session_start` and sidebar show already reach `attach` and `split.show()`.

- [ ] **Step 4: Run the tests and full check**

Run: `pnpm test -- tests/tui/split-pane.test.ts tests/tui/sidebar.test.ts tests/tui/sidebar-render.test.ts tests/index-sidebar-mode.test.ts && pnpm check`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tui/split-pane.ts src/tui/sidebar.ts src/tui/sidebar-render.ts src/index.ts tests/
git commit -m "feat: show the sidebar in Pi fullscreen mode"
```

### Task 5.3: Manual verification, docs, release 0.10.0

**Files:** `README.md` (Sidebar, ~228 and ~246), `CHANGELOG.md`, `package.json`

- [ ] **Step 1: Manual verification in Pi 1.5.2 fullscreen**

Set Pi's TUI mode to fullscreen in settings **before** starting Pi (pi-status's lifecycle overlay blocks switching mode mid-session), then run `pi -e ./src/index.ts`. Confirm each:
1. The sidebar is visible beside the transcript at ≥ 92 columns and hides when narrower.
2. Wheel scroll and drag selection inside the transcript work, and copying does not include sidebar text.
3. Wheel scroll and selection still work **after** a resize session ends with Enter and with Escape (no mouse-reporting writes).
4. A selection that starts in the editor: note whether sidebar text is copied or highlighted (expected: yes; known limitation).
5. `/statusline` opens above both panes, offset left like regular mode; saving re-wraps without stacking (the sidebar appears once).
6. Ctrl+Shift+R, arrows, Enter: the width changes and persists across restart. Ctrl+Shift+R, arrows, Escape: the width reverts on screen immediately.
7. Auto mode collapses and reopens per the Phase 4 thresholds.
8. `/reload`: exactly one sidebar, with no gap where an old one was.
9. Pi Settings → TUI mode → regular, with pi-status loaded: expect "Close active overlays before changing TUI mode". If Pi switches instead, confirm no stale HStack remains and the regular sidebar appears after `/reload`, and record the result in the CHANGELOG.
10. If an inline image appears in the transcript: note that sidebar rows beside image rows are blank (known limitation, same as regular mode).

- [ ] **Step 2: Document**

README Sidebar:
- Replace the sentence "Fullscreen and viewport TUIs do not render the Sidebar: ..." (~228) with the fullscreen behaviour: the sidebar is a column beside the transcript, chosen when Pi starts in fullscreen mode.
- In the resize paragraph (~246), state that fullscreen resize is keyboard-only (no divider drag).
- Known limitations: a selection that starts outside the transcript can include sidebar text; sidebar rows beside inline images are blank; changing Pi's TUI mode needs a restart while pi-status is loaded (Pi blocks the switch). Include any other finding from Step 1.

CHANGELOG `## 0.10.0`, Added: fullscreen sidebar, keyboard-only resize in fullscreen, known limitations.

- [ ] **Step 3: Version, release check, commit, PR, tag**

Version `0.10.0`. Run: `pnpm release:check`. Expected: exit 0.

```bash
git add README.md CHANGELOG.md package.json
git commit -m "chore: release v0.10.0"
```

After merge, tag `v0.10.0`.
