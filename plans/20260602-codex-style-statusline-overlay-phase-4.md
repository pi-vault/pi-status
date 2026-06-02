# Phase 4: Hardening, Width Polish, And Regression Coverage

## Usable Result

The refactored `/statusline` overlay is stable across realistic terminal widths and has direct tests for the behavior introduced in Phases 1 through 3.

## Dependencies

- Complete Phase 3 first.

## Public Interface

- No config or command-surface changes in this phase.
- No new settings, toggles, or segment IDs.

## Implementation

- Tighten width handling for the final picker layout:
  - checkbox + label column
  - description column
  - bottom preview line
  - help footer line
- Ensure active-row highlighting remains readable under narrow widths.
- Ensure dim text for subtitles, hints, and descriptions remains legible without overpowering the active row.
- Keep truncation deterministic so row alignment does not jump while navigating.
- Expand overlay-specific test coverage, preferably in focused UI tests if `tests/index.test.ts` becomes too crowded.
- Add direct tests for:
  - row ordering across enabled and disabled segments
  - section rendering and empty-state rendering
  - search filtering over label and description text
  - cursor skipping non-interactive rows
  - reorder constraints
  - policy-row mapping to `all+hidden` and `only+shown`
  - discovered extension-status toggle mapping
  - bottom preview updates from draft state
  - visible search input and backspace behavior
- Keep existing config, render, and extension wiring tests intact.

## Verification

- Test narrow-width rendering for labels, descriptions, help text, and preview truncation.
- Test active row remains identifiable after truncation.
- Test no regressions in config loading, filter mapping, footer rendering, and `/statusline` wiring.
- Run `pnpm test`.
- Run `pnpm typecheck`.

## Completion Criteria

- The new overlay is stable enough for routine use in narrow and wide terminals.
- Regressions in overlay behavior are covered directly by tests instead of only indirectly through runtime wiring.
- The refactor can be maintained without relying on manual Pi smoke tests for every small UI change.
