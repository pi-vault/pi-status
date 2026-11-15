# Atelier Parity Phase 4 — Auto sidebar, saved width, toggle key (release 0.9.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Parent plan:** `docs/superpowers/plans/2026-11-14-atelier-parity.md`. This file was revised after checking it against the repo at `v0.8.0` (`58154b2`), Pi `1.5.2` (`/Users/lanh/Developer/pi-packages/pi`), and pi-atelier (`/Users/lanh/Developer/pi-packages/michaelmjhhhh-pi-atelier`). The parent's Phase 4 section points here. See "Revision notes" at the end.

**Spec:** `docs/superpowers/specs/2026-11-14-atelier-parity-design.md` (section "Phase 4")

**Reference implementation (pi-atelier):**

- `src/split-pane.ts`: `AUTO_MAIN_WIDTH`/`AUTO_REOPEN_MARGIN` (~90), `resolveLayout` hysteresis (~432), commit only on change in `stopResize` (~519), `setMode`/`show` reset (~600–625), auto-mode refusal in `beginResize` (~635).
- `src/shortcuts.ts`: `keyIdentity` (modifier-order-insensitive key compare).
- `extensions/index.ts`: `saveSidebarWidth` (~360) writes a _patch_ of one key and ignores stale sessions.

**Pi 1.5.2 facts this plan relies on** (`packages/coding-agent/src/core/extensions/`):

- `loader.ts:329` `registerShortcut` only throws when the extension instance is stale. It does not validate the key.
- `runner.ts:96-117,680-720` `getShortcuts`: an extension key that matches a _reserved_ built-in (`app.thinking.toggle` = `ctrl+t`, `app.interrupt`, `app.clear`, `app.exit`, model and tool keys, …) is skipped, and Pi itself reports a diagnostic. Other built-ins (for example editor `ctrl+b`) are overridden by the extension, also with a Pi diagnostic. pi-status does not duplicate those warnings.

**Tech Stack:** TypeScript 7, pnpm, Biome, vitest 5, `@earendil-works/pi-coding-agent` / `@earendil-works/pi-tui` 1.5.2, Node ≥ 24.15.0.

**Prerequisite:** Phase 3 is merged to `master` (`v0.8.0`, `58154b2`, done). Baseline: 35 test files, 998 tests passing (`pnpm check` green).

## Global Constraints

- Minimum and development host: `@earendil-works/pi-coding-agent@1.5.2`, `@earendil-works/pi-tui@1.5.2`.
- `peerDependencies` stay `"*"` for both Pi packages. `@pi-vault/pi-usage` stays a regular `dependency`. `engines.node` stays `">=24.15.0"`.
- Never run any Git command in a project Pi has not trusted.
- Never retain or display changed-file paths. `statusline.json` stays global. No new dashboard tabs.
- Default behaviour is unchanged without opt-in: `sidebarMode` defaults to `"manual"`, `sidebarWidth` defaults to `44`, and `toggleShortcut` defaults to `""`.
- Existing `pi-status:sidebar-panels` contributors keep working, and `SIDEBAR_PANEL_PROTOCOL_VERSION` stays `1`.
- Pi's `render` is restored after `session_shutdown`, `/reload`, or a render error (existing split-pane behaviour; do not regress it).
- Module layout: `src/core`, `src/tui`, `src/shared`; tests in `tests/core`, `tests/tui`, `tests/index-*.test.ts`. Use the existing 2-space Biome style.
- Keep the Phase 5 hook names: `autoSidebarVisible`, `autoVisible`, `mode`, `visibleAt`, `reconcileResizeWidth`, `onResizeCommit` in `src/tui/split-pane.ts`. The Phase 5 plan calls them.
- Per phase: update `CHANGELOG.md` and the affected README sections, bump the `package.json` version, pass `pnpm release:check`, then PR, merge and tag `vX.Y.Z` (`release.yml` publishes).

## Execution Notes

- **Branch:** `20261114-pi-atelier-parity-phase-4-auto-sidebar` (it already exists at `58154b2` and matches the Phase 1–3 naming).
- "Run tests" means `pnpm test <file>` for the narrow check, then `pnpm check` before each commit that ends a task. (`pnpm test -- <file>` also works, but it runs the whole suite.)
- Line numbers are from `58154b2` and are approximate.
- Test casts: malformed config values go through a JSON file or a `ConfigStore`, as the existing `tests/core/config.test.ts` tests do. `normalizeConfig` is not exported.

