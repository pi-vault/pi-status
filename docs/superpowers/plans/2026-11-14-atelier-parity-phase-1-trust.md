# Atelier Parity Phase 1 — Trusted-only Git (release 0.6.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Parent plan:** `docs/superpowers/plans/2026-11-14-atelier-parity.md`. This file replaces the parent's Phase 1 section. It was re-verified against `master` @ `50783b2` (v0.6.0) and Pi 1.5.2 source on 2026-11-14; see "Verification notes".

**Spec:** `docs/superpowers/specs/2026-11-14-atelier-parity-design.md` (section "Phase 1"). One spec claim is wrong for Pi 1.5.2 (`/reload` picking up a new trust decision); this plan corrects it.

**Tech Stack:** TypeScript 7, pnpm, Biome, vitest 5, `@earendil-works/pi-coding-agent` / `@earendil-works/pi-tui` 1.5.2, Node ≥ 24.15.0.

**Prerequisite:** Phase 0 is merged to `master` (done: PR #96, v0.6.0). Baseline `pnpm check` is green (35 files, 964 tests).

## Global Constraints

- Minimum and development host: `@earendil-works/pi-coding-agent@1.5.2`, `@earendil-works/pi-tui@1.5.2`. No dependency changes in this phase.
- `peerDependencies` stay `"*"`; `@pi-vault/pi-usage` stays a regular `dependency`; `engines.node` stays `">=24.15.0"`.
- pi-status never runs any Git command in a project Pi has not trusted.
- Never retain or display changed-file paths. `statusline.json` stays global. No new dashboard tabs.
- Existing `pi-status:sidebar-panels` contributors keep working; the protocol version is unchanged.
- Module layout: `src/core`, `src/tui`, `src/shared`; test layout: `tests/core`, `tests/tui`, `tests/index-*.test.ts`. Match the existing 2-space Biome style.
- Branch `20261114-trusted-only-git` from `master`; update `CHANGELOG.md` and README "Workspace Pulse"; bump `package.json` to `0.6.1`; `pnpm release:check` passes; PR, merge, tag `v0.6.1` (`release.yml` publishes).

## Execution Notes

- "Run tests" means `pnpm test -- <file>` for the narrow check, then `pnpm check` before each commit that ends a task.
- No manual Pi smoke run is required for this phase. Task 1.3 has an optional one.

## Verification notes (why the plan changed)

Checked against the current repo and Pi 1.5.2 (`/Users/lanh/Developer/pi-packages/pi`, `packages/coding-agent@1.5.2`):

1. **Pi's trust model.** `ctx.isProjectTrusted()` returns `SettingsManager.projectTrusted`, which is fixed per session runtime. Pi resolves it when it creates a runtime (`main.ts` ~800). A project with no trust-requiring resources (`.pi/` extensions, packages, settings, or a `.agents/skills` dir) defaults to trusted. So `Git · untrusted` only shows where trust is actually needed and the user declined it.
2. **`/trust` does not take effect on `/reload`.** `/trust` writes the decision to the trust store and prints "Restart pi for this to take effect" (`interactive-mode.ts` `showTrustSelector`). `/reload` calls `resourceLoader.reload()` without `resolveProjectTrust`, which "preserves `SettingsManager.projectTrusted`". The original README text ("restart Pi or `/reload`") was wrong, and so was the review item "`/trust` then `/reload` runs Git". A trust change reaches pi-status only through a new runtime: restarting Pi, or a session switch whose runtime reads trust again.
3. **Cache per `session_start` rather than check live (unlike Atelier).** Atelier (`michaelmjhhhh-pi-atelier/src/state.ts` `#isLiveAndTrusted`) calls `ctx.isProjectTrusted()` before every exec. In Pi, every `ctx` method calls `runner.assertActive()` and throws on a stale context. Trust cannot change within a runtime, so reading it once per `session_start` is equivalent and avoids calling a stale `ctx` from timers. Atelier shows a warning-coloured "Git unavailable"; this spec chose a muted `Git · untrusted`.
4. **No exhaustive switches exist on `WorkspacePulseStatus`.** `formatWorkspacePulseSegment` is a ternary chain that already falls back to `"dim"`, and nothing else switches on the status outside the runtime. The original rationale ("forces every formatter switch") does not hold. A new status value is still the right call: one snapshot shape, and `formatWorkspacePulse` needs a branch for it anyway.
5. **Test scaffolding in the original plan did not exist:** `baseInput`, `theme`, `entry()`, and a footer-render pattern in `index-workspace-pulse.test.ts`. The tests below use the real helpers: `input()`/`identityTheme` (formatters), `snapshot()`/`byId()`/`textOf()` (sidebar-segments), `makeInput()` (sidebar-render), and `buildSetFooterSpy`/`renderWithFactory` from `tests/helpers.ts`.
6. **Pi's own footer data runs Git.** `footer-data-provider.ts` runs `git symbolic-ref` itself, whatever the trust state, and feeds the `git-branch` segment through `footerData.getGitBranch()`. That is Pi's process, not pi-status's, so it is out of scope. It is still a visible branch name in untrusted projects; README mentions it.
7. Line references below were re-checked at `50783b2`.

---

## Phase 1 — Trusted-only Git (release 0.6.1)

**Goal:** pi-status never runs Git in a project Pi has not trusted, and shows a muted `Git · untrusted` placeholder instead.

**Architecture:** Read `ctx.isProjectTrusted()` once per `session_start` into a closure flag in `src/index.ts`. A throw counts as untrusted. When the flag is false the workspace-pulse runtime is never created, so `syncWorkspacePulse`, `turn_start`, and `tool_execution_end` stay no-ops (they already guard on `workspacePulseRuntime`). `currentFooterInput` supplies a static snapshot with the new status `"untrusted"`. The footer formatter and the sidebar workspace segments render it as the placeholder.

### Phase 1 Review Focus

- `isProjectTrusted()` throws: treat the project as untrusted, no Git. (Task 1.2)
- Statusbar disabled, sidebar workspace panel visible, untrusted: no Git runs. (Task 1.2)
- `session_tree` in an untrusted session must not create a runtime through `applySurfaceVisibility → installFooter`. (Task 1.2)
- A later `session_start` with a trusted ctx (new runtime after restart or session switch) creates the runtime and runs Git. (Task 1.2)
- Project name in an untrusted project is `basename(ctx.cwd)`. (Task 1.1)
- All pre-existing trusted tests pass unchanged. `createContext()` defaults to `isProjectTrusted: () => true`.

### Task 1.1: `untrusted` status and its rendering

**Files:**

- Modify: `src/core/workspace-pulse.ts`: status union (lines 5-11), new factory next to `createWorkspacePulseRuntime` (~685), `formatWorkspacePulse` (~691)
- Modify: `src/tui/sidebar-render.ts`: `WorkspacePulseAggregates` (~21), `deriveProjectName` (~79)
- Modify: `src/tui/sidebar-segments.ts`: `workspaceSegments` (~363): `builtin:directory`, `builtin:branch`, `builtin:changes`, `builtin:sync-state`
- No change needed: `src/tui/formatters.ts` `formatWorkspacePulseSegment` (~293) already falls back to `"dim"`. Covered by a test only.
- Test: `tests/core/workspace-pulse.test.ts`, `tests/tui/formatters.test.ts`, `tests/tui/sidebar-render.test.ts`, `tests/tui/sidebar-segments.test.ts`

**Interfaces:**

- Produces:
  - `WorkspacePulseStatus` gains `"untrusted"`.
  - `createUntrustedWorkspacePulseSnapshot(directory: string): WorkspacePulseSnapshot` returns `{ status: "untrusted", directory, ahead: 0, behind: 0, counts: { staged: 0, unstaged: 0, untracked: 0, conflicts: 0 }, trackedFiles: 0, linesAdded: 0, linesRemoved: 0, binaryFiles: 0, submodules: 0 }`. It has no `root`, `branch`, `relativeCwd`, `upstream`, `checkedAt`, or `staleSince`.
  - `WorkspacePulseAggregates` gains `untrusted?: true`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/core/workspace-pulse.test.ts — add createUntrustedWorkspacePulseSnapshot to the existing import
it("formats the untrusted snapshot as a placeholder", () => {
  const snap = createUntrustedWorkspacePulseSnapshot("/p/demo");
  expect(snap.status).toBe("untrusted");
  expect(snap.directory).toBe("/p/demo");
  expect(snap.root).toBeUndefined();
  expect(snap.branch).toBeUndefined();
  expect(formatWorkspacePulse(snap)).toBe("Git · untrusted");
});

// tests/tui/formatters.test.ts — add formatWorkspacePulseSegment to the formatters import,
// and import createUntrustedWorkspacePulseSnapshot from "../../src/core/workspace-pulse.ts"
it("renders the untrusted pulse dim", () => {
  const value = input({
    workspacePulse: createUntrustedWorkspacePulseSnapshot("/p/demo"),
  });
  expect(formatWorkspacePulseSegment(value, identityTheme)).toEqual([
    "Git · untrusted",
    "dim",
  ]);
});

// tests/tui/sidebar-render.test.ts — inside describe("buildSidebarSnapshot")
it("names an untrusted project after the cwd and marks the pulse untrusted", () => {
  const footer = {
    ...makeInput().footer,
    cwd: "/p/demo",
    workspacePulse: createUntrustedWorkspacePulseSnapshot("/p/demo"),
  };
  const snap = buildSidebarSnapshot(makeInput({ footer }));
  expect(snap.projectName).toBe("demo");
  expect(snap.pulse).toEqual({
    ahead: 0,
    behind: 0,
    staged: 0,
    unstaged: 0,
    untrusted: true,
  });
});

// tests/tui/sidebar-segments.test.ts
it("shows only the untrusted placeholder among workspace Git rows", () => {
  const catalog = byId(
    buildSidebarSegmentCatalog(
      snapshot({
        projectName: "demo",
        pulse: { ahead: 0, behind: 0, staged: 0, unstaged: 0, untrusted: true },
      }),
    ),
  );
  expect(textOf(catalog.get("builtin:project"))).toBe("demo");
  expect(catalog.get("builtin:branch")?.content).toMatchObject({
    kind: "metric",
    value: [{ text: "Git · untrusted", role: "muted" }],
  });
  for (const id of [
    "builtin:directory",
    "builtin:changes",
    "builtin:sync-state",
  ]) {
    expect(catalog.get(id)?.content).toBeNull();
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- tests/core/workspace-pulse.test.ts tests/tui/formatters.test.ts tests/tui/sidebar-render.test.ts tests/tui/sidebar-segments.test.ts`
Expected: FAIL. `createUntrustedWorkspacePulseSnapshot` is not exported, and the sidebar assertions fail.

- [ ] **Step 3: Implement**

- `workspace-pulse.ts`: add `| "untrusted"` to the union. Export `createUntrustedWorkspacePulseSnapshot` as specified. In `formatWorkspacePulse`, return `"Git · untrusted"` as the first statement when `snapshot.status === "untrusted"`, before the stale/"Git" token logic.
- `sidebar-render.ts`: add `untrusted?: true` to `WorkspacePulseAggregates`. In `deriveProjectName`, after the `!pulse` guard: `if (pulse.status === "untrusted") return { projectName: basename(footer.cwd), pulse: { ahead: 0, behind: 0, staged: 0, unstaged: 0, untrusted: true } };`
- `sidebar-segments.ts` `workspaceSegments`:
  - `builtin:branch` resolves to `metric(spans(["Git · untrusted", "muted"]), "workspace-identity")` when `pulse?.untrusted`, otherwise it keeps the existing logic.
  - `builtin:directory`, `builtin:changes`, and `builtin:sync-state` already return `null` for zeroed aggregates without `relativeCwd`. Do not add guards unless a test proves one is needed.
- `formatters.ts`: no change. The ternary already yields `"dim"`, which is the footer's muted colour; the footer palette has no `muted`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: the command from Step 2, then `pnpm typecheck`.
Expected: PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/core/workspace-pulse.ts src/tui/sidebar-render.ts src/tui/sidebar-segments.ts tests/core/workspace-pulse.test.ts tests/tui/formatters.test.ts tests/tui/sidebar-render.test.ts tests/tui/sidebar-segments.test.ts
git commit -m "feat: add untrusted workspace pulse placeholder"
```

### Task 1.2: Gate the runtime on project trust

**Files:**

- Modify: `src/index.ts`: closure state next to `let workspacePulseRuntime` (~289); `currentFooterInput` (~245); `installFooter` (~375); `session_start` (~487-489)
- Test: `tests/index-workspace-pulse.test.ts`

**Interfaces:**

- Consumes: `createUntrustedWorkspacePulseSnapshot` (Task 1.1). `createContext({ isProjectTrusted })` from `tests/helpers.ts` (defaults to trusted).
- Produces: closure flag `projectTrusted: boolean`, written only in `session_start`.

- [ ] **Step 1: Write the failing tests**

Add `renderWithFactory` to the `./helpers.ts` import. Define a local `flush` helper (four `await new Promise((r) => setImmediate(r))`, the same pattern as "starts one inspection…" at line 107).

In `describe("workspace pulse wiring")`, add a nested `describe("untrusted projects")`:

- `it("never runs git and renders the placeholder when untrusted with workspace-pulse in a zone")`: `withEnabledZone({ bottomLeft: ["workspace-pulse"] })`; `footerSpy = buildSetFooterSpy()`; ctx = `createContext({ isProjectTrusted: () => false, ui: { ...createContext().ui, setFooter: footerSpy.setFooter } })`; fire `session_start`; `await flush()`. Expect `execFileMock` not called, and `renderWithFactory(footerSpy.calls.at(-1))` to contain `"Git · untrusted"`.
- `it("treats a throwing isProjectTrusted as untrusted")`: same zone, `isProjectTrusted: () => { throw new Error("x"); }`. Expect `execFileMock` not called.
- `it("does not create a runtime on session_tree in an untrusted session")`: same zone, untrusted ctx; fire `session_start`, then every `session_tree` handler with the same ctx; `await flush()`. Expect not called.
- `it("runs git when a later session_start is trusted")`: same zone, with the `fourCommandMock((options) => options.cwd)` setup from line 109. Fire `session_start` with an untrusted ctx, `await flush()`, expect not called. Then fire `session_start` with `createContext()` (trusted), `await flush()`, expect `toHaveBeenCalledTimes(4)`.

In `describe("workspace pulse sidebar demand")`, next to the test at line 308 (it needs `writeSidebarLayout` from that block):

- `it("does not start Workspace Pulse for a visible sidebar workspace panel in an untrusted project")`: copy the line-308 setup, with `isProjectTrusted: () => false` in `createContext`. Expect `execFileMock` not called.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- tests/index-workspace-pulse.test.ts`
Expected: the gating tests FAIL because `execFile` is called and the placeholder is missing. All pre-existing tests PASS.

- [ ] **Step 3: Implement**

- `let projectTrusted = false;` next to `let workspacePulseRuntime`.
- In `session_start`, right after `workspacePulseRuntime = undefined;` (~489): `projectTrusted = safeRead(() => ctx.isProjectTrusted()) === true;`. `safeRead` (~216) already turns a throw into `undefined`.
- `installFooter`: change the guard to `if (!workspacePulseRuntime && projectTrusted)`.
- `currentFooterInput`: replace the `workspacePulse` spread with
  `...(workspacePulseRuntime ? { workspacePulse: workspacePulseRuntime.snapshot() } : !projectTrusted ? { workspacePulse: createUntrustedWorkspacePulseSnapshot(activeCtx.cwd) } : {}),`
  and import `createUntrustedWorkspacePulseSnapshot`.
- `session_tree` and `session_shutdown`: no change. `session_tree` keeps the flag from its `session_start`. Shutdown disposes the runtime, and the next `session_start` re-reads trust.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- tests/index-workspace-pulse.test.ts`, then `pnpm check`.
Expected: PASS, including every pre-existing test unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/index-workspace-pulse.test.ts
git commit -m "fix: never run git in untrusted projects"
```

### Task 1.3: Docs and release 0.6.1

**Files:** `README.md` (section `### Workspace Pulse`, line ~90), `CHANGELOG.md`, `package.json`

- [ ] **Step 1: Document**

README Workspace Pulse, append:

> Workspace Pulse runs Git only in projects Pi trusts. In an untrusted project the `workspace-pulse` segment and the sidebar Workspace panel show `Git · untrusted`. To enable it, run `/trust`, save the decision, then restart Pi. `/reload` keeps the session's existing trust decision. Projects without project-local Pi resources are trusted by default. The separate `git-branch` segment comes from Pi's own footer data and is unaffected.

CHANGELOG, new top entry in the existing style:

```md
## 0.6.1 - 2026-11-14

### Security

- Workspace Pulse never runs Git in projects Pi has not trusted. The segment and the sidebar Workspace panel show a muted `Git · untrusted` placeholder instead. Run `/trust`, then restart Pi, to enable it.
```

- [ ] **Step 2: Bump the version and run the release check**

Set `"version": "0.6.1"` in `package.json`. Run: `pnpm release:check`. Expected: exit 0.

- [ ] **Step 3 (optional): Smoke run in Pi 1.5.2**

In a scratch repo containing `.pi/settings.json`, start Pi and decline trust. Enable `workspace-pulse` in a zone and confirm the footer shows `Git · untrusted`. `ps`/`fs_usage` should show no `git status` from pi-status. Run `/trust`, choose trusted, and restart Pi: the pulse shows branch data.

- [ ] **Step 4: Commit, PR, tag**

```bash
git add README.md CHANGELOG.md package.json
git commit -m "chore: release v0.6.1"
```

Open the PR. After merge, tag `v0.6.1`.
