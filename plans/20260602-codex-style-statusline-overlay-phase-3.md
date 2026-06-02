# Phase 3: Keyboard Contract, Bottom Preview, And Concise Status Copy

## Usable Result

`/statusline` keeps the Phase 2 row model and search behavior, uses `Left` / `Right` for segment reordering, renders the live preview as the bottom picker preview line, and shortens picker descriptions to match Codex for shared items while keeping Pi-specific wording where needed.

## Dependencies

- Complete Phase 2 first.

## Public Interface

- Keep `/statusline` command behavior and persisted filter shape unchanged.
- Keep draft-only editing semantics:
  - `Enter` saves
  - `Esc` discards
- Rename the public segment ID `project-root` to `project-name` everywhere:
  - `StatusLineSegmentId`
  - config normalization and validation
  - picker metadata
  - render logic
  - tests and docs
- Treat `project-name` as a hard rename:
  - stop accepting `project-root`
  - do not add a compatibility alias
- Keep `run-state` and `session-id` as segment IDs.

## Implementation

- In `src/statusline-ui.ts`, keep segment reordering on:
  - `matchesKey(data, Key.left)` to move the current enabled segment earlier
  - `matchesKey(data, Key.right)` to move the current enabled segment later
- Keep cursor traversal indexed over the filtered interactive-row list only:
  - section headers are non-interactive
  - divider rows are non-interactive
  - empty-state hint rows are non-interactive
- Keep `Up` / `Down` movement unchanged on that filtered interactive list.
- Keep reorder disabled when:
  - `query` is non-empty
  - the current row is not a segment row
  - the current segment is disabled
- Keep visible search semantics unchanged from Phase 2:
  - printable ASCII appends to `query`
  - `Backspace` removes one character
  - matching stays fuzzy over row label + description text
- Replace the preview block at the bottom of the overlay with this exact layout:
  1. title
  2. subtitle
  3. blank line
  4. search placeholder line
  5. query line
  6. rendered rows
  7. blank line
  8. preview line from `buildFooterLine(...)`
  9. help footer line
- Remove the separate `Preview:` label completely.
- Keep preview sourced from the current draft config via `buildFooterLine(...)`.
- Treat cursor movement as rerender-only:
  - toggles, reorders, and query edits can change preview content
  - cursor movement alone does not change draft config or preview content
- Update help text to:
  - default: `Toggle: Space  •  Reorder: ← / →  •  Save: Enter  •  Cancel: Esc`
  - searching: `Toggle: Space  •  Reorder: disabled while search is active  •  Save: Enter  •  Cancel: Esc`

### Final Picker Labels And Descriptions

- `model`: label `Model`, description `Current model name`
- `model-with-reasoning`: label `Model + Reasoning`, description `Current model name with reasoning level`
- `project-name`: label `Project Name`, description `Project name (omitted when unavailable)`
- `current-dir`: label `Current Dir`, description `Current working directory`
- `git-branch`: label `Git Branch`, description `Current Git branch (omitted when unavailable)`
- `run-state`: label `Run State`, description `Pi status (idle, queued, busy)`
- `context-remaining`: label `Context Remaining`, description `Percentage of context window remaining (omitted when unknown)`
- `context-used`: label `Context Used`, description `Percentage of context window used (omitted when unknown)`
- `context-window-size`: label `Context Window`, description `Total context window size in tokens (omitted when unknown)`
- `used-tokens`: label `Used Tokens`, description `Total tokens used in session (omitted when zero)`
- `total-input-tokens`: label `Input Tokens`, description `Total input tokens used in session`
- `total-output-tokens`: label `Output Tokens`, description `Total output tokens used in session`
- `session-id`: label `Session ID`, description `Current session ID (omitted when unavailable)`
- `five-hour-limit`: label `5h Limit`, description `Remaining usage on the primary usage limit (omitted when unavailable)`
- `weekly-limit`: label `Weekly Limit`, description `Remaining usage on the secondary usage limit (omitted when unavailable)`
- `extension-statuses`: label `Extension Statuses`, description `Visible extension status values (omitted when none are visible)`

- Shorten the non-segment helper copy to:
  - `STATUS_ROW_DESCRIPTION`: `Visible when extension-statuses is enabled`
  - `POLICY_ROW_DESCRIPTION`: `Default visibility for new extension statuses`
  - `EMPTY_EXTENSION_STATUSES_HINT`: `No extension statuses yet.`

## Verification

- Update tests and helpers that reference `project-root` to `project-name`.
- Update `tests/statusline-ui.test.ts` to stop using `Preview:` as a row-list sentinel.
- Test `Left` / `Right` reorders enabled segment rows correctly.
- Test reorder is ignored for disabled segments and non-segment rows.
- Test reorder is ignored while a search query is active.
- Test cursor movement still skips section headers, divider rows, and empty hints because selection remains interactive-row-based.
- Test `Enter` persists the current draft and `Esc` leaves runtime config unchanged.
- Test the preview renders as the bottom preview line without a `Preview:` label.
- Test the preview updates after toggles, reorders, and query edits.
- Update exact-copy assertions for the new concise descriptions.
- Update description-search coverage so it still proves fuzzy matching by description text after the copy changes.
- Run `pnpm test`.

## Completion Criteria

- The overlay interaction model matches the intended final picker behavior.
- Search, reorder, and preview no longer compete or conflict.
- Picker descriptions are concise and aligned with Codex wording where the items are shared.
- `project-name` fully replaces `project-root` across code, tests, and docs.

## Assumptions

- “Copy directly from Codex” applies to shared item descriptions only.
- `run-state` keeps Pi-specific wording and does not adopt Codex `Ready / Working / Thinking` terminology.
- `session-id` keeps session terminology and does not adopt Codex thread terminology.
- The hard rename to `project-name` is intentional even though it breaks existing saved `project-root` configs.
- Width-polish beyond what is required to preserve existing behavior stays in Phase 4.