---

## Phase 4 — Auto sidebar, saved width, toggle key (release 0.9.0)

**Goal:** the sidebar can collapse and reopen with terminal width (opt-in), remembers its width across sessions, and can be toggled from a configurable key.

**Architecture:**

- Three config keys are normalized in `src/core/config.ts`.
- The split pane gains a mode and a hysteresis flag, updated only at render time, plus an `onResizeCommit` callback. It fires on a confirmed resize (Enter or mouse release after a drag) that changed the width.
- The sidebar controller forwards mode, starting width and commit.
- `src/index.ts`:
  - registers the toggle key once at load;
  - keeps a session-scoped visibility override;
  - persists the width as a one-key patch of the current file.
- The Settings tab gains one row, and the dashboard dirty check learns `sidebarMode`.

### Phase 4 Review Focus

- Thresholds at `sidebarWidth = 44`: visible at 124, collapses at 123, stays collapsed at 131, reopens at 132 (Task 4.2).
- `sidebarWidth` in the file as `"50"`, `50.5`, `true`, `null`, `10` or `500` normalizes to 44, 44, 44, 44, 28 and 72 (Task 4.1).
- Saved width never changes from a terminal resize:
  - Enter with no width change persists nothing, even when the terminal clamped the width at resize start.
  - A mouse release without a drag persists nothing (Task 4.2).
- Persisting the width keeps keys hand-edited into `statusline.json` during the session (Task 4.4).
- The dashboard Save is enabled after only flipping Sidebar mode (`configsEqual`, Task 4.4).
- A toggle hide survives `session_tree` and `/statusline` saves that do not change `sidebarEnabled`. A toggle _show_ while `sidebarEnabled` is false also starts Workspace Pulse when the layout needs it (Task 4.4).
- `toggleShortcut: "shift+ctrl+r"` is caught as the resize key (modifier order does not matter) (Task 4.4).

### Task 4.1: Config keys

**Files:**

- Modify: `src/shared/types.ts` (`PiStatusConfig` ~234)
- Modify: `src/core/config.ts`: `DEFAULT_CONFIG` (~42), `cloneDefaultConfig` (~54), `normalizeConfig` (~256), `saveConfig` (~339)
- Test: `tests/core/config.test.ts`
- Fix fixtures (typecheck): every test file that builds a full `PiStatusConfig` literal. At `58154b2` these are `tests/core/{sidebar-layout,runtime-state,config,resolve-footer}.test.ts`, `tests/tui/{sidebar-render,dashboard-state,dashboard-render,dashboard,sidebar}.test.ts`, and `tests/index-{sidebar-layout,save}.test.ts`. Find them with `rg -l "completionNotifications: false" tests`.

**Interfaces:**

- Produces:

```ts
// src/shared/types.ts
export type SidebarMode = "manual" | "auto";
// PiStatusConfig gains: sidebarMode: SidebarMode; sidebarWidth: number; toggleShortcut: string;
```

Defaults are `"manual"`, `DEFAULT_SIDEBAR_WIDTH` (44) and `""`. `config.ts` imports `DEFAULT_SIDEBAR_WIDTH`, `MIN_SIDEBAR_WIDTH` and `MAX_SIDEBAR_WIDTH` from `src/tui/split-pane.ts`. `src/core` already imports from `src/tui` (`resolve-footer.ts`), so this follows existing layering.

- [ ] **Step 1: Write the failing tests** (through a JSON file or a store, like the existing normalization tests)

- `it("defaults sidebarMode, sidebarWidth and toggleShortcut")`: no file → `"manual"`, `44`, `""`. Also an existing file that lacks the keys → same.
- `it.each([["auto","auto"],["manual","manual"],["AUTO","manual"],[1,"manual"],[null,"manual"]])("normalizes sidebarMode %j")`.
- `it.each([[50,50],[28,28],[72,72],[10,28],[500,72],[50.5,44],["50",44],[true,44],[null,44]])("normalizes sidebarWidth %j")`. JSON cannot carry `NaN`, so it is not a case.
- `it.each([[" Ctrl+Shift+B ","ctrl+shift+b"],["",""],["   ",""],[5,""],[null,""]])("normalizes toggleShortcut %j")`.
- `it("persists the three keys through saveConfig")`: save `{ ...loaded, sidebarMode: "auto", sidebarWidth: 50, toggleShortcut: "ctrl+shift+b" }`, then reload → equal.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/core/config.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

