# Deepen Architecture Implementation Plan

> **For agentic workers:** Execute each phase plan sequentially. Each phase is self-contained in its own file below.

**Goal:** Eliminate duplicated FooterRenderInput assembly, absorb `aggregateBranchTotals` behind a testable interface, structure the extension runtime state, and add full segment-formatter test coverage.

**Architecture:** Three sequential phases, each producing one atomic commit.

**Tech Stack:** TypeScript 6, Vitest 4, Biome 2 (lint + format), pnpm

---

## Phases (execute in order)

| #   | Plan file                                                                | Summary                                                        | Depends on |
| --- | ------------------------------------------------------------------------ | -------------------------------------------------------------- | ---------- |
| 1   | [`phase-1-extract-build-snapshot.md`](phase-1-extract-build-snapshot.md) | Extract `buildSnapshot` module; absorb `aggregateBranchTotals` | —          |
| 2   | [`phase-2-extract-runtime-state.md`](phase-2-extract-runtime-state.md)   | Group 5 mutable `let` declarations into `RuntimeState` object  | Phase 1    |
| 3   | [`phase-3-export-format-segment.md`](phase-3-export-format-segment.md)   | Export `formatSegment`; add ~55 per-segment tests              | Phase 2    |

---

## File Map (all phases)

| File                     | Phase | Action | Responsibility                                                                               |
| ------------------------ | ----- | ------ | -------------------------------------------------------------------------------------------- |
| `src/core/snapshot.ts`   | 1     | Create | Assemble `FooterRenderInput` from narrow inputs; absorbs `aggregateBranchTotals`             |
| `tests/snapshot.test.ts` | 1     | Create | Tests for `buildSnapshot` (branch totals, run state, pass-through)                           |
| `src/index.ts`           | 1, 2  | Modify | Remove duplicated assembly + `aggregateBranchTotals`; group mutable vars into `RuntimeState` |
| `src/tui/render.ts`      | 3     | Modify | Export `formatSegment`                                                                       |
| `tests/render.test.ts`   | 3     | Modify | Add full per-segment test coverage                                                           |

---

## Final Verification

After all three phases are complete:

- [ ] `pnpm check` (lint + typecheck + all tests)
- [ ] `git status` — no untracked files
