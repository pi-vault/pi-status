# Phase 2: Structured Row Model And Sectioned List

## Usable Result

`/statusline` becomes easier to scan by separating status-line items from extension-status filtering, while keeping the same user-visible save and search flow.

## Dependencies

- Complete Phase 1 first.

## Public Interface

- Keep `/statusline` command name and persisted config shape unchanged.
- Do not add new segment IDs or settings keys in this phase.

## Implementation

- Replace the flat row model in `src/statusline-ui.ts` with a richer internal representation:
  - segment row
  - extension-status policy row
  - discovered extension-status row
  - non-interactive section header row
  - non-interactive divider row
  - non-interactive empty-state hint row
- Add stable metadata for known segments:
  - label
  - description
  - canonical disabled-item ordering
- Render enabled segments first in persisted `config.segments` order.
- Render disabled segments after that in stable canonical order.
- When `query` is empty, render two sections:
  - `Status line items`
  - `Extension statuses`
- Render a divider between the sections.
- Render discovered extension-status keys in ascending alphabetical order.
- Keep the `New extension statuses` policy row at the top of the extension-status section.
- If no extension statuses are discovered, still render:
  - the policy row
  - a dim non-interactive hint such as `No extension statuses discovered yet.`
- Keep search active and visible:
  - filter rows by label and description
  - keep current row actions working on the filtered set
- Omit empty section headers while search is active.
- Preserve current reorder behavior in this phase; do not switch keybindings yet.

## Verification

- Test enabled segments render first in saved order.
- Test disabled segments render after enabled ones in canonical order.
- Test section headers and divider render only when appropriate.
- Test discovered extension-status rows remain alphabetically sorted.
- Test the empty discovered-status state keeps the policy row and shows a dim hint.
- Test search filters rows by both label and description.
- Test section headers are omitted when their filtered section has no matches.
- Run `pnpm test`.

## Completion Criteria

- Users can immediately distinguish status-line items from extension-status filter controls.
- Search continues to work while the list structure becomes more informative.
- Empty-state behavior remains usable instead of collapsing the extension-status section.