Normalization:

- `sidebarMode`: `"auto"` only for the exact string, otherwise `"manual"`.
- `sidebarWidth`: when `Number.isInteger(v)`, clamp to 28..72; anything else → 44. _(Builder's call, kept: clamp out-of-range integers, default everything else.)_
- `toggleShortcut`: when it is a string, `trim().toLowerCase()`; otherwise `""`.

Add the three keys to `DEFAULT_CONFIG`, `cloneDefaultConfig`, `normalizeConfig` and the `next` object in `saveConfig`. `saveConfig` passes the values through as given; callers hold normalized config.

Add the three default values to each fixture listed above. Update any full-object `toEqual` expectation on `loadConfig`/`saveConfig` output in `config.test.ts` that now misses the keys.

- [ ] **Step 4: Run tests and full check**

Run: `pnpm test tests/core/config.test.ts && pnpm check`. Expected: PASS. `pnpm check` catches fixtures that were missed.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/core/config.ts tests/
git commit -m "feat: add sidebarMode, sidebarWidth and toggleShortcut config"
```

### Task 4.2: Split-pane auto mode and resize commit

**Files:**

- Modify: `src/tui/split-pane.ts`: options (~38), controller interface (~53), `visibleAt` (~142), `stopResize` (~156), `wrappedRender` (~189), `show` (~264), `beginResize` (~286)
- Test: `tests/tui/split-pane.test.ts` (uses `harness(columns)` ~13 and `resizeHarness` ~30. Change width with `(h.tui.terminal as { columns: number }).columns = n`, as at ~655.)

**Interfaces:**

- Consumes: `SidebarMode` (Task 4.1).
- Produces:

```ts
export const AUTO_MAIN_WIDTH = 80;
export const AUTO_REOPEN_MARGIN = 8;
export function autoSidebarVisible(
  terminalWidth: number,
  sidebarWidth: number,
  wasVisible: boolean,
): boolean;
// SplitPaneControllerOptions gains: mode?: SidebarMode; onResizeCommit?(width: number): void;
// SplitPaneController gains: setMode(mode: SidebarMode): void; getMode(): SidebarMode;
```

- [ ] **Step 1: Write the failing tests**

- `it.each([[124,true,true],[123,true,false],[131,false,false],[132,false,true]])("autoSidebarVisible(%i, 44, was=%p) → %p")`.
- `it("collapses and reopens with the hysteresis gap in auto mode")`: `harness(124)`, `mode: "auto"`, show, attach.
  - Render at 124 → base width 80 (reserved 44).
  - 123 → base 123.
  - 131 → base 131.
  - 132 → base 88.
- `it("keeps manual mode at the existing 92-column threshold")`: default mode, 92 visible, 91 hidden (the existing ~655 test may already cover this; extend it rather than duplicating).
- `it("stays hidden in auto mode after hide even when the terminal grows")`: hide, set 200, render → base 200.
- `it("resets the hysteresis state on a mode switch and on show")`: in auto, render at 123 then 125 → collapsed. `setMode("manual")`, `setMode("auto")`, render at 125 → visible. Do the same with `hide()` then `show()`.
- `it("setMode with the current mode is a no-op")`: collapsed in auto at 125, then `setMode("auto")` and render → still collapsed. An active resize is not cancelled.
- `it("setMode cancels an active resize and restores the width")`.
- `it("beginResize refuses in auto mode")`: returns `false`, does not subscribe input, and calls `onWarning` once.
- `it("fires onResizeCommit with the width on Enter after a change")`: `resizeHarness(120)`, `left` ×3, `enter` → called once with 47.
- `it("fires onResizeCommit on mouse release after a drag that changed the width")`.
- `it("does not fire onResizeCommit when Enter confirms an unchanged width")`.
- `it("does not fire onResizeCommit on Escape, on hide, on dispose, or on a release without a drag")`.
- `it("does not fire onResizeCommit when a terminal shrink cancels the resize")`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/tui/split-pane.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

- `autoSidebarVisible`: `wasVisible ? tw >= AUTO_MAIN_WIDTH + sw : tw >= AUTO_MAIN_WIDTH + sw + AUTO_REOPEN_MARGIN`.
- State: `mode` (from options, default `"manual"`) and `autoVisible = true`.
- At the top of `wrappedRender`, when `enabled && mode === "auto" && Number.isFinite(terminalWidth)`: `autoVisible = autoSidebarVisible(terminalWidth, sidebarWidth, autoVisible)`.
- `visibleAt(tw)`: `enabled && Number.isFinite(tw) && tw >= minimumMain + minimumSidebar && (mode !== "auto" || autoVisible)`. Add a comment: in auto mode this reports the state from the last render.
- `show()`: set `autoVisible = true` before `enabled = true`.
- `setMode(next)`: return if disposed or `next === mode`; `stopResize(true)`; `mode = next`; `autoVisible = true`; `requestRender()`. `getMode: () => mode`.
- `beginResize()`: when `mode === "auto"`, call `options.onWarning?.("Sidebar resize is off in auto mode")` and return `false` before the other checks. This keeps the split pane safe on its own. The extension shows its friendlier notice first (Task 4.4).
- `stopResize(restore)`: capture `const commit = !restore && resizing && sidebarWidth !== resizeStartWidth` before resetting state. Then, after `onResizeChange(false)`, run `if (commit) safely(() => options.onResizeCommit?.(sidebarWidth))`.

  Why compare to `resizeStartWidth`: `beginResize` sets `sidebarWidth` to the _effective_ width, which a narrow terminal may clamp below the preferred width. Committing on an unchanged Enter would save a terminal-clamped width, and the spec says terminal resizes never change the saved width. (Atelier does the same, `split-pane.ts:519`.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test tests/tui/split-pane.test.ts`. Expected: PASS, including all existing tests.

- [ ] **Step 5: Commit**

```bash
git add src/tui/split-pane.ts tests/tui/split-pane.test.ts
git commit -m "feat: add auto sidebar mode and resize commit to split pane"
```

### Task 4.3: Sidebar controller plumbing

**Files:**

- Modify: `src/tui/sidebar.ts`: options (~18), interface (~28), `createSplitPaneController` call (~47)
- Test: `tests/tui/sidebar.test.ts` (`makeFakeHost(columns)` ~98, `makeCtx` ~115)

**Interfaces:**

- Consumes: Task 4.2.
- Produces: `SidebarControllerOptions` gains `sidebarMode?: SidebarMode; sidebarWidth?: number; onResizeCommit?(width: number): void`. `SidebarController` gains `setMode(mode: SidebarMode): void`.

- [ ] **Step 1: Write the failing tests**

- `it("starts at the configured sidebarWidth")`: `sidebarWidth: 50` at 200 columns → `getEffectiveWidth() === 50`.
- `it("applies sidebarMode and setMode to the split pane")`: `sidebarMode: "auto"`, width 44, 123 columns, render once → `isEffectivelyVisible() === false`. Then `setMode("manual")` and render → `true`.
- `it("forwards resize commits")`: begin resize, then drive `left` and `enter` through the captured `onTerminalInput` handler → `onResizeCommit` called with 45.

- [ ] **Step 2: Run, implement, run**

Run: `pnpm test tests/tui/sidebar.test.ts`. Expected: FAIL.

Implement:

- Pass `defaultSidebarWidth: options.sidebarWidth`, `mode: options.sidebarMode` and `onResizeCommit: options.onResizeCommit` to `createSplitPaneController`. Spread each conditionally, as `onWarning`/`onError` are, to satisfy `exactOptionalPropertyTypes`.
- `setMode: (m) => safely(() => split.setMode(m))`.

Re-run. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/tui/sidebar.ts tests/tui/sidebar.test.ts
git commit -m "feat: pass sidebar mode and width through the sidebar controller"
```

### Task 4.4: Extension wiring, Settings row, toggle key

**Files:**

- Modify: `src/index.ts`:
  - `registerShortcut("ctrl+shift+r")` (~148)
  - `saveAndApplyConfig` commit (~176)
  - `syncWorkspacePulse` (~316)
  - `applySurfaceVisibility` (~345)
  - `session_start` (~488, controller creation ~524)
- Modify: `src/tui/dashboard-state.ts`:
  - row union (~83)
  - `configsEqual` (~227)
  - settings rows (~419)
  - `adjust` handler (`color_preset` ~751)
  - activation (~817)
- Modify: `src/tui/dashboard-render.ts` (~312)
- Create: `tests/index-sidebar-mode.test.ts`
- Test: `tests/tui/dashboard-state.test.ts`, `tests/tui/dashboard-render.test.ts`
- Fix (row indices shift): `tests/index-save.test.ts` (~174–183, ~236–243) and `tests/tui/dashboard.test.ts` (~790–796). They step through Settings with hard-coded `↓` counts. Switch them to the existing `moveToSettingsRow` helper (`index-save.test.ts:32`), or add one `↓`, and fix the row-number comments.

**Interfaces:**

- Consumes: Tasks 4.1–4.3.
- Produces (closure state in `createExtension`):
  - `sidebarVisibilityOverride: boolean | undefined`. It resets at `session_start`, and on a `/statusline` save whose `sidebarEnabled` differs from the previous config. _(Builder's call, kept: the toggle is a session override of `sidebarEnabled`.)_
  - `toggleShortcutWarning: string | undefined` and `toggleShortcutWarned = false`. The warning is notified once, at the first TUI `session_start` of this extension instance. `/reload` creates a new instance, so a bad key warns again after reload, which is intended.
  - `persistSidebarWidth(ctx, width): void`.
  - Settings row `{ type: "sidebar_mode" }`.
  - Exported pure helper `sameKeyId(a: string, b: string): boolean` in `src/index.ts`, or a small `src/core/shortcuts.ts` if the builder prefers. It is modifier-order-insensitive, ported from atelier's `keyIdentity`.

- [ ] **Step 1: Write the failing extension tests** (`tests/index-sidebar-mode.test.ts`)

Harness: use `buildPiWithHandlers`/`createContext` from `tests/helpers.ts`, and a temp `PI_CODING_AGENT_DIR` via `vi.stubEnv` (as in `tests/index.test.ts:16`). Write `statusline.json` before importing `src/index.ts`.

Mock `../src/tui/sidebar.ts` with `vi.doMock` and `vi.resetModules()` (the pattern `tests/index-sidebar-layout.test.ts` uses for `config.ts`). The fake `createSidebarController` records its options and returns a controller with spies:

- `setShown`, `setMode`, `beginResize`, `requestRender`, `show`, `dispose`;
- `isShown`, `isSupported` and `isEffectivelyVisible`, backed by mutable flags.

To capture shortcut handlers, wrap `pi.registerShortcut` in a `vi.fn` that stores `{ key, handler }`. The helper's version drops the handler.

- `it("shows an info notice and does not begin a resize in auto mode")`: config `sidebarMode: "auto"`. Invoke the `ctrl+shift+r` handler with the session ctx → `notify(expect.stringContaining("auto"), "info")`, and `beginResize` is not called.
- `it("passes sidebarMode and sidebarWidth to the controller")`.
- `it("persists sidebarWidth as a patch when a resize is committed")`: file has `sidebarWidth: 44`. _After_ `session_start`, hand-edit the file to add `"toggleShortcut": "ctrl+shift+b"`, then call the captured `onResizeCommit(50)`. Expect:
  - the file has `sidebarWidth: 50` and still has `toggleShortcut: "ctrl+shift+b"`;
  - `runtimeState` has width 50, so a second `onResizeCommit(50)` does not write. Check with mtime or a spy on `saveConfig` via `vi.doMock`.
- `it("does not write the file when the committed width equals the saved width")`.
- `it("reports a warning when persisting the width fails")`: replace the file with `not json` after `session_start` → `notify(expect.stringContaining("sidebar width"), "warning")`.
- `it("ignores a resize commit from a stale session")`: run `session_start` again with a new session manager, then call the _first_ controller's `onResizeCommit` → no write.
- `it("registers the toggle shortcut from config once at load")`: `toggleShortcut: "ctrl+shift+b"` → shortcuts registered are exactly `["ctrl+shift+r", "ctrl+shift+b"]`.
- `it("ignores an empty toggleShortcut silently")`: only `ctrl+shift+r`, no warning at `session_start`.
- `it.each(["ctrl+shift+r", "shift+ctrl+r"])("rejects %s as toggleShortcut with one warning at the first session_start")`: not registered. Warn once, and do not warn again on a second `session_start`.
- `it("warns once when registering the toggle shortcut throws")`: `registerShortcut` throws for that key only. The extension still loads, and `ctrl+shift+r` is still registered.
- `it("toggle is a no-op with an info notice when the sidebar cannot display")`: (a) rpc ctx; (b) TUI ctx whose controller reports `isSupported() === false`. In both, `setShown` is not called by the handler.
- `it("toggle flips visibility via setShown and survives session_tree and unrelated /statusline saves")`. Drive the save through `getRegisteredCommand(...,"statusline")` and the real dashboard, or call the commit path directly. Choose whichever existing `index-save.test.ts` pattern is cheaper.
- `it("a /statusline save that changes sidebarEnabled clears the toggle override")`.
- `it("toggle show starts Workspace Pulse when sidebarEnabled is false but the layout needs it")`. Alternatively, assert this at the `syncWorkspacePulse` level, using the trusted-project setup in `tests/index-workspace-pulse.test.ts`.

- [ ] **Step 2: Write the failing dashboard tests**

- `dashboard-state.test.ts`:
  - update `"lists surface toggles before completion notifications and Save"` (~276) to expect `sidebar_mode` after `sidebar_enabled`;
  - `it("activating sidebar_mode flips manual ↔ auto in the draft only")`;
  - `it("left/right on sidebar_mode flips the mode")`;
  - `it("a sidebarMode-only change makes the draft dirty")` (via `configsEqual` or the dirty/save-enabled selector at ~258).
- `dashboard-render.test.ts`: `it("renders the Sidebar mode row with Manual/Auto")`.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test tests/index-sidebar-mode.test.ts tests/tui/dashboard-state.test.ts tests/tui/dashboard-render.test.ts`. Expected: FAIL.

- [ ] **Step 4: Implement**

**`ctrl+shift+r` handler:** after the session guards and before the visibility check, when `runtimeState.snapshot().config.sidebarMode === "auto"`, notify `"Sidebar resize is off in auto mode. Set Sidebar mode to Manual in /statusline Settings."` as `"info"` and return.

**Toggle registration at load,** from `runtimeState.snapshot().config.toggleShortcut`:

- `""` → skip.
- `sameKeyId(key, "ctrl+shift+r")` → `toggleShortcutWarning = 'toggleShortcut "<key>" is reserved for sidebar resize and was ignored'`.
- Otherwise:

  ```ts
  try {
    pi.registerShortcut(key as KeyId, {
      description: "Show or hide the pi-status sidebar",
      handler: toggleSidebar,
    });
  } catch (e) {
    toggleShortcutWarning = `Could not register toggleShortcut "${key}": ${message}`;
  }
  ```

  Import `KeyId` as a type from `@earendil-works/pi-tui`. Pi reports keys that collide with its own bindings itself (see "Pi 1.5.2 facts").

**`toggleSidebar(ctx)`:**

1. Apply the same session guards as the resize handler.
2. When `ctx.mode !== "tui"`, or there is no controller, or `!controller.isSupported()`: notify `"pi-status sidebar cannot be shown here"` as `"info"` and return.
3. Otherwise:
   - `sidebarVisibilityOverride = !controller.isShown()`;
   - `closeActiveDashboard()`;
   - `controller.setShown(sidebarVisibilityOverride)`;
   - `syncWorkspacePulse(config)`;
   - `controller.requestRender()`.

**`syncWorkspacePulse`:** change `const sidebarDemand = config.sidebarEnabled && sidebarWorkspaceDemand()` to `const sidebarDemand = sidebarWorkspaceDemand()`. `sidebarWorkspaceDemand` already requires `controller.isShown()`, and visibility is now `override ?? sidebarEnabled`. Without an override nothing changes, because a disabled sidebar is never shown.

**Controller creation:** the `createSidebarController` call gets `sidebarMode: config.sidebarMode`, `sidebarWidth: config.sidebarWidth`, and `onResizeCommit: (width) => persistSidebarWidth(ctx, width)`.

**`persistSidebarWidth(ctx, width)`:**

1. Return if `ctx.sessionManager !== activeTuiSessionManager` (stale session).
2. Return if `width === runtimeState.snapshot().config.sidebarWidth`.
3. Write a one-key patch of the _current file_: `saveConfig({ ...loadConfig(), sidebarWidth: width })`. This keeps known keys hand-edited since load, such as a new `toggleShortcut`. Unknown keys are dropped, as every `saveConfig` already does.
4. Then `runtimeState.update({ type: "config_reload", config: { ...runtimeState.snapshot().config, sidebarWidth: width } })`. Only the width changes in memory; other file edits wait for `/reload`, as today.
5. On a throw, notify `Could not save sidebar width: <message>` as `"warning"`. `loadConfig` returns defaults for a malformed file, and `saveConfig` then refuses to overwrite it, so the warning path covers that case.

**`saveAndApplyConfig` commit:** before `applySurfaceVisibility`, `if (current.config.sidebarEnabled !== committed.sidebarEnabled) sidebarVisibilityOverride = undefined`.

**`applySurfaceVisibility`:** `activeSidebarController?.setMode(config.sidebarMode)`, then `activeSidebarController?.setShown(sidebarVisibilityOverride ?? config.sidebarEnabled)`. `applySurfaceVisibility` runs on every `session_tree` and save. That is safe because `split.setMode` returns early for an unchanged mode (Task 4.2), so hysteresis and an active resize are untouched.

**`session_start`:** set `sidebarVisibilityOverride = undefined` before `applySurfaceVisibility`. In TUI mode, if `toggleShortcutWarning && !toggleShortcutWarned`, notify it as `"warning"` and set the flag.

**Dashboard:**

- Add `| { type: "sidebar_mode" }`, and add it to the settings rows after `sidebar_enabled`, always shown.
- `configsEqual`: add `left.sidebarMode === right.sidebarMode`.
- Activation: flip `draft.sidebarMode`.
- `adjust`: handle `sidebar_mode` beside `color_preset`, by flipping the mode.
- Render: `pushSelectable("↔", "Sidebar mode", state.draft.sidebarMode === "auto" ? "Auto" : "Manual")`.
- Fix the hard-coded Settings navigation in `tests/index-save.test.ts` and `tests/tui/dashboard.test.ts`.

- [ ] **Step 5: Run the tests and full check**

Run: `pnpm test tests/index-sidebar-mode.test.ts tests/tui/dashboard-state.test.ts tests/tui/dashboard-render.test.ts && pnpm check`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts src/tui/dashboard-state.ts src/tui/dashboard-render.ts tests/
git commit -m "feat: wire auto sidebar mode, saved width and toggle shortcut"
```

### Task 4.5: Docs, smoke test, release 0.9.0

**Files:** `README.md` ("Configuration Behavior" ~143, "Sidebar › Width and resize" ~237), `CHANGELOG.md`, `package.json`

- [ ] **Step 1: Document**

README:

- A config table for `sidebarMode`/`sidebarWidth`/`toggleShortcut` with types and defaults. Note that `sidebarWidth` and `toggleShortcut` are file-only.
- The auto thresholds: collapses below `80 + width`, reopens at `≥ 80 + width + 8`. Manual mode keeps the below-92-columns hide.
- Resize is disabled in auto mode.
- A confirmed resize that changes the width becomes the starting width for new sessions. Escape and terminal resizes never change it.
- Toggle changes need `/reload`. The toggle hide/show lasts for the session.
- `ctrl+shift+r` (in any modifier order) cannot be the toggle key.
- Pi skips keys reserved by its own bindings (for example `ctrl+t`, thinking toggle) and reports a diagnostic. Some keys override editor actions (for example `ctrl+b`). Suggest `ctrl+shift+b`.
- The Settings "Sidebar mode" row.

CHANGELOG `## 0.9.0 - <date>`, `### Added`.

- [ ] **Step 2: Manual smoke run in a resizable terminal**

`pi -e ./src/index.ts`:

1. In manual mode, `Ctrl+Shift+R`, resize to 50 and press Enter. `statusline.json` has `"sidebarWidth": 50`. Restart Pi: the width is 50.
2. `Ctrl+Shift+R`, change the width, then Escape: the width reverts and the file is unchanged. `Ctrl+Shift+R` then Enter with no change: the file is unchanged.
3. Settings → Sidebar mode Auto, then Save. (Save is enabled after only this change.) `Ctrl+Shift+R` shows the auto-mode notice. With width 50:
   - narrow below 130: the sidebar collapses;
   - widen to 137: still collapsed;
   - widen to 138 or more: it reopens.
4. Set `"toggleShortcut": "ctrl+shift+b"` in the file and `/reload`. Then:
   - Ctrl+Shift+B hides the sidebar;
   - widening keeps it hidden;
   - `/statusline` save without touching Sidebar keeps it hidden;
   - Ctrl+Shift+B shows it again.
5. Set `"toggleShortcut": "shift+ctrl+r"` and `/reload`: one warning, and resize still works.

- [ ] **Step 3: Version, release check, commit, PR, tag**

Version `0.9.0`. Run: `pnpm release:check`. Expected: exit 0.

```bash
git add README.md CHANGELOG.md package.json
git commit -m "chore: release v0.9.0"
```

After merge, tag `v0.9.0`.

---

## Revision notes (vs. the previous Phase 4 plan)

1. **Wrong branch name.** The plan named `20261114-auto-sidebar`. The repo already has `20261114-pi-atelier-parity-phase-4-auto-sidebar`, which matches Phases 1–3.
2. **Clamped width could be saved.** `beginResize` sets `sidebarWidth` to the _effective_ width, which the terminal may clamp. The old plan committed on every Enter, so an unchanged Enter in a narrow terminal saved the clamped width. That breaks "terminal resizes never change the saved width". The new plan commits only when the width changed from resize start, like atelier.
3. **Hand edits were overwritten.** `saveConfig({ ...config, sidebarWidth })` rewrote the file from memory. A key added by hand mid-session (for example `toggleShortcut`, just before `/reload`) would be lost on the next resize. The new plan patches one key over a fresh `loadConfig()`, like atelier's `savePatch`.
4. **Save could not be enabled for a mode change.** `configsEqual` (`dashboard-state.ts:227`) did not compare `sidebarMode`, so flipping only Sidebar mode left the draft "clean" and Save disabled.
5. **Toggle show did not start Workspace Pulse.** `syncWorkspacePulse` gated sidebar demand on `config.sidebarEnabled`. A toggle show over `sidebarEnabled: false` would render an empty Workspace panel.
6. **Tests the plan would break, now listed.**
   - Inserting the Settings row shifts hard-coded `↓` navigation in `tests/index-save.test.ts` and `tests/tui/dashboard.test.ts`.
   - New required config keys break 11 test fixture files at typecheck. The old plan pointed at `tests/helpers.ts` `withDefaults`, which builds `FooterRenderInput`, not config.
7. **Smoke key would not work.** `ctrl+t` is Pi's reserved `app.thinking.toggle`, so Pi skips it (`runner.ts:96-117`). The smoke run and examples now use `ctrl+shift+b`.
8. **Shortcut comparison was order-sensitive.** `shift+ctrl+r` and `ctrl+shift+r` match the same key in pi-tui. A plain string compare missed that. Ported atelier's `keyIdentity`.
9. **Untestable cases removed.** `normalizeConfig` is not exported and JSON cannot carry `NaN`. Normalization is now tested through files, with `true` in place of `NaN`.
10. **The split pane enforces auto-mode safety itself.** `beginResize` refuses in auto mode (as atelier does), and `setMode` cancels an active resize. `show()` resets hysteresis (as atelier does), so re-showing in a narrow terminal re-evaluates without the reopen margin.
11. **Stale session commits are ignored.** A commit from a previous session's controller is dropped.
12. **Registration-throw case is theoretical.** In Pi 1.5.2, `registerShortcut` throws only for a stale instance. The try/catch stays as cheap insurance, and its test uses a throwing fake.
13. **Spec deviation, kept.** The spec says an empty `toggleShortcut` is "ignored with a warning". Empty is the default, so it is ignored silently. Only `ctrl+shift+r` warns.
