# Atelier Parity Phase 4 — Auto sidebar, saved width, toggle key (release 0.9.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Parent plan:** `docs/superpowers/plans/2026-11-14-atelier-parity.md` (this file is Phase 4, copied verbatim)

**Spec:** `docs/superpowers/specs/2026-11-14-atelier-parity-design.md` (section "Phase 4")

**Tech Stack:** TypeScript 7, pnpm, Biome, vitest, `@earendil-works/pi-coding-agent` / `@earendil-works/pi-tui` 1.5.2, Node ≥ 24.15.0.

**Prerequisite:** Phase 3 is merged to `master`.

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

## Phase 4 — Auto sidebar, saved width, toggle key (release 0.9.0)

**Goal:** the sidebar can collapse and reopen with terminal width (opt-in), remembers its width across sessions, and can be toggled from a configurable key.

**Architecture:** Three new optional config keys are normalized in `src/core/config.ts`. The split pane gains a mode and a hysteresis flag that is updated only at render time, plus an `onResizeCommit` callback fired on Enter or mouse release. The sidebar controller forwards mode and width. `src/index.ts` registers the toggle shortcut once, keeps a session-scoped visibility override, and persists the width on commit. The Settings tab gains one row.

**Branch:** `20261114-auto-sidebar`

### Phase 4 Review Focus

- Thresholds at `sidebarWidth = 44`: visible at 124, collapses at 123, stays collapsed at 131, reopens at 132. Test in Task 4.2.
- A hand-edited `statusline.json` with `"sidebarWidth": "50"`, `50.5`, `10` or `500`: these normalize to 44, 44, 28 and 72. Test in Task 4.1.
- A mouse release that does not end a drag does not persist anything. Test in Task 4.2.
- A toggle hide survives `session_tree` and `/statusline` saves that do not change `sidebarEnabled`. Test in Task 4.4.
- `toggleShortcut` that Pi rejects (registration throws): one warning at the first `session_start`, and the extension still loads. Test in Task 4.4.

### Task 4.1: Config keys

**Files:**
- Modify: `src/shared/types.ts` (`PiStatusConfig` ~224)
- Modify: `src/core/config.ts`: `DEFAULT_CONFIG` (~42), `cloneDefaultConfig`, `normalizeConfig` (~256), `saveConfig` (~339)
- Test: `tests/core/config.test.ts`

**Interfaces:**
- Produces:

```ts
export type SidebarMode = "manual" | "auto";            // src/shared/types.ts
// PiStatusConfig gains: sidebarMode: SidebarMode; sidebarWidth: number; toggleShortcut: string;
```

Defaults: `"manual"`, `44`, `""`. Width bounds come from `MIN_SIDEBAR_WIDTH`/`MAX_SIDEBAR_WIDTH`/`DEFAULT_SIDEBAR_WIDTH` in `src/tui/split-pane.ts`, imported into config.

- [ ] **Step 1: Write the failing tests**

- `it("defaults sidebarMode, sidebarWidth and toggleShortcut")`: `loadConfig` with no file → `"manual"`, `44`, `""`.
- `it.each([["auto","auto"],["manual","manual"],["AUTO","manual"],[1,"manual"],[null,"manual"]])("normalizes sidebarMode %p")`.
- `it.each([[50,50],[28,28],[72,72],[10,28],[500,72],[50.5,44],["50",44],[NaN,44],[null,44]])("normalizes sidebarWidth %p")`.
- `it.each([[" Ctrl+T ","ctrl+t"],["",""],[5,""],[null,""]])("normalizes toggleShortcut %p")`.
- `it("persists the three keys through saveConfig")`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- tests/core/config.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

