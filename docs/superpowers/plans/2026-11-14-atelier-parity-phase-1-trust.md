# Atelier Parity Phase 1 — Trusted-only Git (release 0.6.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Parent plan:** `docs/superpowers/plans/2026-11-14-atelier-parity.md` (this file is Phase 1, copied verbatim)

**Spec:** `docs/superpowers/specs/2026-11-14-atelier-parity-design.md` (section "Phase 1")

**Tech Stack:** TypeScript 7, pnpm, Biome, vitest, `@earendil-works/pi-coding-agent` / `@earendil-works/pi-tui` 1.5.2, Node ≥ 24.15.0.

**Prerequisite:** Phase 0 is merged to `master`.

## Global Constraints

- Minimum and development host from Phase 0 on: `@earendil-works/pi-coding-agent@1.5.2`, `@earendil-works/pi-tui@1.5.2`.
- Dependency bumps take the latest stable version published at least 48 hours earlier, or the second latest if the latest is younger.
- `peerDependencies` stay `"*"` for both Pi packages; the minimum is stated in README and CHANGELOG only.
- `@pi-vault/pi-usage` stays a regular `dependency`.
- `engines.node` stays `">=24.15.0"`.
- Never run any Git command in a project Pi has not trusted.
- Never retain or display changed-file paths. `statusline.json` stays global. No new dashboard tabs.
- Default behaviour is unchanged without opt-in: `sidebarMode` defaults to `"manual"`, `toggleShortcut` defaults to `""`.
- Existing `pi-status:sidebar-panels` contributors keep working; the protocol version is unchanged.
- Pi's `render` and fullscreen layout root are restored after `session_shutdown`, `/reload`, or a render error.
- Module layout: `src/core`, `src/tui`, `src/shared`; test layout: `tests/core`, `tests/tui`, `tests/index-*.test.ts`. Match the existing 2-space Biome style.
- Per phase: branch `YYYYMMDD-<phase-slug>` from `master`; update `CHANGELOG.md` and the affected README sections; bump `package.json` version; `pnpm release:check` passes; PR, merge, tag `vX.Y.Z` (`release.yml` publishes).

## Execution Notes

- Every phase starts from an up-to-date `master` that contains the previous phase's merge.
- "Run tests" means `pnpm test -- <file>` for the narrow check, then `pnpm check` before each commit that ends a task.
- Phases 0, 4 and 5 each end with a manual smoke run in Pi 1.5.2. The steps are listed in each phase's last task.

---

## Phase 1 — Trusted-only Git (release 0.6.1)

**Goal:** pi-status never runs Git in a project Pi has not trusted, and shows a muted `Git · untrusted` placeholder instead.

