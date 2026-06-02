# Phase 2: Sectioned Interactive Row Model

## Usable Result

`/statusline` becomes easier to scan by separating status-line items from extension-status controls, while preserving the Phase 1 shell, preview placement, and current save flow.

## Dependencies

- Complete Phase 1 first.

## Public Interface

- Keep `/statusline` command name unchanged.
- Keep persisted `statusLine.segments` and `statusLine.filter` shape unchanged.
- Do not add new segment IDs, settings keys, or command arguments in this phase.
- Keep `Enter` to save and `Esc` to cancel.
- Keep `Left` / `Right` as the reorder keybindings in this phase.

## Implementation

- Refactor the internal list model in `src/statusline-ui.ts` into two projections:
  - an interactive-row list containing only selectable rows
  - a render-row list that wraps those rows with non-interactive headers, divider, and empty-state hint
- Replace implicit segment ordering with one explicit canonical segment-order constant and derive segment metadata from it.
- Render the segment section in this order:
  - enabled segments first, in persisted `config.segments` order
  - disabled segments after that, in canonical segment order
- Render the extension-status section in this order:
  - `New extension statuses` policy row first
  - discovered extension-status rows next, sorted alphabetically
- When `query` is empty, render:
  - `Status line items`
  - segment rows
  - divider
  - `Extension statuses`
  - policy row
  - discovered rows, or a dim hint `No extension statuses discovered yet.` when none exist
- When `query` is non-empty:
  - filter only interactive rows
  - keep their relative ordering unchanged
  - omit section headers, divider, and the empty-state hint
- Make search fuzzy and description-aware:
  - segment rows match on label plus description
  - policy row matches on label plus description
  - discovered extension-status rows match on key plus the generic description text
- Keep selection indexed over the filtered interactive-row list, not the rendered row list.
- Clamp selection whenever the filtered interactive list changes.
- Keep `Up` / `Down` moving through interactive rows only.
- Keep `Space` toggling only the currently selected interactive row.
- Keep current reorder behavior, but make `Left` / `Right` a no-op when:
  - `query` is non-empty
  - the selected row is not a segment row
  - the selected segment is disabled
- Keep the Phase 1 preview block unchanged in this phase:
  - retain the `Preview:` label
  - keep preview rendering from `buildFooterLine(...)`
  - keep the current help text

## Verification

- Test enabled segments render before disabled segments.
- Test enabled segments preserve saved order.
- Test disabled segments preserve canonical metadata order.
- Test empty-query rendering shows both section headers and the divider.
- Test discovered extension-status rows remain alphabetically sorted.
- Test the empty discovered-status state still renders the policy row plus the dim hint.
- Test search filters by description as well as label or key.
- Test search mode omits section headers, divider, and empty-state hint.
- Test the policy row participates in normal search filtering instead of staying forced-visible.
- Test `Up` / `Down` continue to land only on interactive rows after non-interactive rows are introduced.
- Test `Left` / `Right` remain no-ops for disabled segments, discovered-status rows, the policy row, and any non-empty query.
- Keep existing Phase 1 shell, layout, preview, and save/cancel tests passing.
- Run `pnpm test`.

## Completion Criteria

- Users can immediately distinguish status-line items from extension-status controls.
- Search still works with the richer list structure and now matches description text too.
- Section rows improve scanability without changing persisted config or save semantics.

## Assumptions

- The policy row label remains `New extension statuses` in Phase 2.
- A non-empty search with no matches shows an empty list area between the query line and preview.
- Interactive-only selection is internal plumbing required for section rows, not a user-visible keyboard-model change for this phase.
