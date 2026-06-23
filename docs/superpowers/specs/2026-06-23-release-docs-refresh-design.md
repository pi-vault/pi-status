# 0.3.0 Release Docs Refresh Design

**Goal:** Update `CHANGELOG.md` and `README.md` so the next release accurately reflects all user-visible and contributor-relevant changes shipped since `v0.2.1`, with the release framed as `0.3.0`.

**Motivations:** The current docs no longer match the codebase. Since `v0.2.1`, the extension has changed its supported segment set, extension-status behavior, config shape, runtime compatibility baseline, and internal architecture. The next release needs an upgrade narrative that is accurate for users and informative for contributors.

**Branch:** `20260623-release`

**Depends on:** Existing code already merged on `master` after `v0.2.1`; no new runtime behavior is designed here.

---

## Release Decision

The next version should be **`0.3.0`**, not `0.2.2`.

Reasoning:

- `context-window-size` was removed from the supported segment list.
- `extension-statuses` was removed from the supported segment list.
- Extension statuses now auto-append to the footer instead of being enabled through a segment.
- Persisted config moved from `filter` to `extensionSegments.hidden`.
- The runtime baseline changed to **Node `>=24.15.0`**.
- `@pi-vault/pi-usage` moved to the `0.5.x` line.

Those changes affect real users upgrading from `0.2.1`, even though much of the implementation work was internal refactoring. In a `0.x` package, grouping those compatibility and behavior changes into a minor release is the safest and clearest choice.

---

## Source of Truth For The Docs Refresh

The docs update should be driven by the actual code diff from `v0.2.1..HEAD`, not by commit subjects alone.

Primary evidence files:

- `package.json`
- `src/shared/types.ts`
- `src/core/config.ts`
- `src/core/resolve-footer.ts`
- `src/core/runtime-state.ts`
- `src/index.ts`
- `src/tui/editor.ts`
- `src/tui/editor-state.ts`
- `src/tui/editor-render.ts`
- `src/tui/render.ts`
- `src/tui/formatters.ts`
- `src/tui/render-utils.ts`
- `tests/index.test.ts`
- `tests/core/*.test.ts`
- `tests/tui/*.test.ts`

Secondary evidence:

- `git diff --stat v0.2.1..HEAD`
- the existing screenshots in `docs/assets/`
- the design and plan docs under `docs/superpowers/` when they explain why a shipped change exists

The implementation should avoid documenting internal details that are not visible in the current code or tests.

---

## Changelog Design

`CHANGELOG.md` should gain a new top entry for **`0.3.0`** using the real release date at update time.

### Changelog structure

Use these sections in this order:

1. **Added**
2. **Changed**
3. **Removed**
4. **Fixed**
5. **Compatibility**
6. **Internal**

This keeps the top of the entry user-facing while still preserving contributor signal.

### Required `0.3.0` content

#### Added

- Runtime state machine to centralize session/config/thinking-level state transitions.
- Pure editor reducer and extracted editor renderer to simplify `/statusline` behavior and testability.
- Segment formatter registry and shared render utilities.
- Settings-store seam for config loading/saving tests.

#### Changed

- Extension statuses now auto-append to the footer when visible instead of requiring a dedicated footer segment.
- `/statusline` now operates against the refactored editor state/render pipeline.
- Footer rendering now resolves segment decisions before final line assembly.
- Reasoning, context, and usage segments now use richer colorized rendering.

#### Removed

- `context-window-size` segment.
- `extension-statuses` segment.
- Legacy extension filter modes in favor of hidden-per-key extension status visibility.

#### Fixed

- Extension status discovery and rendering regressions.
- Footer lifecycle issues across session shutdown/start.
- Footer restoration around `/statusline` editor entry and exit.
- Re-render behavior for async usage updates and branch/status changes.

#### Compatibility

- Node requirement raised to `>=24.15.0`.
- Tested host baseline updated to `@earendil-works/pi-coding-agent@0.79.10` and `@earendil-works/pi-tui@0.79.10`.
- `@pi-vault/pi-usage` dependency updated to `^0.5.0`.

#### Internal

- Snapshot/render flow renamed and split into smaller units.
- Test suite reorganized by domain (`core`, `tui`, top-level wiring).
- Config persistence code extracted behind a store interface.

### Changelog writing rules

- Prefer upgrade-relevant behavior over implementation narration.
- Do not list every refactor commit separately.
- Do not claim a change is user-visible unless it is observable in current code or tests.
- Keep each bullet single-purpose and concrete.

---

## README Design

`README.md` should be rewritten as a two-layer document:

1. **User-facing usage guide first**
2. **Contributor-facing architecture and development guide second**

The user should understand how to install, use, upgrade, and troubleshoot the extension before they encounter internal design details.

### README structure

#### 1. Title and value proposition

Keep the package name and badges, then describe the extension in one paragraph:

- it replaces Pi’s default footer with a compact configurable status line
- it adds `/statusline` for interactive configuration
- it supports usage-backed segments through `@pi-vault/pi-usage`