**Architecture:** Read `ctx.isProjectTrusted()` once per `session_start` into a closure flag in `src/index.ts`. When the flag is false the workspace-pulse runtime is never created. The footer/sidebar input gets a static snapshot with a new status `"untrusted"`, which the existing formatters render as the placeholder. *(Builder's call: a new status value, not a separate flag, so every formatter switch is forced to handle it.)*

**Branch:** `20261114-trusted-only-git`

### Phase 1 Review Focus

- `/trust` then `/reload`: the second `session_start` must create the runtime and run Git. Test in Task 1.2.
- `isProjectTrusted()` throws: treat the project as untrusted, no Git. Test in Task 1.2.
- Statusbar disabled, sidebar workspace panel visible, untrusted: the sidebar shows the placeholder and no Git runs. Test in Task 1.2.
- `session_tree` in an untrusted session must not create a runtime through `applySurfaceVisibility → installFooter`. Test in Task 1.2.
- Project name in an untrusted project is `basename(ctx.cwd)`. Test in Task 1.1.

### Task 1.1: `untrusted` status and its rendering

**Files:**
- Modify: `src/core/workspace-pulse.ts:5-11` (status union), `formatWorkspacePulse` (~691)
- Modify: `src/tui/formatters.ts` (`formatWorkspacePulseSegment` ~293)
- Modify: `src/tui/sidebar-render.ts` (`WorkspacePulseAggregates`, `deriveProjectName` ~82)
- Modify: `src/tui/sidebar-segments.ts` (`workspaceSegments` ~363, `builtin:branch`)
- Test: `tests/core/workspace-pulse.test.ts`, `tests/tui/formatters.test.ts`, `tests/tui/sidebar-segments.test.ts`

**Interfaces:**
- Produces:
  - `WorkspacePulseStatus` gains `"untrusted"`.
  - `createUntrustedWorkspacePulseSnapshot(directory: string): WorkspacePulseSnapshot`: status `"untrusted"`, `directory`, zero counts/aheads/lines, no `root`/`branch`/`relativeCwd`.
  - `WorkspacePulseAggregates` gains `untrusted?: true`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/core/workspace-pulse.test.ts
it("formats the untrusted snapshot as a placeholder", () => {
  const snap = createUntrustedWorkspacePulseSnapshot("/p/demo");
  expect(snap.status).toBe("untrusted");
  expect(snap.root).toBeUndefined();
  expect(formatWorkspacePulse(snap)).toBe("Git · untrusted");
});

// tests/tui/formatters.test.ts
it("renders the untrusted pulse dim", () => {
  const input = { ...baseInput, workspacePulse: createUntrustedWorkspacePulseSnapshot("/p/demo") };
  expect(formatWorkspacePulseSegment(input, theme)).toEqual(["Git · untrusted", "dim"]);
});

// tests/tui/sidebar-segments.test.ts
it("shows the untrusted placeholder in the workspace panel and no other Git rows", () => {
  // snapshot built via buildSidebarSnapshot with footer.workspacePulse = untrusted snapshot, cwd "/p/demo"
  expect(textOf(entry("builtin:project"))).toBe("demo");
  expect(entry("builtin:branch").content).toMatchObject({ kind: "metric", value: [{ text: "Git · untrusted", role: "muted" }] });
  for (const id of ["builtin:directory", "builtin:changes", "builtin:sync-state"]) expect(entry(id).content).toBeNull();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- tests/core/workspace-pulse.test.ts tests/tui/formatters.test.ts tests/tui/sidebar-segments.test.ts`
Expected: FAIL. `createUntrustedWorkspacePulseSnapshot` is not exported.

- [ ] **Step 3: Implement**

- Add the union member and `createUntrustedWorkspacePulseSnapshot` in `workspace-pulse.ts`. `formatWorkspacePulse` returns `"Git · untrusted"` for that status, before any other token logic.
- `formatWorkspacePulseSegment` maps `"untrusted"` to `"dim"`. The footer palette has no `muted`, and `dim` is its muted colour.
- `deriveProjectName`: when `pulse.status === "untrusted"`, return `{ projectName: basename(footer.cwd), pulse: { ...zeroes, untrusted: true } }`.
- `builtin:branch` resolves to `metric(spans(["Git · untrusted", "muted"]), "workspace-identity")` when `pulse?.untrusted`. Directory, changes and sync-state return `null` when `pulse?.untrusted`.
- Fix any other exhaustive switches on `WorkspacePulseStatus` that typecheck flags.

- [ ] **Step 4: Run the tests to verify they pass**

Run: same command as Step 2, then `pnpm typecheck`.
Expected: PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/core/workspace-pulse.ts src/tui/formatters.ts src/tui/sidebar-render.ts src/tui/sidebar-segments.ts tests/
git commit -m "feat: add untrusted workspace pulse placeholder"
```

### Task 1.2: Gate the runtime on project trust

**Files:**
- Modify: `src/index.ts`: closure state near line 289; `currentFooterInput` (~245); `installFooter` (~375); `session_start` (~479)
- Test: `tests/index-workspace-pulse.test.ts`

**Interfaces:**
- Consumes: `createUntrustedWorkspacePulseSnapshot` (Task 1.1). `createContext({ isProjectTrusted })` from `tests/helpers.ts` defaults to trusted.
- Produces: closure flag `projectTrusted: boolean`, set only in `session_start`.

- [ ] **Step 1: Write the failing tests**

Add a `describe("untrusted projects")` block to `tests/index-workspace-pulse.test.ts`, reusing its `withEnabledZone`, `buildPiWithHandlers`, `buildSetFooterSpy` and the existing footer-render pattern from "starts one inspection…":

- `it("never runs git when untrusted even with workspace-pulse in a zone")`: zone `bottomLeft: ["workspace-pulse"]`, `isProjectTrusted: () => false`, fire `session_start`, flush timers/microtasks. Expect `execFileMock` not called, and the rendered footer contains `"Git · untrusted"`.
- `it("never runs git when untrusted with only the sidebar workspace panel visible")`: copy the setup of the test at line 308 with untrusted ctx. Expect `execFileMock` not called.
- `it("treats a throwing isProjectTrusted as untrusted")`: `isProjectTrusted: () => { throw new Error("x"); }`. Expect not called.
- `it("does not create a runtime on session_tree in an untrusted session")`: untrusted `session_start`, then `session_tree` with the same ctx. Expect not called.
- `it("runs git after a reload in a newly trusted project")`: `session_start` untrusted (not called), then `session_start` trusted (called once).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- tests/index-workspace-pulse.test.ts`
Expected: the five new tests FAIL (execFile called or placeholder missing). Existing tests PASS.

- [ ] **Step 3: Implement**

- `let projectTrusted = false;` next to `workspacePulseRuntime`.
- In `session_start`, immediately after disposing the old runtime: `projectTrusted = safeRead(() => ctx.isProjectTrusted()) === true;`. Use the existing `safeRead` helper.
- `installFooter`: create the runtime only when `!workspacePulseRuntime && projectTrusted`.
- `currentFooterInput`: `workspacePulse` is the runtime snapshot when a runtime exists. Otherwise, when `!projectTrusted`, it is `createUntrustedWorkspacePulseSnapshot(activeCtx.cwd)`. Otherwise it is absent.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- tests/index-workspace-pulse.test.ts`
Expected: PASS, including every pre-existing trusted test unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/index-workspace-pulse.test.ts
git commit -m "fix: never run git in untrusted projects"
```

### Task 1.3: Docs and release 0.6.1

**Files:** `README.md` ("Workspace Pulse" section), `CHANGELOG.md`, `package.json`

- [ ] **Step 1: Document**

README Workspace Pulse: "Workspace Pulse runs Git only in projects Pi trusts. In an untrusted project the segment and the sidebar show `Git · untrusted`; run `/trust`, then restart Pi or `/reload`." CHANGELOG `## 0.6.1`, Security: "Never run Git in untrusted projects."

- [ ] **Step 2: Bump the version and run the release check**

Set version to `0.6.1`. Run: `pnpm release:check`. Expected: exit 0.

- [ ] **Step 3: Commit, PR, tag**

```bash
git add README.md CHANGELOG.md package.json
git commit -m "chore: release v0.6.1"
```

Open the PR. After merge, tag `v0.6.1`.
