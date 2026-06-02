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
- Do not change `PiStatusConfig`, `FooterRenderInput`, `StatusLineSegmentId`, or `/statusline` command wiring.

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
  - preserve current reorder behavior with `Left` / `Right` in this phase
- Replace `SEGMENT_LABELS` with static segment metadata containing exact label and description copy:

| Segment ID | Label | Description |
| --- | --- | --- |
| `model` | `Model` | `Show the current model name. Hidden when no model is available.` |
| `model-with-reasoning` | `Model + Reasoning` | `Show the current model name and reasoning level. Hidden when no model is available.` |
| `project-root` | `Project Root` | `Show the nearest project root folder name. Hidden when no project root is detected.` |
| `current-dir` | `Current Dir` | `Show the current working directory.` |
| `git-branch` | `Git Branch` | `Show the current Git branch. Hidden when unavailable.` |
| `run-state` | `Run State` | `Show whether Pi is idle, queued, or busy.` |
| `context-remaining` | `Context Remaining` | `Show remaining context tokens. Hidden when context usage is unavailable.` |
| `context-used` | `Context Used` | `Show percent of context already used. Hidden when context usage is unavailable.` |
| `context-window-size` | `Context Window` | `Show the total context window size. Hidden when context usage is unavailable.` |
| `used-tokens` | `Used Tokens` | `Show total assistant tokens used in this branch. Hidden when unavailable.` |
| `total-input-tokens` | `Input Tokens` | `Show total assistant input tokens in this branch. Hidden when unavailable.` |
| `total-output-tokens` | `Output Tokens` | `Show total assistant output tokens in this branch. Hidden when unavailable.` |
| `session-id` | `Session ID` | `Show the short session ID. Hidden when unavailable.` |
| `five-hour-limit` | `5h Limit` | `Show remaining 5-hour Codex quota. Hidden when unavailable.` |
| `weekly-limit` | `Weekly Limit` | `Show remaining weekly Codex quota. Hidden when unavailable.` |
| `extension-statuses` | `Extension Statuses` | `Show visible extension status values. Hidden when none are visible.` |

- Replace the current header text with this exact shell, in this order:
  1. accent title: `Configure Status Line`
  2. dim subtitle: `Select which items to display in the status line.`
  3. blank spacer
  4. dim placeholder line: `Type to search`
  5. visible query input line: `> {query}`
  6. current filtered row list
  7. blank spacer
  8. `Preview:`
  9. live preview line from the current draft config
  10. dim help line: `Toggle: Space  •  Reorder: ← / →  •  Save: Enter  •  Cancel: Esc`
  11. when `query` is non-empty, keep the same help line except replace the reorder clause with `Reorder: disabled while search is active`

- Use generic descriptions for non-segment rows:
  - discovered extension-status rows: `Show or hide this extension status when extension-statuses is enabled.`
  - policy row label remains `New extension statuses`
  - policy row description: `Whether newly discovered extension statuses are shown by default.`

- Keep ordering and filtering exactly as they work today:
  - segment rows stay in metadata declaration order
  - discovered extension-status rows stay alphabetical
  - policy row stays last and always visible
  - search remains fuzzy over segment labels and discovered status keys only
  - descriptions are not searchable in this phase

- Render each row on a single line with:
  - current cursor marker semantics
  - current checkbox or policy state formatting
  - label column
  - description column

- Keep current row text semantics:
  - segment rows keep `[x]` / `[ ]` plus ` (n)` order suffix for enabled items
  - discovered extension-status rows keep `[x]` / `[ ]`
  - policy row keeps `[shown]` / `[hidden]`

- Use this width behavior for label and description layout:
  - if width leaves room for at least 12 characters of description plus a 2-space gap after a 24-character label column, render aligned columns
  - otherwise fall back to a single truncated remainder string in the form `{labelWithOrder} - {description}`
  - dim the description text with existing theme functions only

- Keep the current preview behavior in this phase:
  - preview still renders from draft state using `buildFooterLine(...)`
  - preview remains below the row list with the explicit `Preview:` label

## Verification

- Add direct editor tests in `tests/statusline-ui.test.ts` for `createStatuslineEditor(...)`.
- Test exact shell rendering for:
  - title
  - subtitle
  - visible search placeholder
  - visible query line
  - preview block
  - help line
- Test query input updates from printable characters and `Backspace`.
- Test filtering stays limited to segment labels and discovered status keys.
- Test the policy row remains visible while searching.
- Test segment descriptions render with the exact copy above.
- Test generic descriptions render for discovered extension-status rows and the policy row.
- Test current toggle, navigation, reorder, save, and cancel behavior remains unchanged.
- Test reorder is ignored while query is non-empty.
- Test live preview still updates from draft state after toggles.
- Keep existing tests in `tests/index.test.ts`.
- Run `pnpm test`.

## Completion Criteria

- The overlay visibly resembles the Codex setup UI at the top level.
- Users can still complete the same `/statusline` tasks as before without relearning core behavior.
- Every selectable row has a readable description.
- Phase 1 can be implemented without inventing additional UI copy or behavior.
