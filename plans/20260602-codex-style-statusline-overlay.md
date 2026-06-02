# Codex-Style `/statusline` Overlay Refactor

## Summary

Refactor the current `/statusline` overlay into a richer picker modeled on Codex's status-line setup UI while preserving this repo's current config model and save flow.

The new overlay should:

- keep `/statusline` as the only entrypoint
- keep `statusLine.segments` and `statusLine.filter` unchanged
- keep draft-only editing with `Enter` to save and `Esc` to cancel
- add a visible search bar
- show a description column for each row
- keep live preview, moved to the bottom like Codex
- keep segments and extension-status filtering in one overlay

## Implementation Changes

### Layout and structure

- Replace the current flat search editor in `src/statusline-ui.ts` with a picker layout that renders:
  1. title: `Configure Status Line`
  2. subtitle: `Select which items to display in the status line.`
  3. blank line
  4. search placeholder line: `Type to search`
  5. input line: `> {query}`
  6. filtered row list with label and description columns
  7. blank line
  8. live preview line using the draft config
  9. help footer line with keybindings
- The list should visually align label and description columns in the Codex style: checkbox + label on the left, description on the right, with truncation applied per column as needed.
- Active row uses the accent color; non-active rows remain plain or dimmed where appropriate.
- Keep the overlay width-responsive using existing `truncateToWidth(...)` and theme functions only. Do not add new theme interfaces.

### Row model

- Replace the current `SegmentRow | StatusRow | NewRow` model with richer row metadata:
  - segment rows
  - extension-status policy row
  - discovered extension-status rows
  - non-interactive section header / separator rows
- Add static metadata for each known segment:
  - display label
  - one-line description
  - canonical display order for disabled items
- Segment descriptions should mirror actual runtime behavior from `src/render.ts`, including "omitted when unavailable/unknown" where applicable.
- Discovered extension-status rows use a generic description:
  - `Show or hide this extension status when extension-statuses is enabled.`
- The policy row uses:
  - label: `Show new extension statuses`
  - description: `Whether newly discovered extension statuses are shown by default.`

### Ordering and filtering behavior

- Segment rows should render in Codex-style order:
  - enabled segments first, in persisted order from `config.segments`
  - disabled segments after that, in a stable canonical order
- Extension-status rows should render after the segment section:
  - policy row first
  - then discovered status keys in alphabetical order
- When `query` is empty:
  - render section headers for `Status line items` and `Extension statuses`
  - render a divider between sections
- When `query` is non-empty:
  - filter interactive rows by label and description
  - omit section headers that would be empty
  - keep the same relative ordering rules within each section
- Search is explicit and visible:
  - printable ASCII appends to `query`
  - `Backspace` removes one character
  - no fuzzy-hidden search mode beyond what is visible on screen
- Matching should stay fuzzy, reusing the current fuzzy matcher semantics so search remains permissive.

### Interaction model

- `Up` / `Down`: move cursor across interactive rows only.
- `Space`: toggle the current row.
- `Ctrl+Up` / `Ctrl+Down`: reorder enabled segment rows only.
- `Enter`: save the current draft config and close.
- `Esc`: discard the draft config and close.
- Reordering is disabled when:
  - the current row is not a segment row
  - the current segment is disabled
  - a search query is active
- Toggling behavior:
  - enabled segment toggled off: remove it from `segments`
  - disabled segment toggled on: append it to the end of enabled segment order
  - discovered extension status toggled: add/remove from the draft shown-key set
  - policy row toggled: switch between current `all+hidden` and `only+shown` semantics
- Keep `mapStatusDraftToFilter(...)` as the conversion point for the final `filter` object.

### Preview behavior

- Move preview to the bottom of the overlay to match Codex.
- Render preview from the current draft state using `buildFooterLine(...)`.
- Do not show a separate `Preview:` label; render the preview line itself as the primary footer preview, matching the Codex pattern.
- The preview should update on every toggle, reorder, query edit, and cursor move that changes visible draft state.

## Public APIs / Interfaces

- No change to persisted config in `src/config.ts`.
- No new top-level toggle like Codex's `Use theme colors`.
- No change to `/statusline` command wiring in `src/index.ts`.
- No change to footer rendering inputs or `StatusLineSegmentId` in `src/render.ts`.

## Test Plan

- Expand overlay-focused tests in `tests/index.test.ts` or split them into a dedicated UI test file.
- Verify row ordering:
  - enabled segments render first in saved order
  - disabled segments append in canonical order
  - extension-status rows render after the segment section
- Verify search behavior:
  - visible query input updates with typing and backspace
  - filtering matches label and description text
  - section headers disappear when their section has no matches
  - reorder is ignored while query is non-empty
- Verify toggle/reorder behavior:
  - enabling a disabled segment appends it
  - disabling an enabled segment removes it
  - `Ctrl+Up/Down` reorders enabled segments only
  - policy row maps correctly to `all+hidden` vs `only+shown`
  - discovered extension-status toggles produce the correct saved filter
- Verify render behavior:
  - descriptions appear next to rows
  - preview is rendered at the bottom from draft state
  - empty discovered-status state still shows the policy row and a dim non-interactive hint
- Keep existing runtime wiring tests for `/statusline` registration and persisted save behavior.

## Assumptions

- The goal is to adopt the Codex picker structure and information density, not its additional theme-color setting.
- This repo should keep `Ctrl+Up/Down` reorder behavior from the earlier target interaction rather than switching to Codex's left/right movement.
- The live preview should move to the bottom and remain draft-only until `Enter`.
- Generic descriptions are sufficient for discovered extension-status keys; no attempt should be made to derive prose from current runtime values.
