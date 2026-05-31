# Phase 5: Add Interactive `/statusline`

## Usable Result

Users can configure the full statusline inside Pi without editing JSON.

## Dependency

- Complete Phase 4 first.

## Implementation

- Register `/statusline`.
- Add a custom ordered multi-select picker with live preview.
- Support `Space` to toggle segments.
- Support `Left/Right` to reorder enabled segments.
- Support `Up/Down` to navigate.
- Support fuzzy search.
- Save atomically on `Enter`.
- Discard the draft on `Esc`.
- Disable reorder while search filtering is active.
- Include non-orderable discovered extension-status rows.
- Include a `New extension statuses` toggle.

## Verification

- Test toggle, reorder, navigation, and search behavior.
- Test live-preview updates.
- Test reorder is disabled during search filtering.
- Test atomic save and cancel-without-write.
- Test discovered status rows and the new-status policy.
- Run `pnpm check`.
- Run `pnpm pack --dry-run`.
- Smoke test persistence, terminal resizing, reload behavior, rate limits, and status filtering.

## Completion Criteria

- `/statusline` supports the complete persisted configuration without manual file edits.
- Cancel leaves runtime and disk configuration unchanged.
- Saved configuration survives a Pi restart.

## Deferred Work

- Powerline glyphs
- Multi-row overflow
- Presets
- Cost display
- Tool activity
- Progress estimation
- Provider-general rate-limit compatibility
