# Phase 4: Inline Dashboard, Width Hardening, And Residual Coverage

## Usable Result

`/statusline` stops opening as an overlay and instead renders inline below the chat box, while keeping the current Phase 3 picker behavior, hardening width handling, and closing the remaining direct UI test gaps.

## Dependencies

- Complete Phase 3 first.

## Public Interface

- No config, persisted-shape, or command-name changes in this phase.
- No new settings, toggles, segment IDs, or theme interfaces.
- `/statusline` changes presentation mode only:
  - render as an inline custom UI below the chat box
  - do not use overlay mode

## Implementation

- Treat this phase as a narrow follow-up to the already-complete Phase 3 implementation.
- Use `/Users/lanh/Developer/pi-vault/thinkscape-pi-status` as the reference for UI surface placement only:
  - call `ctx.ui.custom(...)` without `{ overlay: true }`
  - render inline in the terminal flow below the chat box
  - do not copy thinkscape's immediate-save behavior, top preview placement, or command structure
- Keep the current interaction model unchanged:
  - `Up` / `Down` move across filtered interactive rows
  - `Space` toggles the selected row
  - `Left` / `Right` reorder enabled segment rows only
  - `Enter` saves
  - `Esc` cancels
- Keep the current row model and section/search behavior unchanged.
- Keep `createStatuslineEditor(...)` as the `/statusline` UI entrypoint; do not replace it with a separate inline menu component.
- Keep the current two layout modes in `src/statusline-ui.ts`:
  - aligned columns when width can fit prefix + fixed label column + gap + minimum description width
  - fallback `label - description` layout when it cannot
- Keep the current layout constants unchanged:
  - `LABEL_COLUMN_WIDTH = 24`
  - `LAYOUT_GAP = "  "`
  - `MIN_DESCRIPTION_WIDTH = 12`
- Preserve deterministic truncation rules:
  - do not vary column widths by row content or selection
  - if fallback mode cannot fit separator plus at least one description character, render only prefix + truncated label
  - selected rows must preserve the leading `>` whenever width is at least 1
- Tighten width handling for:
  - interactive rows
  - subtitle, hint, and section lines
  - bottom preview line
  - help footer line
- Change the preview width budget to use the full inline surface width when calling `buildFooterLine(...)` so preview truncation matches the requested render width exactly.
- Update `/statusline` command wiring in `src/index.ts` to remove overlay mode.
- Do not revisit section ordering, preview placement, description copy, config mapping, or command naming in this phase.

## Verification

- Keep all existing editor, config, render, and footer wiring tests passing.
- Add width-focused UI tests in `tests/statusline-ui.test.ts` for:
  - selected row remains identifiable at extremely small widths
  - aligned wide-width row output stays exact
  - narrow-width fallback row output stays deterministic
  - preview truncates to the requested width without the extra two-column loss
  - default help line and searching help line both truncate within width and remain distinct
  - all rendered lines stay within width for representative small and normal terminal widths
- Add direct UI persistence tests for discovered extension-status toggles:
  - in `all` mode, hiding one discovered status saves `filter: { mode: "all", hidden: [...] }`
  - in `only` mode, showing one discovered status saves `filter: { mode: "only", shown: [...] }`
- Extend `tests/index.test.ts` to cover `/statusline` UI invocation:
  - assert `ctx.ui.custom(...)` is used for `/statusline`
  - assert it is invoked without `{ overlay: true }`
  - keep save and cancel behavior unchanged
- Run `pnpm test`.
- Run `pnpm typecheck`.

## Completion Criteria

- `/statusline` opens inline below the chat box instead of in overlay mode.
- Width-driven rendering no longer loses extra columns or changes shape unpredictably while navigating.
- The inline picker remains usable in narrow terminals without changing its Phase 3 interaction contract.
- Remaining UI-level filter, placement, and width regressions are covered directly by tests instead of inferred through other layers.

## Assumptions

- Phase 1 through Phase 3 behavior is already implemented and should not be reopened here.
- The `thinkscape-pi-status` reference applies to surface placement only, not to its top preview or immediate persistence model.
- “Width hardening” means preserving the current layout design, not redesigning it.
- Automated tests are the primary verification mechanism for this phase; no manual Pi smoke test is required unless runtime-only issues appear.