Normalization rules:
- `sidebarMode` is `"auto"` only for the exact string, otherwise `"manual"`.
- `sidebarWidth`: `Number.isInteger(v)` → clamp to 28..72; anything else → 44. *(Builder's call: clamp out-of-range integers, default everything else.)*
- `toggleShortcut`: string → `trim().toLowerCase()`, otherwise `""`.

Add all three to the defaults, the clone and the `saveConfig` object. Fix compile errors in test fixtures that build a full `PiStatusConfig` (`tests/helpers.ts` `withDefaults`, if typed).

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm test -- tests/core/config.test.ts && pnpm typecheck`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/core/config.ts tests/
git commit -m "feat: add sidebarMode, sidebarWidth and toggleShortcut config"
```

### Task 4.2: Split-pane auto mode and resize commit

**Files:**
- Modify: `src/tui/split-pane.ts` (options ~38, controller interface ~54, `visibleAt` ~142, `stopResize` ~155, `wrappedRender` ~188)
- Test: `tests/tui/split-pane.test.ts`

**Interfaces:**
- Consumes: `SidebarMode` (Task 4.1).
- Produces:

```ts
export const AUTO_MAIN_WIDTH = 80;
export const AUTO_REOPEN_MARGIN = 8;
export function autoSidebarVisible(terminalWidth: number, sidebarWidth: number, wasVisible: boolean): boolean;
// SplitPaneControllerOptions gains: mode?: SidebarMode; onResizeCommit?(width: number): void;
// SplitPaneController gains: setMode(mode: SidebarMode): void; getMode(): SidebarMode;
```

- [ ] **Step 1: Write the failing tests**

- `it.each([[124,true,true],[123,true,false],[131,false,false],[132,false,true]])("autoSidebarVisible(%i, 44, was=%p) → %p")`.
- `it("collapses and reopens with the hysteresis gap in auto mode")`: `harness(124)`, mode auto, show, render → reserved 44. Set columns to 123 and render → base width 123. Set 131 → 131. Set 132 → base width 88.
- `it("keeps manual mode at the existing 92-column threshold")`: unchanged behaviour at 92/91 with default mode.
- `it("stays hidden in auto mode after hide even when the terminal grows")`: hide, set columns to 200 → base width 200.
- `it("resets the hysteresis state when switching to auto")`.
- `it("fires onResizeCommit with the width on Enter")`: begin resize, `left` ×3, `enter` → called once with 47.
- `it("fires onResizeCommit on mouse release after a drag")`.
- `it("does not fire onResizeCommit on Escape, on hide, or on a release without a drag")`.
- `it("does not fire onResizeCommit when a terminal shrink cancels the resize")`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- tests/tui/split-pane.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

- `autoSidebarVisible`: `wasVisible ? tw >= 80 + sw : tw >= 80 + sw + 8`.
- State `mode` (from options, default `"manual"`) and `autoVisible = true`.
- At the top of `wrappedRender`, when `mode === "auto"`: `autoVisible = autoSidebarVisible(terminalWidth, sidebarWidth, autoVisible)`.
- `visibleAt(tw)` returns `enabled && Number.isFinite(tw) && (mode === "auto" ? autoVisible : tw >= minimumMain + minimumSidebar)`. In auto mode it reports the state from the last render; comment this.
- `setMode` sets `autoVisible = true` and calls `requestRender()`.
- `stopResize(restore)`: when `!restore` and a resize was active, call `options.onResizeCommit?.(sidebarWidth)` inside `safely`, after resetting state.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- tests/tui/split-pane.test.ts`. Expected: PASS, including all existing tests.

- [ ] **Step 5: Commit**

```bash
git add src/tui/split-pane.ts tests/tui/split-pane.test.ts
git commit -m "feat: add auto sidebar mode and resize commit to split pane"
```

### Task 4.3: Sidebar controller plumbing

**Files:**
- Modify: `src/tui/sidebar.ts` (options ~18, interface ~28, `createSplitPaneController` call ~47)
- Test: `tests/tui/sidebar.test.ts`

**Interfaces:**
- Consumes: Task 4.2.
- Produces: `SidebarControllerOptions` gains `sidebarMode?: SidebarMode; sidebarWidth?: number; onResizeCommit?(width: number): void`. `SidebarController` gains `setMode(mode: SidebarMode): void`.

- [ ] **Step 1: Write the failing tests**

- `it("starts at the configured sidebarWidth")`: `sidebarWidth: 50` at 200 columns → `getEffectiveWidth() === 50`.
- `it("forwards setMode to the split pane")`: auto mode at 123 columns with width 44, after a render → `isEffectivelyVisible() === false`.
- `it("forwards resize commits")`.

- [ ] **Step 2: Run, implement, run**

Run: `pnpm test -- tests/tui/sidebar.test.ts`. Expected: FAIL. Forward `defaultSidebarWidth`, `mode` and `onResizeCommit` to `createSplitPaneController`, and implement `setMode: (m) => split.setMode(m)`. Re-run. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/tui/sidebar.ts tests/tui/sidebar.test.ts
git commit -m "feat: pass sidebar mode and width through the sidebar controller"
```

### Task 4.4: Extension wiring, Settings row, toggle key

**Files:**
- Modify: `src/index.ts`: `registerShortcut("ctrl+shift+r")` (~144), `saveAndApplyConfig` (~159), `applySurfaceVisibility` (~336), `session_start` (~479, controller creation ~512)
- Modify: `src/tui/dashboard-state.ts` (row union ~83, settings rows ~420, activation ~817)
- Modify: `src/tui/dashboard-render.ts` (~312)
- Create: `tests/index-sidebar-mode.test.ts`
- Test: `tests/tui/dashboard-state.test.ts`, `tests/tui/dashboard-render.test.ts`

**Interfaces:**
- Consumes: Tasks 4.1–4.3.
- Produces (closure state in `createExtension`):
  - `sidebarVisibilityOverride: boolean | undefined`. It resets at `session_start`, and on a `/statusline` save whose `sidebarEnabled` differs from the previous config. *(Builder's call: the toggle is a session override of `sidebarEnabled`.)*
  - `toggleShortcutWarning: string | undefined`, notified once at the first `session_start`.
  - `persistSidebarWidth(width: number): void`.
  - Settings row `{ type: "sidebar_mode" }`.

- [ ] **Step 1: Write the failing extension tests** (`tests/index-sidebar-mode.test.ts`, using `tests/helpers.ts` and the temp `PI_CODING_AGENT_DIR` pattern from `tests/index-workspace-pulse.test.ts`)

- `it("shows an info notice and does not begin a resize in auto mode")`: config `sidebarMode: "auto"`. Invoke the `ctrl+shift+r` handler → `notify` called with `(expect.stringContaining("auto"), "info")`, and the controller's `beginResize` is not called.
- `it("persists sidebarWidth to statusline.json when a resize is committed")`: capture `onResizeCommit` from the controller options (spy on `createSidebarController`, or drive a fake TUI). Commit 50 → the file has `sidebarWidth: 50` and other keys are unchanged.
- `it("does not write the file when the committed width equals the saved width")`.
- `it("reports a warning when persisting the width fails")`: malformed existing file → `notify(…, "warning")`.
- `it("registers the toggle shortcut from config once at load")`: config `toggleShortcut: "ctrl+t"` → `registerShortcut` called with `"ctrl+t"`.
- `it("ignores an empty toggleShortcut silently")`: only `ctrl+shift+r` registered, no warning.
- `it("ignores ctrl+shift+r as toggleShortcut with one warning at session_start")`.
- `it("warns once when registering the toggle shortcut throws")`.
- `it("toggle is a no-op with an info notice when the sidebar cannot display")`: rpc ctx, and a tui ctx whose controller reports `isSupported() === false`. `isShown()` is unchanged.
- `it("toggle hide survives session_tree and unrelated /statusline saves")`.
- `it("a /statusline save that changes sidebarEnabled clears the toggle override")`.

- [ ] **Step 2: Write the failing dashboard tests**

- `dashboard-state.test.ts`: `it("lists sidebar_mode after sidebar_enabled in settings")`; `it("activating sidebar_mode flips manual ↔ auto in the draft")`.
- `dashboard-render.test.ts`: `it("renders the Sidebar mode row with Manual/Auto")`.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test -- tests/index-sidebar-mode.test.ts tests/tui/dashboard-state.test.ts tests/tui/dashboard-render.test.ts`. Expected: FAIL.

- [ ] **Step 4: Implement**

- `ctrl+shift+r` handler: before the visibility check, when `runtimeState.snapshot().config.sidebarMode === "auto"`, notify `"Sidebar resize is off in auto mode. Set Sidebar mode to Manual in /statusline Settings."` as `"info"` and return.
- Toggle registration at load, from `runtimeState.snapshot().config.toggleShortcut`:
  - `""` → skip.
  - `"ctrl+shift+r"` → set the warning `toggleShortcut "ctrl+shift+r" is reserved for sidebar resize and was ignored`.
  - Otherwise `try { pi.registerShortcut(key as KeyId, { description: "Show or hide the pi-status sidebar", handler: toggleSidebar }) } catch (e) { warning = \`Could not register toggleShortcut "${key}": ${message}\` }`.
- `toggleSidebar(ctx)`: same session guards as the resize handler. When `ctx.mode !== "tui"`, or there is no controller, or `!controller.isSupported()`, notify `"pi-status sidebar cannot be shown here"` as `"info"` and return. Otherwise `sidebarVisibilityOverride = !controller.isShown()`, `controller.setShown(sidebarVisibilityOverride)`, `syncWorkspacePulse(config)`, `controller.requestRender()`.
- `createSidebarController` call gets `sidebarMode`, `sidebarWidth` and `onResizeCommit: persistSidebarWidth`.
- `persistSidebarWidth(width)`: return if equal. Otherwise `saveConfig({ ...config, sidebarWidth: width })` then `runtimeState.update({ type: "config_reload", config: next })`. On a throw, notify `Could not save sidebar width: <message>` as `"warning"`.
- `applySurfaceVisibility`: `controller?.setMode(config.sidebarMode)` and `controller?.setShown(sidebarVisibilityOverride ?? config.sidebarEnabled)`.
- `session_start`: reset the override; notify `toggleShortcutWarning` once (module flag).
- Dashboard: a row type plus a settings entry after `sidebar_enabled`. Activation flips `draft.sidebarMode`. Render: `pushSelectable("↔", "Sidebar mode", draft.sidebarMode === "auto" ? "Auto" : "Manual")`. If `color_preset` handles left/right, mirror that.

- [ ] **Step 5: Run the tests and full check**

Run: `pnpm test -- tests/index-sidebar-mode.test.ts tests/tui/dashboard-state.test.ts tests/tui/dashboard-render.test.ts && pnpm check`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts src/tui/dashboard-state.ts src/tui/dashboard-render.ts tests/
git commit -m "feat: wire auto sidebar mode, saved width and toggle shortcut"
```

### Task 4.5: Docs, smoke test, release 0.9.0

**Files:** `README.md` (Sidebar, Configuration), `CHANGELOG.md`, `package.json`

- [ ] **Step 1: Document**

README:
- the config table for `sidebarMode`/`sidebarWidth`/`toggleShortcut` with types and defaults;
- the auto thresholds (`< 80 + width` collapses, `≥ 80 + width + 8` reopens);
- "resize is disabled in auto mode";
- "toggle changes need `/reload`";
- "`ctrl+shift+r` cannot be the toggle key";
- the Settings row.

CHANGELOG `## 0.9.0`, Added.

- [ ] **Step 2: Manual smoke run in a resizable terminal**

`pi -e ./src/index.ts`:
1. In manual mode, resize to 50 and press Enter. Restart Pi: the width is 50.
2. Resize, then Escape: the width reverts and the file is unchanged.
3. Switch Settings → Sidebar mode Auto and save. Narrow the terminal below 130: the sidebar collapses. Widen to 131: still collapsed. Widen to 138+: it reopens.
4. Set `"toggleShortcut": "ctrl+t"` and `/reload`. Ctrl+T hides; widening keeps it hidden; Ctrl+T shows.

- [ ] **Step 3: Version, release check, commit, PR, tag**

Version `0.9.0`. Run: `pnpm release:check`. Expected: exit 0.

```bash
git add README.md CHANGELOG.md package.json
git commit -m "chore: release v0.9.0"
```

After merge, tag `v0.9.0`.