#### 2. Screenshots

Keep the two existing screenshots:

- live footer rendering
- `/statusline` interactive editor

#### 3. Install, upgrade, and reload

Include:

- install command for `@pi-vault/pi-status`
- optional install command for `@pi-vault/pi-usage`
- reload step after install or upgrade

This section should explicitly say that usage-limit segments only work when `pi-usage` is installed and responding.

#### 4. Quick start

Explain what happens immediately after install:

- default footer appears automatically
- `/statusline` opens the editor
- changes persist across sessions
- the footer is temporarily hidden while editing

#### 5. Available segments

Document only the current supported segment IDs:

- `model`
- `model-with-reasoning`
- `project-name`
- `current-dir`
- `git-branch`
- `run-state`
- `context-remaining`
- `context-used`
- `used-tokens`
- `total-input-tokens`
- `total-output-tokens`
- `session-id`
- `five-hour-limit`
- `weekly-limit`

Do **not** mention `context-window-size` or `extension-statuses` as available segments.

#### 6. Extension status behavior

Explain the current model clearly:

- extension statuses are appended automatically when visible
- `/statusline` lets users hide individual status keys
- hidden keys stay hidden through persisted settings
- if no visible extension statuses remain, nothing is appended

This section should replace older explanations that treated extension statuses as a normal segment.

#### 7. Upgrade notes for `0.2.x` users

This is a required new section.

It should explain:

- configs containing removed segment IDs are normalized by dropping unknown/unsupported entries
- extension status visibility is now controlled by per-key hidden status settings
- project and global `statusLine` settings still merge, with project values overriding global values
- users must satisfy the newer Node/Pi host baseline

#### 8. Common examples

Keep practical footer examples, but make sure they use only supported segments.

Include examples for:

- minimal footer
- session-heavy footer
- usage-aware footer
- footer with auto-appended extension statuses described in prose rather than shown as a segment ID

#### 9. Configuration behavior

Add a short section explaining:

- settings are loaded from global and project Pi settings
- project `statusLine` overrides global `statusLine`
- writes go to project settings when that file already owns `statusLine`, otherwise global settings

This behavior is important enough to document because the config system is now more explicit and tested.

#### 10. Compatibility

Document:

- Node `>=24.15.0`
- Pi host environment with `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui`
- tested baseline versions from `package.json`

#### 11. Contributor architecture overview

Add a contributor-focused section that briefly maps the current structure:

- `src/index.ts` — extension wiring and event registration
- `src/core/config.ts` — config normalization, load/save, settings target selection
- `src/core/resolve-footer.ts` — snapshot derivation and footer decision resolution
- `src/core/runtime-state.ts` — session/runtime state machine
- `src/core/usage-runtime.ts` — usage integration
- `src/tui/editor.ts` — thin editor shell
- `src/tui/editor-state.ts` — editor reducer/state transitions
- `src/tui/editor-render.ts` — editor rendering
- `src/tui/render.ts` — footer assembly and exported rendering helpers
- `src/tui/formatters.ts` and `src/tui/render-utils.ts` — segment formatting helpers

This section should explain responsibilities, not reprint code.

#### 12. Development and verification

Keep the existing development commands, and ensure they match `package.json`:

- `pnpm install`
- `pnpm check`
- `pnpm run pack:dry-run`

Also mention that tests are organized under:

- `tests/index.test.ts`
- `tests/core/`
- `tests/tui/`

#### 13. License

Keep `MIT`.

---

## Non-Goals

This docs refresh should not:

- change runtime behavior
- add new footer segments
- add new commands
- change the persisted config format again
- perform unrelated code refactors just because the README now explains the architecture better

---

## Error-Handling And Accuracy Rules

The implementation should treat documentation accuracy as the main failure mode.

Specific rules:

- If a README statement cannot be backed by current code or tests, remove or weaken it.
- If a change is internal-only, keep it out of user-facing sections and move it to `Internal` or contributor notes.
- If release dating is unknown at spec time, the implementation should use the actual release date when editing the changelog entry rather than leaving a placeholder.
- If examples become stale during editing, prefer fewer examples over inaccurate ones.

---

## Verification

Before considering the docs update complete, verify:

1. `CHANGELOG.md` reflects all meaningful upgrade-facing changes from `v0.2.1..HEAD`.
2. `README.md` segment lists match `src/shared/types.ts`.
3. README compatibility text matches `package.json`.
4. README `/statusline` behavior matches `src/index.ts`, `src/tui/editor.ts`, and `tests/index.test.ts`.
5. README config persistence text matches `src/core/config.ts` and its tests.
6. README screenshots point to real files in `docs/assets/`.
7. No removed segment IDs remain documented as supported.

---

## Expected Outcome

After implementation:

- the next release is clearly framed as `0.3.0`
- users can upgrade from `0.2.x` without guessing what changed
- the README works as both a usage guide and a contributor orientation document
- the changelog tells a truthful release story derived from the codebase, not from scattered branch history
