# Phase 1: Codex-Style Shell And Descriptions

## Usable Result

`/statusline` keeps its current behavior, but the overlay becomes more legible and Codex-like with a title, subtitle, visible search bar, and descriptions beside each row.

## Dependencies

- None.

## Public Interface

- Keep `/statusline` as the only entrypoint.
- Keep persisted config unchanged:

```json
{
  "statusLine": {
    "segments": ["model-with-reasoning", "current-dir"],
    "filter": { "mode": "all", "hidden": [] }
  }
}
```

- Do not add any new top-level settings or toggles in this phase.

## Implementation

- Keep the current overlay state model in `src/statusline-ui.ts`:
  - segment rows
  - discovered extension-status rows
  - `New extension statuses` policy row
- Keep current save/cancel behavior:
  - `Enter` saves
  - `Esc` cancels
- Keep current navigation and toggle semantics:
  - `Up` / `Down` move selection
  - `Space` toggles current row
  - preserve current reorder behavior in this phase
- Replace the current header text with a Codex-style shell:
  - title: `Configure Status Line`
  - subtitle: `Select which items to display in the status line.`
  - blank spacer
  - visible search placeholder line: `Type to search`
  - visible query input line: `> {query}`
- Add static metadata for each known segment row:
  - display label
  - one-line description
- Use generic descriptions for non-segment rows:
  - discovered extension status rows: `Show or hide this extension status when extension-statuses is enabled.`
  - policy row: `Whether newly discovered extension statuses are shown by default.`
- Render each row with:
  - cursor marker
  - checkbox state
  - label column
  - description column
- Keep the current row ordering and current preview behavior in this phase, even if the preview placement is not yet final.
- Keep the visible search query wired to the existing filter behavior instead of redesigning filtering yet.

## Verification

- Test title, subtitle, and visible search bar rendering.
- Test query input updates from printable characters and `Backspace`.
- Test segment descriptions render beside each known segment row.
- Test generic descriptions render for discovered extension-status rows and the policy row.
- Test current toggle, navigation, save, and cancel behavior remains unchanged.
- Test live preview still updates from draft state after toggles.
- Run `pnpm test`.

## Completion Criteria

- The overlay visibly resembles the Codex setup UI at the top level.
- Users can still complete the same `/statusline` tasks as before without relearning core behavior.
- Every selectable row has a readable description.
