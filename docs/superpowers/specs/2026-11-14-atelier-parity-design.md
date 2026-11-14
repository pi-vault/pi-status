# Atelier Parity: Trust, Release Checks, Panel API, Auto Sidebar, Fullscreen Sidebar

Date: 2026-11-14
Status: Draft for approval

## Intent

A side-by-side review of pi-status 0.5.1 against [pi-atelier](https://github.com/michaelmjhhhh/pi-atelier) 0.20.0 found five gaps worth closing:

1. Git runs in untrusted projects (security).
2. No packed-install verification (release safety).
3. Contributed sidebar panels support only plain rows.
4. The sidebar has no auto-collapse mode and does not remember its width.
5. The sidebar is not shown in Pi's fullscreen mode.

The work also starts by moving the development baseline from Pi 0.84.4 to Pi 1.5.2, so later phases build on current Pi APIs.

The work is split into six phases (0–5), ordered from simplest to most complex. **Each phase is atomic: it ships as its own branch, PR, and npm release, and leaves pi-status fully usable.** No phase depends on unreleased work from a later phase.

## Goals

- Close the five gaps above.
- Keep every phase independently releasable and reversible.
- Keep pi-status's own identity: four-zone footer, colour presets, `/statusline` dashboard, pi-usage and Herdr integration.

## Non-goals

These atelier features are deliberately out of scope: changed-file list, prefill progress, subagent cost graph, model/editor controls, layered user/project/session settings.

- No project-level configuration. `statusline.json` stays global (decision from 0.4).
- No retention or display of changed-file paths. The README privacy promise stands.
- No new dashboard tabs.

## Anti-goals (would be failures even if it works)

- Running any Git command in a project Pi has not trusted.
- Changing the default behaviour existing users see without opting in. Specifically: the sidebar must not start auto-collapsing on upgrade.
- Breaking existing panel contributors on the `pi-status:sidebar-panels` channel.
- Leaving Pi's renderer or fullscreen layout root modified after `session_shutdown`, `/reload`, or a render error.

## Constraints

- Development and minimum supported host from Phase 0 onward: `@earendil-works/pi-coding-agent@1.5.2`, `@earendil-works/pi-tui@1.5.2`.
- Dependency bumps take the latest stable version published at least 48 hours earlier, or the second latest if the latest is younger.
- `peerDependencies` stay `"*"` for both Pi packages; the supported minimum is stated in the README and CHANGELOG, not enforced by semver.
- `@pi-vault/pi-usage` stays a regular `dependency`. It is imported at runtime (`src/core/usage-runtime.ts:1-5` loads event-name constants from `@pi-vault/pi-usage/events`). Pi installs extensions with peer resolution disabled (`package-manager.ts:2007-2023`), so moving it to peers would break loading.
- Node engine stays `>=24.15.0`.
- Existing tooling: pnpm, Biome, vitest, TypeScript 7, `pnpm check`, CI workflows `quality.yml` and `release.yml` (tag-triggered `npm publish --provenance`).
- Changes stay surgical: match the existing module layout (`src/core`, `src/tui`, `src/shared`) and test layout (`tests/core`, `tests/tui`, `tests/index-*.test.ts`).
- Every phase updates `CHANGELOG.md` and the README sections it affects.

## Approaches

### Ordering

| Option | Trade-off |
|---|---|
| **Simplest first, with the dependency bump at the front (chosen)** | Each release is small. Release checks land before the risky sidebar work and guard it. Fullscreen follows auto mode so it reuses the width/mode logic. |
| Security fix first, then the bump | Ships the trust fix a few hours sooner, but on Pi 0.84.4, and then it has to be re-verified on 1.5.2. |
| Largest feature first | Front-loads risk with no install-verification safety net. |

### Minimum Pi version

| Option | Trade-off |
|---|---|
| **Require 1.5.2, develop on 1.5.2 (chosen)** | Honest, tested claim. Later phases can use 1.5.2 APIs such as `TUI.setLayoutRoot` and `agent_settled.aborted` directly. Users on Pi 0.84 stay on pi-status 0.5.x. |
| Develop on 1.5.2, claim 0.84.4 | Wider reach, but the claim is untested and every phase needs fallbacks. |
| Develop on the oldest supported version (atelier's model) | Exercises the floor, but contradicts the upgrade goal. |

### Untrusted-project display (Phase 1)

| Option | Trade-off |
|---|---|
| **Muted `Git · untrusted` placeholder (chosen)** | The user sees why there is no data. |
| Hide the segment and panel rows | Quieter, but looks broken. |
| Read the branch from `.git/HEAD` without Git | More data, but adds a hand-rolled parser for marginal value. |

### pi-usage packaging

| Option | Trade-off |
|---|---|
| **Keep as a regular dependency (chosen)** | No code change. Install pulls one small package. |
| Optional peer, inlining event-name constants | Leaner install, but the constants are duplicated and a rename upstream fails silently. |

### Fullscreen sidebar (Phase 5)

| Option | Trade-off |
|---|---|
| **Wrap the fullscreen layout root in an `HStack` via the public `setLayoutRoot()` (chosen)** | Uses Pi's public layout primitives. Reading the existing root still needs the non-public `layoutRoot` field (as atelier does). |
| Keep patching `render()` in fullscreen too | Simple, but the fullscreen renderer computes layout from `layoutRoot`, so a column-reduced `render()` desynchronises hit-testing, selection and scroll. |
| Keep hiding the sidebar in fullscreen | Zero risk, but leaves the gap. |

---

## Phase 0 — Dependency baseline (release 0.6.0)

**Usable result:** pi-status is developed, tested and documented against Pi 1.5.2 with current tooling.

Upgrade (versions verified 2026-11-14, all older than 48 hours):

| Package | From | To |
|---|---|---|
| `@earendil-works/pi-coding-agent` (dev) | ^0.84.4 | ^1.5.2 |
| `@earendil-works/pi-tui` (dev) | ^0.84.4 | ^1.5.2 |
| `@biomejs/biome` | ^2.5.11 | ^2.6.7 (also bump `biome.json` `$schema`) |
| `vitest` | ^4.1.11 | ^5.1.0 (major) |
| `@types/node` | ^26.4.0 | ^26.6.6 |
| `typescript` | ^7.0.2 | unchanged (latest) |
| `@pi-vault/pi-usage` | ^0.7.1 | unchanged (latest), stays in `dependencies` |

- `peerDependencies` unchanged (`"*"`).
- Fix whatever the new Pi types, Biome rules and vitest 5 flag. Known Pi breaking changes between 0.84.4 and 1.5.2 that may touch pi-status:
  - `TurnEndEvent` gained required boundary fields (0.87.0). Test fixtures that construct `turn_end` events may need them.
  - `ExtensionEvent` gained `AgentBeforeSettleEvent` (0.87.0). Exhaustive switches, if any, must handle it.
  - `agent_settled` gained `aborted` (1.0.x). Informational only; no behaviour change in this phase.
  - pi-tui `Editor.render()`/`Input.render()` emit APC cursor markers (1.2.0). Relevant only if pi-status renders those components outside a TUI.
  - Removed `TUI.queryTerminalColorScheme()`/`queryTerminalBackgroundColor()` (0.99.0). Relevant only if pi-status calls them.
- Docs: README "Pi 0.84.4 or newer is required" → 1.5.2. Fix the Upgrade Notes baseline line (currently says 0.84.3). Remove the duplicated `NO_COLOR` sentence in the Colours section. CHANGELOG entry noting that Pi 0.84.x users should stay on pi-status 0.5.x.
- **Done when:** `pnpm release:check` passes and a manual smoke run in Pi 1.5.2 shows the footer, sidebar, `/statusline` and resize working.

## Phase 1 — Trusted-only Git (release 0.6.1)

**Usable result:** pi-status never runs Git in a project Pi has not trusted.

Behaviour:

- At each `session_start`, read `ctx.isProjectTrusted()`.
  - Trust cannot change mid-session: `/trust` saves the decision and asks for a restart.
  - `/reload` re-runs `session_start`, so it picks up a new decision.
- When untrusted, the workspace-pulse runtime is never created or started, so neither `rev-parse` nor `status` runs. This applies even if the `workspace-pulse` segment is configured or the workspace sidebar panel is visible.
- Display when untrusted:
  - Footer `workspace-pulse` segment renders `Git · untrusted` in the muted role.
  - Sidebar `workspace` panel renders the same text in place of the pulse rows.
  - The project name still shows; it comes from `ctx.cwd`, not Git.
- The `git-branch` segment comes from Pi's own `footerData.getGitBranch()`, not from pi-status's Git calls, so it is unchanged.
- Implementation home:
  - Add an `untrusted` value to `WorkspacePulseStatus` (`src/core/workspace-pulse.ts:5-11`), or an equivalent snapshot flag.
  - Gate runtime creation in `installFooter` (`src/index.ts:376`) and `syncWorkspacePulse` (`src/index.ts:307`).
  - Formatters in `src/tui/formatters.ts` and `src/tui/sidebar-segments.ts`.
- RPC/print mode: same gate. Existing RPC tests (`tests/index-workspace-pulse.test.ts`) gain an untrusted case.
- README "Workspace Pulse": document the trust requirement.
- **Done when:**
  - A test with `isProjectTrusted: () => false` proves `execFile` is never called and the placeholder renders.
  - A trusted test proves behaviour is unchanged.

## Phase 2 — Release verification (release 0.7.0)

**Usable result:** every release is proven to pack the right files, install cleanly, and load in the real Pi loader.

- `scripts/verify-pack.mjs`: the `pnpm pack --dry-run --json` file set must equal `package.json` plus tracked files matched by `files`. Model: atelier `scripts/verify-pack.mjs`.
- `scripts/verify-install.mjs`:
  1. Pack the tarball and install it into a temporary consumer directory with `npm install --omit=dev --legacy-peer-deps --no-audit --no-fund`. These are the flags Pi itself uses (`package-manager.ts:2007`), so Pi is not installed into the consumer. *(Builder's call.)*
  2. Assert that the only installed packages are `@pi-vault/pi-status` and `@pi-vault/pi-usage`.
  3. Load the entry through Pi's extension loader from pi-status's own dev dependency, with `PI_CODING_AGENT_DIR` pointed at a temp directory. The loader supplies `@earendil-works/pi-*` to the extension as the real host does, which is what this check proves. *(Builder's call.)*
  4. Assert no load errors and that the `statusline` command is registered.

  Model: atelier `scripts/verify-install.mjs`. The loader is a deep import (`dist/core/extensions/loader.js`); a comment must say it may need updating on Pi upgrades.
- `package.json`:
  - Add `peerDependenciesMeta` marking both Pi peers `optional: true`, so a non-Pi `npm install` never pulls a second Pi.
  - Add `verify:pack` and `verify:install` scripts.
  - Make `release:check` run `check`, then both verify scripts.
- CI: `quality.yml` runs `verify:pack`; `release.yml` runs `release:check` before publish (replacing its separate `pack:dry-run` step).
- **Done when:** both scripts pass locally and in CI, and deliberately adding an untracked file to `src/` makes `verify:pack` fail.

## Phase 3 — Richer panel API (release 0.8.0)

**Usable result:** other extensions can publish aligned label/value rows with optional progress bars, without breaking existing contributors.

Contract (additive to `SidebarPanelContribution`, `src/tui/sidebar-panels.ts:76-81`):

```ts
interface SidebarPanelKeyValue {
  label: string;
  value: string;
  labelRole?: SidebarPanelRole; // default "muted"
  valueRole?: SidebarPanelRole; // default panel role, else "primary"
  progress?: number;            // finite, 0..1 inclusive
}
interface SidebarPanelContribution {
  /* existing fields unchanged; `rows` stays required as the fallback */
  keyValues?: readonly SidebarPanelKeyValue[];
}
```

- Protocol version unchanged. Hosts that do not know `keyValues` ignore it and render `rows`.
- Validation:
  - Labels and values are sanitized with `sanitizeSidebarPanelText`.
  - The list obeys `SIDEBAR_PANEL_MAX_ROWS` and the existing per-row character limits.
  - An empty, malformed or oversized list falls back to `rows`.
  - A `progress` value that is non-finite or outside [0, 1] is dropped; the row is kept.
- Rendering (`src/tui/sidebar-render.ts`):
  - Label left-aligned, value right-aligned at the current panel width.
  - Truncation via `truncateToWidth`.
  - When `progress` is present and at least 4 bar columns fit, a bar is drawn between label and value in the value role. Otherwise the bar is omitted.
  - `NO_COLOR`: plain filled/empty block characters.
- README "Contributing panels": document the fields, defaults, limits and fallback rule with one example.
- **Done when:**
  - Tests cover valid key/values, each fallback case, progress clamping and dropping, narrow widths, and `NO_COLOR`.
  - A rows-only contributor renders byte-identical to 0.7.0.

## Phase 4 — Auto sidebar, saved width, toggle key (release 0.9.0)

**Usable result:** the sidebar can collapse and reopen with terminal width, remembers its width across sessions, and can be toggled from the keyboard.

New config keys in `statusline.json`. All are optional and normalized like existing keys:

| Key | Type | Default | Meaning |
|---|---|---|---|
| `sidebarMode` | `"manual" \| "auto"` | `"manual"` | Auto collapses/reopens with width; manual keeps today's behaviour. |
| `sidebarWidth` | integer 28–72 | 44 | Starting width for new sessions. |
| `toggleShortcut` | key id string | `""` (none) | Shows/hides the sidebar. |

Behaviour:

- **Auto mode:**
  - The sidebar collapses when `terminalWidth < 80 + sidebarWidth`, and reopens only when `terminalWidth >= 80 + sidebarWidth + 8`. The 8-column gap prevents flicker.
  - Manual resize (`Ctrl+Shift+R`) is disabled in auto mode, with an info notice.
- **Manual mode:** unchanged, including the existing below-92-columns hide.
- **Explicit hide wins over auto:** a sidebar hidden with the toggle key stays hidden when the terminal grows. The toggle state is session-scoped.
- **Saving the width:**
  - A confirmed resize (Enter or mouse release) persists `sidebarWidth` to `statusline.json`.
  - Escape restores the previous width and does not persist.
  - Terminal resizes never change the saved width.
- **Toggle key:**
  - `toggleShortcut` is registered once at extension load. Pi cannot unregister shortcuts, so changes need `/reload`.
  - An empty value, or one equal to `ctrl+shift+r`, is ignored with a warning.
  - When the sidebar cannot display (RPC/print, or fullscreen before Phase 5 ships), the key is a no-op that shows a one-line info notice. It does not flip the hidden state, so nothing surprising happens later. *(Builder's call.)*
- Settings tab gains "Sidebar mode" (manual/auto). `sidebarWidth` and `toggleShortcut` are file-only, documented in the README.
- Implementation home:
  - `src/tui/split-pane.ts`: width reconcile and effective width.
  - `src/core/config.ts`: normalization.
  - `src/tui/dashboard-state.ts`: Settings row.
  - `src/index.ts`: shortcut registration and persistence on resize confirm.
- **Done when:**
  - Tests cover the auto collapse/reopen thresholds including the gap, persist-on-confirm, no-persist-on-escape, and toggle-beats-auto.
  - Config normalization tests cover each key's invalid values.
  - A manual smoke test passes in a resizable terminal.

## Phase 5 — Fullscreen sidebar (release 0.10.0)

**Usable result:** the sidebar is visible beside the chat in Pi's fullscreen mode, with the same panels, mode and resize behaviour as regular mode.

- Detection:
  - Replace the private `Symbol.for("@earendil-works/pi-tui/viewport")` check (`src/tui/sidebar.ts:40-43`) with the exported `isViewportTUI(tui)` plus `tui.mode === "fullscreen"`.
  - Regular mode keeps its current render-wrapping path unchanged.
- Fullscreen composition:
  1. Capture the current layout root.
  2. Install `new HStack([main (grow 1, minSize 64), sidebar (basis = width, grow 0, min 28, max 72, visible: per mode/hide state)])` via `tui.setLayoutRoot()`.
  3. On hide, dispose, shutdown or error, restore the original root, but only if the installed root is still ours (owner check, as atelier does).
  4. If Pi or another extension replaces the root later, do not fight it. The sidebar stays absent until one of our own lifecycle points re-wraps: `session_start`, a sidebar show or toggle, or a `/statusline` save. Re-wrapping then wraps whatever root is current. No polling and no per-render checks. *(Builder's call.)*
- Sidebar component: the existing sidebar renderer wrapped as a `Component` that renders at the width the `HStack` gives it.
- Resize in fullscreen:
  - Keyboard resize works as in regular mode.
  - Mouse drag on the divider must not break Pi's text selection or wheel scroll in the main pane. If both cannot be satisfied reliably, ship keyboard-only resize in fullscreen and document it.
- Auto mode (Phase 4) applies in fullscreen using the width the `HStack` reports.
- README "Sidebar": replace "Fullscreen and viewport TUIs do not render the Sidebar" with the new behaviour and any limits.
- **Done when:**
  - Tests with a stub viewport TUI prove root install, restore on dispose, the owner check (no restore if replaced), and the no-stacking guard against a second install.
  - Manual verification in Pi 1.5.2 fullscreen: sidebar visible; transcript scroll and selection still work; `/statusline` overlay still renders above both; `/reload` leaves no stale root.

---

## Per-phase release checklist

1. Branch `YYYYMMDD-<phase-slug>` from `master`.
2. Implement with tests.
3. Update README and CHANGELOG.
4. `pnpm release:check` passes. From Phase 2 on, this includes verify scripts.
5. Bump `package.json` version, PR, merge, tag. `release.yml` publishes.

## Calls made during review

These were settled by the design author, not the user, and are marked *(Builder's call.)* above:

- Phase 2 install flags mirror Pi's own (`--legacy-peer-deps`), and the loader comes from the dev dependency.
- Phase 4 toggle key is a no-op with a notice when the sidebar cannot display.
- Phase 5 re-wraps a replaced fullscreen root only at `session_start`, show/toggle, or `/statusline` save.

## Left to the builder

- Exact module split inside each phase, test names, and fixture shapes.
- Whether `untrusted` is a new status value or a separate snapshot flag (Phase 1).
- Bar glyphs and minimum label/value column widths (Phase 3), within the stated rules.
- How the sidebar `Component` adapter for fullscreen is shaped (Phase 5).
- Wording of notices and README prose.
