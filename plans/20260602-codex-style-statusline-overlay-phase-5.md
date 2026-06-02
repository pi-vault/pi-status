# Phase 5: Hide The Live Footer While `/statusline` Is Open

## Usable Result

When `/statusline` is open inline, the editor keeps its own bottom preview line, but the real session footer is hidden so the UI shows only one statusline at a time.

## Dependencies

- Complete Phase 4 first.

## Public Interface

- No config, persisted-shape, command-name, or keybinding changes in this phase.
- No new settings, segment IDs, theme interfaces, or editor modes.
- `/statusline` behavior changes only while the editor is open:
  - keep the editor preview line visible
  - hide the installed live footer for the duration of the custom UI
  - restore the live footer immediately after the custom UI closes

## Implementation

- Treat this as a narrow runtime lifecycle fix, not a layout redesign.
- Keep `createStatuslineEditor(...)` unchanged as the `/statusline` UI entrypoint.
- Keep `installFooter(ctx)` in `src/index.ts` as the single source of truth for the live `pi-status` footer.
- Add a private empty-footer component or factory in `src/index.ts` that renders `[]`, has a no-op `invalidate()`, and is used only to suppress footer output entirely.
- Update the `/statusline` command flow in `src/index.ts` to:
  - keep the existing `ctx.hasUI` guard
  - install the empty footer immediately before `await ctx.ui.custom(...)`
  - wrap the `ctx.ui.custom(...)` call in `try/finally`
  - restore the normal `pi-status` footer in `finally` by calling the same footer-install path used on session start
- Restore the footer unconditionally:
  - after save
  - after cancel
  - if `ctx.ui.custom(...)` throws or rejects
- Do not call `ctx.ui.setFooter(undefined)` during the editor session, because that restores Pi’s built-in footer rather than guaranteeing no footer.
- Do not change preview generation, list rendering, search behavior, section ordering, width handling, or save persistence in this phase.

## Verification

- Keep existing editor, config, render, and footer wiring tests passing.
- Extend `tests/index.test.ts` to cover footer lifecycle around `/statusline`:
  - session start installs the live `pi-status` footer
  - invoking `/statusline` swaps the footer to the empty footer before opening custom UI
  - when the custom UI resolves, the live `pi-status` footer is restored
- Cover both command outcomes:
  - save path restores the footer and still persists settings
  - cancel path restores the footer and does not persist settings
- Add a failure-hardening test:
  - if `ctx.ui.custom(...)` throws, the live footer is still restored
- Keep existing editor preview assertions intact, since the preview line remains part of the editor UI.
- Run `pnpm test`.
- Run `pnpm typecheck`.

## Completion Criteria

- While `/statusline` is open, the bottom runtime footer is not visible.
- The editor still renders its own preview line at the bottom of the picker.
- Closing `/statusline` restores the normal live footer immediately.
- Save, cancel, and persisted-config behavior remain unchanged aside from temporary footer suppression during the editor session.

## Assumptions

- The “actual statusline” to hide is this extension’s installed footer, not the editor preview line.
- Pi’s `ctx.ui.custom()` replaces only the editor surface, so footer suppression must be handled explicitly by the extension.
- An empty footer is the correct suppression mechanism; restoring the built-in footer is not acceptable while `/statusline` is open.
