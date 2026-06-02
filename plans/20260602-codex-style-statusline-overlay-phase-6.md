# Phase 6: Live Pi-Theme Sync For `/statusline`

## Usable Result

The `/statusline` configuration menu and its bottom preview line stay visually aligned with Pi's active theme, including when Pi changes theme while `/statusline` is already open, and the menu-specific UI code is organized under `src/ui/` in the same general style as `pi-usage`.

## Dependencies

- Complete Phase 5 first.

## Public Interface

- No config, persisted-shape, command-name, keybinding, or menu-flow changes in this phase.
- No new user-facing settings or toggles.
- No changes to `PiStatusConfig`, `StatusLineSegmentId`, footer suppression, search behavior, reordering, or save/cancel behavior.
- Add only internal UI-structure and theme plumbing for the `/statusline` menu:
  - move menu-specific UI modules under `src/ui/`
  - a typed menu theme adapter
  - a passthrough no-theme fallback
  - explicit live theme-sync behavior while the menu is open

## Implementation

- Treat this as a theming, invalidation, and UI-module organization pass, not a layout or interaction refactor.
- Introduce a `src/ui/` namespace for the `/statusline` menu layer so the structure mirrors `pi-usage`'s `src/ui/` organization.
- Move the current editor component from `src/statusline-ui.ts` to `src/ui/statusline-editor.ts`.
- Move the current menu theme adapter from `src/statusline-theme.ts` to `src/ui/statusline-theme.ts`.
- Keep `src/index.ts` responsible for:
  - `/statusline` command registration
  - footer hide/restore lifecycle
  - `ctx.ui.custom(...)` invocation
  - adapting the runtime Pi theme before passing it into the editor
- Keep `src/render.ts` at the top level:
  - it remains shared runtime rendering logic for both the installed footer and the editor preview
  - do not move footer rendering into `src/ui/`
- In `src/ui/statusline-theme.ts`, define a minimal `StatuslineMenuTheme` surface with:
  - `fg(color, text)`
  - `bold(text)`
  - `dim(text)`
- Define a narrow menu color union that matches Pi theme roles actually needed by the menu:
  - `accent`
  - `borderMuted`
  - `dim`
- Widen the internal adapter color support only as far as needed for `buildFooterLine(...)` so the same adapted theme can still render the bottom preview line.
- Export from `src/ui/statusline-theme.ts`:
  - `fromPiTheme(theme)` to adapt Pi's live theme object
  - `noTheme` as a passthrough fallback for tests and incomplete runtime theme objects
- Update `/statusline` command wiring in `src/index.ts` to:
  - inspect the `theme` argument provided by `ctx.ui.custom(...)`
  - use `fromPiTheme(...)` only when `fg` and `bold` are callable
  - otherwise fall back to `noTheme`
- Update `createStatuslineEditor(...)` in `src/ui/statusline-editor.ts` to accept `StatuslineMenuTheme` instead of the current raw theme shape.
- Keep the editor preview rendering path based on `buildFooterLine(...)`, but feed it the same adapted live theme so preview colors stay in sync with the menu.
- Resolve all menu styling at render time from the adapted theme:
  - title: `fg("accent", bold(...))`
  - subtitle: `dim(...)`
  - search placeholder: `dim(...)`
  - row descriptions: `dim(...)`
  - empty-state hint: `dim(...)`
  - help line: `dim(...)`
  - section divider: `fg("borderMuted", ...)`
- Make live theme sync an explicit behavior requirement:
  - while `/statusline` is open, if Pi changes theme, the menu and preview recolor on the next rerender
  - do not pre-bake or retain ANSI-styled strings derived from the old theme across renders
  - keep `invalidate()` sufficient for theme changes, consistent with Pi TUI behavior
- Leave section ordering, search behavior, row toggling, reordering, width handling, persistence, and footer hide/restore behavior unchanged in this phase.

## Verification

- Update all affected imports to the new `src/ui/` module paths.
- Add direct tests for `src/ui/statusline-theme.ts`:
  - `fromPiTheme(...)` delegates `fg`, `bold`, and `dim` correctly
  - `noTheme` returns text unchanged
- Rename or realign the editor test file to match the new module naming:
  - move `tests/statusline-ui.test.ts` to `tests/statusline-editor.test.ts`, or keep the filename and update imports consistently
- Keep the existing theme-spy coverage for the editor and verify:
  - the title is rendered as `fg("accent", bold(...))`
  - divider lines use `borderMuted`
  - descriptions and helper copy use `dim`
  - ANSI-styled output still respects requested visible width
- Keep the live-theme-sync editor test and verify:
  - the editor renders once with one theme variant
  - a changed live theme plus `invalidate()` causes both menu chrome and preview to recolor without reopening `/statusline`
- Extend `tests/index.test.ts` to cover `/statusline` theme adaptation after the file move:
  - a Pi-like theme object is wrapped before the editor is created
  - an incomplete theme object falls back to `noTheme` without throwing
- Keep existing editor interaction, persistence, footer lifecycle, and width-hardening tests passing unchanged.
- Run `pnpm test`.
- Run `pnpm typecheck`.

## Completion Criteria

- Opening `/statusline` with a live Pi theme renders menu chrome through the menu theme adapter instead of raw ad hoc theme access.
- If Pi changes theme while `/statusline` is open, the menu and preview recolor without needing to close and reopen the editor.
- The menu-specific UI code for Phase 6 lives under `src/ui/` rather than top-level `src/`.
- The menu remains usable and visually stable when a full Pi theme is unavailable.
- The preview line, persistence behavior, and footer hide/restore lifecycle behave exactly as they did before this phase.
- Themed ANSI output continues to obey width constraints.

## Assumptions

- Pi's `ctx.ui.custom(...)` theme object is the correct live theme source for the component lifetime, and Pi triggers invalidation plus rerender on theme changes.
- Phase 6 applies only to the `/statusline` configuration menu and its preview line, not to the separately installed session footer outside the editor.
- The `pi-usage` pattern being copied here is organizational: a `src/ui/` folder for UI-specific modules, without forcing all statusline logic into `src/ui/`.
- `src/render.ts` should remain outside `src/ui/` because it is shared runtime rendering logic, not menu-only code.
- `accent`, `borderMuted`, and `dim` are sufficient Pi theme roles for this phase; no broader palette expansion is needed.
- No new “use theme colors” toggle is added.
