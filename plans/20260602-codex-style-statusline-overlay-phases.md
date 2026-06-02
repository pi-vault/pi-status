# Split `20260602-codex-style-statusline-overlay` Into Shippable Phases

## Summary

The current overlay refactor plan is too dense for a single safe implementation because it combines:

- a visual/layout rewrite
- a richer row metadata model
- search/filter semantics
- reordered keyboard behavior
- mixed segment and extension-status editing in one view

Split it into four phases so each phase leaves `/statusline` better than before and shippable on its own, without requiring follow-up work to remain usable.

## Phase Plan

### Phase 1: Codex-Style Shell And Descriptions

**Usable result:** `/statusline` keeps all current behavior, but the overlay becomes more legible and self-explanatory.

- Keep the current underlying row model and current save/cancel behavior.
- Replace the current top chrome with:
  - title: `Configure Status Line`
  - subtitle: `Select which items to display in the status line.`
  - visible search placeholder and query line
- Add description text next to every currently rendered row.
- Keep the current live preview functional, even if it still uses the old placement temporarily.
- Preserve the current navigation/toggle semantics in this phase:
  - `Up` / `Down`
  - `Space`
  - current reorder behavior
  - `Enter` save
  - `Esc` cancel
- Introduce static metadata for segment label + description, but do not yet introduce section headers or non-interactive rows.
- For extension-status rows and the “new statuses” policy row, use generic descriptions immediately.

**Why this phase stands alone**

- It delivers the visible Codex-like information density the user asked for.
- It avoids mixing the first UI rewrite with ordering and interaction rewrites.

### Phase 2: Structured Row Model And Sectioned List

**Usable result:** `/statusline` becomes easier to scan, with clear separation between status-line items and extension-status filtering.

- Replace the current flat `SegmentRow | StatusRow | NewRow` model with a richer internal row model:
  - segment row
  - policy row
  - discovered status row
  - section header row
  - divider row
- Render two sections when search is empty:
  - `Status line items`
  - `Extension statuses`
- Add a divider between sections.
- Keep discovered extension-status keys alphabetical.
- Render enabled segments first in persisted order, then disabled segments in a stable canonical order.
- Keep search active and visible, but only filter rows; do not change reorder semantics yet.
- If no extension statuses exist, still render:
  - policy row
  - dim hint row such as `No extension statuses discovered yet.`

**Why this phase stands alone**

- It solves the information-architecture problem without yet changing motor-memory keybindings.
- It makes the mixed segment/filter use case understandable before interaction rules get more complex.

### Phase 3: Keyboard Model And Preview Convergence

**Usable result:** `/statusline` behaves like the intended Codex-inspired picker, not just looks like it.

- Switch segment reordering from the current behavior to:
  - `Ctrl+Up` / `Ctrl+Down`
- Define interactive-row traversal explicitly:
  - cursor moves only across interactive rows
  - section headers, dividers, and empty hints are skipped
- Disable reordering when:
  - search query is non-empty
  - current row is not a segment
  - current segment is disabled
- Move live preview to the bottom of the overlay.
- Remove any separate `Preview:` label and render the preview in the footer area of the picker.
- Keep search input semantics explicit:
  - printable ASCII appends
  - `Backspace` deletes
- Keep fuzzy matching over both label and description text.
- Preserve draft-only editing:
  - preview updates live
  - persisted config changes only on `Enter`
  - `Esc` discards

**Why this phase stands alone**

- After this phase, the picker matches the intended interaction model closely enough to call the refactor complete for users.
- It isolates the highest-risk behavior changes from the earlier structural refactors.

### Phase 4: Hardening, Width Polish, And Test Expansion

**Usable result:** the refactor is stable across realistic terminal widths and mixed runtime states.

- Tighten truncation rules for:
  - checkbox + label column
  - description column
  - bottom preview
  - footer help text
- Verify active-row highlighting and dim/inactive states remain readable under narrow widths.
- Add comprehensive overlay-focused tests covering:
  - row ordering
  - section rendering
  - search filtering
  - cursor skipping non-interactive rows
  - reorder constraints
  - policy-row mapping to `all+hidden` and `only+shown`
  - extension-status toggles
  - bottom preview updates from draft state
  - empty discovered-status state
- Keep existing wiring, config, and rendering tests intact.

**Why this phase stands alone**

- Earlier phases already ship usable UX improvements.
- This phase is stabilization and regression prevention, not product-shape discovery.

## Complexity Assessment

The hardest part is not drawing the overlay. It is coordinating four independent concerns in one component:

- draft config state for `segments` and `filter`
- filtered versus unfiltered row projections
- enabled-order versus canonical disabled-order semantics
- keyboard navigation across interactive and non-interactive rows

That complexity currently lives almost entirely inside `src/statusline-ui.ts`, while `tests/index.test.ts` has very little direct overlay-behavior coverage. The phased split above reduces risk by introducing one dimension of change at a time.

## Public Interfaces

- No phase changes `PiStatusConfig` in `src/config.ts`.
- No phase changes `/statusline` command registration or persistence location.
- No phase adds a Codex-style `Use theme colors` toggle.
- No phase changes `StatusLineSegmentId` or footer rendering contracts in `src/render.ts`.

## Test Strategy

- Phase 1 adds baseline snapshot-style or string-render tests for title/search/descriptions.
- Phase 2 adds row-order and section-layout tests.
- Phase 3 adds keyboard and draft-preview behavior tests.
- Phase 4 completes width/polish and regression coverage.

## Assumptions

- The repo should optimize for small, reviewable diffs over a one-shot overlay rewrite.
- Temporary mismatch between old and new keyboard behavior is acceptable in early phases as long as each phase remains documented and usable.
- The final target remains the Codex-style picker structure with visible search, descriptions, bottom preview, and `Ctrl+Up/Down` reorder.
