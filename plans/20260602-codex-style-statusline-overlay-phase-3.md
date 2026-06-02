# Phase 3: Keyboard Model And Bottom Preview

## Usable Result

`/statusline` now behaves like the intended Codex-inspired picker, with explicit search input, `Ctrl+Up` / `Ctrl+Down` segment reordering, and a bottom live preview.

## Dependencies

- Complete Phase 2 first.

## Public Interface

- Keep `/statusline` and persisted config unchanged.
- Keep draft-only editing semantics:
  - `Enter` saves
  - `Esc` discards

## Implementation

- Switch segment reordering from the current behavior to:
  - `Ctrl+Up` to move the current enabled segment earlier
  - `Ctrl+Down` to move the current enabled segment later
- Remove the old reorder keybinding path once the new one is implemented.
- Define cursor traversal over interactive rows only:
  - skip section headers
  - skip divider rows
  - skip empty-state hint rows
- Keep `Up` / `Down` movement on the filtered interactive list.
- Disable reorder when:
  - `query` is non-empty
  - current row is not a segment row
  - current segment is disabled
- Keep visible search semantics explicit:
  - printable ASCII appends to `query`
  - `Backspace` removes one character
  - matching stays fuzzy over both label and description
- Move the live preview to the bottom of the overlay.
- Remove the separate `Preview:` label.
- Render the preview line itself as the footer preview for the picker.
- Keep preview sourced from the current draft config via `buildFooterLine(...)`.
- Update preview on every draft-affecting interaction:
  - toggle
  - reorder
  - query edit
  - cursor move when it changes visible draft state

## Verification

- Test `Ctrl+Up` / `Ctrl+Down` reorders enabled segment rows correctly.
- Test reorder is ignored for disabled segments and non-segment rows.
- Test reorder is ignored while a search query is active.
- Test cursor movement skips section headers, divider rows, and empty hints.
- Test `Enter` persists the current draft and `Esc` leaves runtime config unchanged.
- Test preview renders at the bottom from draft state.
- Test preview updates after toggles, reorders, and query edits.
- Run `pnpm test`.

## Completion Criteria

- The overlay interaction model matches the intended final picker behavior.
- Search, reorder, and preview no longer compete or conflict.
- Users can configure the status line without hidden or ambiguous controls.
