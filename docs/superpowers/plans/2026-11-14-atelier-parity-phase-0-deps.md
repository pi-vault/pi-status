# Atelier Parity Phase 0 — Dependency baseline (release 0.6.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Parent plan:** `docs/superpowers/plans/2026-11-14-atelier-parity.md` (this file is Phase 0, copied verbatim)

**Spec:** `docs/superpowers/specs/2026-11-14-atelier-parity-design.md` (section "Phase 0")

**Tech Stack:** TypeScript 7, pnpm, Biome, vitest, `@earendil-works/pi-coding-agent` / `@earendil-works/pi-tui` 1.5.2, Node ≥ 24.15.0.

**Prerequisite:** none; start from current `master`.

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

## Phase 0 — Dependency baseline (release 0.6.0)

**Goal:** pi-status is developed, tested and documented against Pi 1.5.2 with current tooling.

**Architecture:** Mechanical upgrade. Fix only what the new Pi types, Biome 2.6 rules and vitest 5 flag. No behaviour change.

**Branch:** `20261114-deps-pi-1-5-2`

### Phase 0 Review Focus

- Existing `statusline.json` files from 0.5.x load and save unchanged. Pin with a round-trip test in Task 0.1.
- Under vitest 5, `vi.mock("node:child_process")` in `tests/index-workspace-pulse.test.ts` still intercepts. If the mock stops working, "never calls execFile" tests pass vacuously. The positive test "starts one inspection when workspace-pulse is enabled in a zone" must still assert one call.
- `ctx.ui.onTerminalInput`, `footerData.getGitBranch/onBranchChange/getExtensionStatuses` and `ctx.ui.custom` overlay options still behave the same on Pi 1.5.2. Typecheck plus the manual smoke run cover this.

### Task 0.1: Upgrade dependencies and fix fallout

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`, `biome.json` (`$schema`)
- Modify (only where tooling flags them): files under `src/` and `tests/`
- Test: `tests/core/config.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: devDependencies at `@earendil-works/pi-coding-agent ^1.5.2`, `@earendil-works/pi-tui ^1.5.2`, `@biomejs/biome ^2.6.7`, `vitest ^5.1.0`, `@types/node ^26.6.6`. Later phases rely on pi-tui 1.5.2 exports `HStack` and `isViewportTUI`, and on `ExtensionContext.isProjectTrusted()`.

- [ ] **Step 1: Create the branch**

Run: `git switch master && git pull && git switch -c 20261114-deps-pi-1-5-2`

- [ ] **Step 2: Bump the dependencies**

Run: `pnpm add -D @earendil-works/pi-coding-agent@^1.5.2 @earendil-works/pi-tui@^1.5.2 @biomejs/biome@^2.6.7 vitest@^5.1.0 @types/node@^26.6.6`
Then set `biome.json` `$schema` to `https://biomejs.dev/schemas/2.6.7/schema.json`.
Expected: `package.json` shows the new ranges. `dependencies` and `peerDependencies` are unchanged.

- [ ] **Step 3: Add the config round-trip test**

In `tests/core/config.test.ts`:

```ts
it("round-trips a 0.5.x statusline.json without changing it", () => {
  const legacy = {
    statusbarEnabled: true, sidebarEnabled: true,
    zones: { topLeft: ["model"], topRight: [], bottomLeft: ["workspace-pulse"], bottomRight: [] },
    extensionSegments: { hidden: [] }, extensionStatusZone: "bottomRight",
    completionNotifications: false,
    // sidebarPanelLayout/sidebarHiddenSegments/colors: copy DEFAULT_CONFIG values
  };
  // write legacy JSON with MemoryConfigStore, loadConfig, saveConfig, re-read
  expect(JSON.parse(store.read(path)!)).toEqual(expectedNormalized);
});
```

Before the bump, `expectedNormalized` is whatever `saveConfig(loadConfig())` writes on 0.5.1. Capture it by running the test once on `master`.

- [ ] **Step 4: Typecheck and fix**

Run: `pnpm typecheck`
Expected fallout and fixes:
- `turn_end` fixtures missing the new required `TurnEndEvent` boundary fields: add them, using the field names from `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts`.
- Exhaustive switches over extension event types: handle `AgentBeforeSettleEvent` as a no-op.
- Calls to `queryTerminalColorScheme` / `queryTerminalBackgroundColor`: `rg "queryTerminal(ColorScheme|BackgroundColor)" src` must print nothing.

Repeat until `pnpm typecheck` exits 0.

- [ ] **Step 5: Format and lint**

Run: `pnpm format && pnpm lint`
Expected: exit 0. Fix new Biome 2.6 lint findings in place. Do not disable rules globally.

- [ ] **Step 6: Run the full suite**

Run: `pnpm test`
Expected: all tests pass, at least 964 (963 plus the round-trip test). Fix vitest 5 incompatibilities in tests only. `vitest.config.ts` changes only if vitest 5 requires them.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: upgrade to Pi 1.5.2, Biome 2.6.7, vitest 5"
```

### Task 0.2: Docs and release 0.6.0

**Files:**
- Modify: `README.md` (line 48 requirement; Upgrade Notes baseline line ~254; Colours section duplicated `NO_COLOR` sentence)
- Modify: `CHANGELOG.md`, `package.json` (`version`)

**Interfaces:**
- Consumes: Task 0.1.
- Produces: release 0.6.0.

- [ ] **Step 1: Update README**

- "Pi 0.84.4 or newer is required" → "Pi 1.5.2 or newer is required".
- Upgrade Notes baseline line (currently says 0.84.3) → 1.5.2.
- Delete the second, duplicated `NO_COLOR` sentence in Colours.

- [ ] **Step 2: Add the CHANGELOG entry**

`## 0.6.0`. Changed: minimum Pi is now 1.5.2; tooling upgraded (Biome 2.6.7, vitest 5.1.0). Note: "Pi 0.84.x users should stay on pi-status 0.5.x."

- [ ] **Step 3: Bump the version**

Set `package.json` `version` to `0.6.0`.

- [ ] **Step 4: Release check**

Run: `pnpm release:check`
Expected: exit 0.

- [ ] **Step 5: Manual smoke run in Pi 1.5.2**

Run `pi -e ./src/index.ts` in this repo and confirm all of:
- the footer renders;
- the sidebar renders at ≥ 92 columns and hides below;
- `/statusline` opens, changes a setting and saves;
- `Ctrl+Shift+R` resizes with arrows, then Enter.

- [ ] **Step 6: Commit and open the PR**

```bash
git add README.md CHANGELOG.md package.json
git commit -m "chore: release v0.6.0"
git push -u origin HEAD
```

Open the PR. After merge: `git tag v0.6.0 && git push origin v0.6.0`.
