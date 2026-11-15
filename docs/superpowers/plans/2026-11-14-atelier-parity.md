# Atelier Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close five gaps found against pi-atelier (untrusted Git, release verification, panel key/values, auto sidebar, fullscreen sidebar) on a Pi 1.5.2 baseline, as six independently released phases.

**Architecture:** Each phase is one branch, one PR, one npm release, and leaves pi-status fully usable. Phases are ordered from simplest to most complex. Later phases reuse earlier ones: Phase 2's verify scripts guard Phases 3–5, and Phase 5 reuses Phase 4's mode/width logic in the split pane. Changes stay in the existing modules (`src/core`, `src/tui`, `src/shared`, `src/index.ts`).

**Tech Stack:** TypeScript 7, pnpm, Biome, vitest, `@earendil-works/pi-coding-agent` / `@earendil-works/pi-tui` 1.5.2, Node ≥ 24.15.0.

**Spec:** `docs/superpowers/specs/2026-11-14-atelier-parity-design.md`

**Phase plans** (extracted verbatim from this file, one per release; Phase 3 was revised in both places and the phase file adds execution notes and revision notes):

| Phase                                     | Release | Plan                                                      |
| ----------------------------------------- | ------- | --------------------------------------------------------- |
| 0 — Dependency baseline                   | 0.6.0   | `2026-11-14-atelier-parity-phase-0-deps.md`               |
| 1 — Trusted-only Git                      | 0.6.1   | `2026-11-14-atelier-parity-phase-1-trust.md`              |
| 2 — Release verification                  | 0.7.0   | `2026-11-14-atelier-parity-phase-2-release-checks.md`     |
| 3 — Richer panel API                      | 0.8.0   | `2026-11-14-atelier-parity-phase-3-panel-key-values.md`   |
| 4 — Auto sidebar and saved width          | 0.9.0   | `2026-11-14-atelier-parity-phase-4-auto-sidebar.md`       |
| 5 — Fullscreen sidebar                    | 0.10.0  | `2026-11-14-atelier-parity-phase-5-fullscreen-sidebar.md` |

## Global Constraints

- Minimum and development host from Phase 0 on: `@earendil-works/pi-coding-agent@1.5.2`, `@earendil-works/pi-tui@1.5.2`.
- Dependency bumps take the latest stable version published at least 48 hours earlier, or the second latest if the latest is younger.
- `peerDependencies` stay `"*"` for both Pi packages; the minimum is stated in README and CHANGELOG only.
- `@pi-vault/pi-usage` stays a regular `dependency`.
- `engines.node` stays `">=24.15.0"`.
- Never run any Git command in a project Pi has not trusted.
- Never retain or display changed-file paths. `statusline.json` stays global. No new dashboard tabs.
- Default behaviour is unchanged without opt-in: `sidebarMode` defaults to `"manual"`, `sidebarWidth` defaults to `44`.
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
    statusbarEnabled: true,
    sidebarEnabled: true,
    zones: {
      topLeft: ["model"],
      topRight: [],
      bottomLeft: ["workspace-pulse"],
      bottomRight: [],
    },
    extensionSegments: { hidden: [] },
    extensionStatusZone: "bottomRight",
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

---

## Phase 1 — Trusted-only Git (release 0.6.1)

**Goal:** pi-status never runs Git in a project Pi has not trusted, and shows a muted `Git · untrusted` placeholder instead.

**Architecture:** Read `ctx.isProjectTrusted()` once per `session_start` into a closure flag in `src/index.ts`. When the flag is false the workspace-pulse runtime is never created. The footer/sidebar input gets a static snapshot with a new status `"untrusted"`, which the existing formatters render as the placeholder. _(Builder's call: a new status value, not a separate flag, so every formatter switch is forced to handle it.)_

**Branch:** `20261114-trusted-only-git`

### Phase 1 Review Focus

- A later trusted `session_start` (after `/trust` and a Pi restart) must create the runtime and run Git. `/reload` keeps the existing trust value in Pi 1.5.2. Test in Task 1.2.
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
  const input = {
    ...baseInput,
    workspacePulse: createUntrustedWorkspacePulseSnapshot("/p/demo"),
  };
  expect(formatWorkspacePulseSegment(input, theme)).toEqual([
    "Git · untrusted",
    "dim",
  ]);
});

// tests/tui/sidebar-segments.test.ts
it("shows the untrusted placeholder in the workspace panel and no other Git rows", () => {
  // snapshot built via buildSidebarSnapshot with footer.workspacePulse = untrusted snapshot, cwd "/p/demo"
  expect(textOf(entry("builtin:project"))).toBe("demo");
  expect(entry("builtin:branch").content).toMatchObject({
    kind: "metric",
    value: [{ text: "Git · untrusted", role: "muted" }],
  });
  for (const id of [
    "builtin:directory",
    "builtin:changes",
    "builtin:sync-state",
  ])
    expect(entry(id).content).toBeNull();
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
- `it("runs git when a later session_start is trusted")`: `session_start` untrusted (not called), then `session_start` trusted (called once).

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

README Workspace Pulse: "Workspace Pulse runs Git only in projects Pi trusts. In an untrusted project the segment and the sidebar show `Git · untrusted`; run `/trust`, then restart Pi." CHANGELOG `## 0.6.1`, Security: "Never run Git in untrusted projects."

- [ ] **Step 2: Bump the version and run the release check**

Set version to `0.6.1`. Run: `pnpm release:check`. Expected: exit 0.

- [ ] **Step 3: Commit, PR, tag**

```bash
git add README.md CHANGELOG.md package.json
git commit -m "chore: release v0.6.1"
```

Open the PR. After merge, tag `v0.6.1`.

---

## Phase 2 — Release verification (release 0.7.0)

**Goal:** every release is proven to pack exactly the right files, install cleanly the way Pi installs it, and load in Pi's real extension loader.

**Architecture:** Two dependency-free Node scripts in `scripts/`, modelled on atelier's. `verify-pack` diffs `pnpm pack --dry-run --json` against `git ls-files` of `package.json` `files`. `verify-install` packs a tarball and installs it with Pi's own npm flags into a temp consumer. It asserts the lockfile and loads the entry with Pi's loader from the dev dependency. Both are wired into `release:check` and CI.

**Branch:** `20261114-release-verification`

### Phase 2 Review Focus

- The `pnpm pack --json` shape differs between local pnpm 12.x and CI pnpm 11.21.0. The scripts read only `filename` and `files[].path`. CI runs `verify:pack`, which proves the CI shape.
- `filename` may be relative or absolute. Resolve it against the pack destination when relative.
- A Pi upgrade moves `dist/core/extensions/loader.js`: the script fails with a message naming the deep import, not a bare module-not-found. Step in Task 2.2.
- A shallow CI checkout: `git ls-files` still lists tracked files. No action needed; CI proves it.
- A stray untracked file in `src/` must fail `verify:pack`. Manual step in Task 2.1.

### Task 2.1: `verify:pack`

**Files:**

- Create: `scripts/verify-pack.mjs`
- Modify: `package.json` (`scripts`: add `verify:pack`, remove `pack:dry-run`)

**Interfaces:**

- Produces: `pnpm verify:pack`. It exits 0 and prints `Package contents verified (<n> files)`, or throws an error that lists `Missing:` and `Unexpected:` paths.

- [ ] **Step 1: Write `scripts/verify-pack.mjs`**

Port atelier's `scripts/verify-pack.mjs` with two changes: it runs `execFileSync("pnpm", ["pack", "--dry-run", "--json"])` and parses stdout, and the expected set is `package.json` plus `git ls-files -- ...pkg.files`.

- [ ] **Step 2: Wire the script**

`"verify:pack": "node scripts/verify-pack.mjs"`. Remove `pack:dry-run`; it is replaced here and in Task 2.3.

- [ ] **Step 3: Verify it passes**

Run: `pnpm verify:pack`
Expected: `Package contents verified (N files)`, exit 0.

- [ ] **Step 4: Verify it catches an untracked file**

Run: `touch src/untracked-probe.ts && pnpm verify:pack; echo "exit=$?"; rm src/untracked-probe.ts`
Expected: an error containing `Unexpected: src/untracked-probe.ts`, `exit=1`.

- [ ] **Step 5: Lint and commit**

Run: `pnpm format:check && pnpm lint`. Expected: exit 0.

```bash
git add scripts/verify-pack.mjs package.json
git commit -m "build: verify packed file set"
```

### Task 2.2: `verify:install` and optional peers

**Files:**

- Create: `scripts/verify-install.mjs`
- Modify: `package.json` (`scripts.verify:install`, `peerDependenciesMeta`)

**Interfaces:**

- Produces: `pnpm verify:install`, which exits 0 and prints `Package install verified (statusline command registered)`.

- [ ] **Step 1: Add `peerDependenciesMeta`**

```json
"peerDependenciesMeta": {
  "@earendil-works/pi-coding-agent": { "optional": true },
  "@earendil-works/pi-tui": { "optional": true }
}
```

- [ ] **Step 2: Write `scripts/verify-install.mjs`**

Behaviour, in order. Wrap everything in `try { … } finally { rmSync(tempDir, { recursive: true, force: true }) }`.

1. `tempDir = mkdtempSync(join(tmpdir(), "pi-status-verify-"))`. Run `pnpm pack --pack-destination <tempDir> --json` and resolve the tarball path from `filename`.
2. `consumerDir = join(tempDir, "consumer")` with `package.json` `{"name":"consumer","private":true}`. Run `npm install --omit=dev --legacy-peer-deps --no-audit --no-fund <tarball>` with `cwd: consumerDir`. These flags mirror Pi (`package-manager.ts:2007`).
3. Read `consumerDir/package-lock.json`. The `packages` keys other than `""` must equal exactly `["node_modules/@pi-vault/pi-status", "node_modules/@pi-vault/pi-usage"]` (sorted compare). On failure, list the unexpected keys.
4. Set `process.env.PI_CODING_AGENT_DIR = join(tempDir, "agent")` before the import. Then import `../node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js` with the comment `// Pi's package index does not export the loader; this deep import may need updating on Pi upgrades.` On import failure, throw `Cannot load Pi's extension loader from <path>; update the deep import for this Pi version`.
5. `entries = manifest.pi.extensions.map(p => join(pkgDir, p))`, then `result = await loadExtensions(entries, consumerDir)`. Assert `result.errors` deep-equals `[]` and `result.extensions.some(e => e.commands.has("statusline"))`.

- [ ] **Step 3: Wire the script and run it**

`"verify:install": "node scripts/verify-install.mjs"`. Run: `pnpm verify:install`.
Expected: `Package install verified (statusline command registered)`, exit 0.

- [ ] **Step 4: Prove the lockfile assertion bites**

Temporarily add `"left-pad": "^1.3.0"` to `dependencies`. Run `pnpm verify:install; echo "exit=$?"`, then revert with `git checkout package.json` and re-apply Steps 1 and 3 if needed.
Expected: an error listing `node_modules/left-pad`, `exit=1`.

- [ ] **Step 5: Lint and commit**

```bash
pnpm format:check && pnpm lint
git add scripts/verify-install.mjs package.json
git commit -m "build: verify packed install loads in Pi's extension loader"
```

### Task 2.3: Wire release check and CI; release 0.7.0

**Files:**

- Modify: `package.json` (`release:check`), `.github/workflows/quality.yml`, `.github/workflows/release.yml`
- Modify: `README.md` (Development section, if it lists scripts), `CHANGELOG.md`

- [ ] **Step 1: Update `release:check`**

`"release:check": "pnpm check && pnpm verify:pack && pnpm verify:install"`

- [ ] **Step 2: Update CI**

- `quality.yml`: after `Test`, add a step `Verify package contents` that runs `pnpm verify:pack`.
- `release.yml`: replace the `pnpm check` step (if present) and the `pnpm run pack:dry-run` step (line ~38) with one step `Release check` that runs `pnpm release:check`. Keep the tag/version check and the publish step unchanged.

- [ ] **Step 3: Docs, version, verify**

CHANGELOG `## 0.7.0`, Added: packed-content and packed-install verification; Pi peers marked optional. Bump version to `0.7.0`.
Run: `pnpm release:check`. Expected: exit 0, both verify messages printed.

- [ ] **Step 4: Commit, PR, tag**

```bash
git add package.json .github/workflows README.md CHANGELOG.md
git commit -m "chore: release v0.7.0"
```

The PR's CI must show `Verify package contents` passing. After merge, tag `v0.7.0` and confirm `release.yml` ran `Release check` before publishing.

---

## Phase 3 — Richer panel API (release 0.8.0)

> Revised 2026-11-14 after checking against `v0.7.0`; mirrors `2026-11-14-atelier-parity-phase-3-panel-key-values.md` (see that file's "Revision notes").

**Goal:** other extensions can publish aligned label/value rows with optional progress bars, and rows-only contributors render byte-identically to 0.7.0.

**Architecture:**

- `keyValues` is an optional, additive field on the contribution. The registry sanitizes it as a unit. Anything invalid drops the whole field, so the host falls back to `rows`.
- In the catalog (`sidebar-segments.ts`), a panel with `keyValues` emits one entry per key/value, with the new content kind `"keyValue"`, instead of its rows. A panel without `keyValues` emits exactly what it emits today.
- `entryRows` in `sidebar-render.ts` lays out each key/value at the panel's content width through an exported `renderKeyValueRow`.

**Branch:** `20261114-pi-atelier-parity-phase-3-panel-key-values`

### Phase 3 Review Focus

- **Byte identity.** A rows-only contributed panel renders the same as 0.7.0. Task 3.0 pins this with a characterization snapshot taken before any code change.
- **Wide characters** (CJK/emoji) in a label or value. Alignment uses `visibleWidth`, and no row exceeds the content width. Tested in Task 3.3.
- **Truncation artifacts.** pi-tui's `truncateToWidth` defaults to a 3-column `"..."` and appends `\x1b[0m` whenever it truncates, even with no colour. Key/value text uses a local `fitToWidth` helper (`sliceByColumn(text, 0, max - 1, true) + "…"`) instead. Tested in Task 3.3 (no `\x1b` under NO_COLOR, even when truncated).
- **`progress` exactly `0` and `1`.** These draw an all-empty and an all-filled bar. Tested in Task 3.3.
- **`rows: []` with valid `keyValues`.** The key/values render. Hosts that only know `rows` render nothing for that panel. Tested in Task 3.2.
- **A contributor that changes only `keyValues`** (identical `rows`) must bump the `generation`. Tested in Task 3.1 (`panelsEqual`).
- **`valueRole` absent with a panel `role`.** The value uses the panel role. Tested in Task 3.2.
- **Identity churn (accepted, existing behaviour).** Key/value entries use generation-scoped anonymous IDs, like anonymous rows today. Every content change (for example a progress tick) produces new session IDs. The entries return to the contributed panel, and a per-row move or hide made in the Sidebar tab does not survive the update. Do not add stable key/value IDs in this phase.
- **Explicit row IDs.** While `keyValues` is present, rows with explicit IDs (`contribution:<panel>:<rowId>`) are not in the catalog, so they do not render. Their saved layout positions are kept because stable IDs are always accepted, and they render again when `keyValues` is withdrawn.

### Task 3.0: Pin rows-only output (characterization)

**Files:**

- Test: `tests/tui/sidebar-render.test.ts`

- [ ] **Step 1: Write the characterization test**

Add it to the `describe` that holds "renders a contributed panel with its own title". It uses a tagging theme, so the output records each role as well as the text:

```ts
function tagTheme(): StatusLineTheme {
  return {
    ...noColorTheme(),
    fg: (color, text) => `<${color}>${text}</${color}>`,
  };
}

it("renders a rows-only contributed panel exactly as 0.7.0", () => {
  const input = makeInput();
  const layout = [
    ...input.config.sidebarPanelLayout.map((panel) => ({
      ...panel,
      visible: false,
    })),
    { id: "ext:sample" as never, visible: true, segments: [] },
  ];
  const lines = render(
    {
      ...input,
      config: { ...input.config, sidebarPanelLayout: layout },
      sidebarPanels: [contributedPanel()],
    },
    44,
    12,
    { colorEnabled: true },
    tagTheme(),
  );
  expect(lines).toMatchInlineSnapshot();
});
```

If every built-in panel hidden trips the "at least one visible panel" rule, keep `agent` visible instead. The snapshot is the evidence, so its exact content does not matter.

- [ ] **Step 2: Record and check the snapshot**

Run: `pnpm test -- tests/tui/sidebar-render.test.ts` (without `CI=true`).
Expected: PASS, and vitest writes the inline snapshot into the file. Open the file, confirm the snapshot contains `row one` and `<accent>row two</accent>`, and run the command again. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/tui/sidebar-render.test.ts
git commit -m "test: pin rows-only contributed panel rendering"
```

### Task 3.1: Contract and sanitization

**Files:**

- Modify: `src/tui/sidebar-panels.ts`: types (~66-96), new `sanitizeKeyValues` before `sanitizeContribution` (~236), `sanitizeContribution`, `panelsEqual` (~399)
- Test: `tests/tui/sidebar-panels.test.ts`

**Interfaces:**

- Produces (exported from `src/tui/sidebar-panels.ts`):

```ts
/** Responsive label/value rows laid out by pi-status at the current sidebar width. */
export interface SidebarPanelKeyValue {
  label: string;
  value: string;
  labelRole?: SidebarPanelRole;
  valueRole?: SidebarPanelRole;
  /** Optional finite fraction from 0 to 1, inclusive. Invalid values are dropped. */
  progress?: number;
}
// SidebarPanelContribution gains:
//   /** Optional preferred representation; `rows` remains the compatibility fallback. */
//   keyValues?: readonly SidebarPanelKeyValue[];
// SanitizedSidebarPanelContribution gains: keyValues?: SidebarPanelKeyValue[];
// SidebarPanelData inherits keyValues through Omit<SidebarPanelContribution, "rows">.
```

- [ ] **Step 1: Write the failing tests**

Add a new `describe("contributed keyValues", …)`. Each test uses `createSidebarPanelRegistry().register(...)` and then `registry.get("vendor:kv")`, like the existing tests:

- `it("keeps valid keyValues with sanitized text, roles and progress")`: `{ label: "CPU\x1b[31m", value: "42%", valueRole: "warning", progress: 0.42 }` is stored as `{ label: "CPU", value: "42%", valueRole: "warning", progress: 0.42 }`.
- `it("drops keyValues and keeps rows when the list is empty, not an array, or longer than SIDEBAR_PANEL_MAX_ROWS")`: three cases. In each, `panel.keyValues` is `undefined`, `panel.rows` is intact, and `register` returns `true`.
- `it("drops keyValues when any entry is malformed")`: four cases, each with one good entry plus one bad one: a non-record entry (`"x"`), an entry missing `value`, a non-string `label`, and a `label` of `"a".repeat(SIDEBAR_PANEL_MAX_ROW_CHARS + 1)`. Each gives `keyValues === undefined`, with the rows kept.
- `it("skips entries whose label and value are both empty after sanitizing")`: `[{ label: "\x1b[0m", value: " " }, { label: "A", value: "1" }]` gives `[{ label: "A", value: "1" }]`. When every entry is empty, the result is `keyValues === undefined`. This matches atelier.
- `it("drops an invalid role but keeps the entry")`: `labelRole: "nope"` gives an entry without `labelRole`.
- `it("drops out-of-range or non-finite progress but keeps the entry")`: `-0.1`, `1.1`, `NaN`, `Infinity` and `"0.5"` give no `progress`. `0` and `1` are kept.
- `it("bumps generation when only keyValues change")`: register with the same `rows` and the value `"1"`, then `"2"`. `generation` goes from 1 to 2. Registering the second payload again leaves it at 2.
- `it("publishes keyValues through registerSidebarPanel")`: use the publisher test pattern at ~line 465. A registry on the same fake bus receives the sanitized `keyValues`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- tests/tui/sidebar-panels.test.ts`
Expected: the new tests FAIL. Existing tests PASS.

- [ ] **Step 3: Implement**

`function sanitizeKeyValues(value: unknown): SidebarPanelKeyValue[] | undefined`:

1. Return `undefined` when `value` is not an array, or when its length is `0` or `> SIDEBAR_PANEL_MAX_ROWS`.
2. For each entry, return `undefined` when any of these is true:
   - the entry is not a record (`isRecord`);
   - `label` or `value` is not a string;
   - `label` or `value` fails `isSidebarPanelTextWithinRawLimit(_, SIDEBAR_PANEL_MAX_RAW_ROW_CODE_UNITS)`;
   - `label` or `value` fails `fitsSidebarPanelText(_, SIDEBAR_PANEL_MAX_ROW_CHARS)`.
     Each limit applies to the label and the value separately.
3. Sanitize the text with `sanitizeSidebarPanelText(_, SIDEBAR_PANEL_MAX_ROW_CHARS)`. Skip the entry when both results are `""`.
4. Keep `labelRole` and `valueRole` only when `isSidebarPanelRole` passes. Keep `progress` only when it is a finite number in `[0, 1]`.
5. Return `undefined` when no entries remain.

In `sanitizeContribution`, compute `const keyValues = sanitizeKeyValues(value.keyValues)` after the rows loop and spread `...(keyValues ? { keyValues } : {})`. `rows` validation is unchanged: invalid `rows` still rejects the whole panel.

Extend `panelsEqual`: return `false` when exactly one side has `keyValues` or the lengths differ, then compare every field of every entry (`label`, `value`, `labelRole`, `valueRole`, `progress`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- tests/tui/sidebar-panels.test.ts && pnpm typecheck`
Expected: PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/tui/sidebar-panels.ts tests/tui/sidebar-panels.test.ts
git commit -m "feat: accept keyValues in sidebar panel contributions"
```

### Task 3.2: Catalog content kind

**Files:**

- Modify: `src/shared/types.ts` (~121-134, `SidebarSegmentContent`)
- Modify: `src/tui/sidebar-segments.ts` (`contributionSegments` ~744)
- Modify: `src/tui/sidebar-render.ts` (`entryRows` ~336, a temporary guard)
- Modify: `tests/tui/sidebar-segments.test.ts` (`textOf` helper ~135, new tests)

**Interfaces:**

- Consumes: `SidebarPanelData.keyValues` (Task 3.1).
- Produces (`src/shared/types.ts`):

```ts
export interface SidebarKeyValueContent {
  kind: "keyValue";
  label: SidebarSegmentSpan;
  value: SidebarSegmentSpan;
  progress?: number;
}
export type SidebarSegmentContent =
  | SidebarMetricContent
  | SidebarBlockContent
  | SidebarKeyValueContent;
```

- [ ] **Step 1: Write the failing tests**

First update `textOf` in `tests/tui/sidebar-segments.test.ts`. Otherwise the widened union breaks typecheck at `entry.content.rows`:

```ts
if (entry.content.kind === "keyValue")
  return `${entry.content.label.text}=${entry.content.value.text}`;
```

Then add a `describe("contributed keyValues", …)` that uses the existing `contributedPanel()` fixture (generation 3, rows `row_one` plus one anonymous row):

- `it("builds one keyValue entry per key/value instead of rows")`: a panel with 2 rows and 3 keyValues gives exactly 3 `build:panel` entries. Their IDs are `sidebarAnonymousContributionSegmentId("build:panel", 3, i)` for i = 0..2. Each has `persistence: "session"`, `defaultPanelId: "build:panel"` and `content.kind === "keyValue"`, and `contribution:build%3Apanel:row_one` is absent.
- `it("defaults label role to muted and value role to the panel role, else primary")`: panel role `"accent"` gives value role `"accent"`. No panel role gives `"primary"`. The label role is `"muted"`. Explicit `labelRole`/`valueRole` win.
- `it("carries progress through to the content")`: `progress: 0` and `progress: 1` are kept, and an absent progress has no `progress` key.
- `it("renders keyValues when rows is empty")`: `rows: []` with 1 keyValue gives 1 entry.
- `it("keeps rows entries unchanged when keyValues is absent")`: the existing explicit and anonymous row assertions still hold (stable `row_one`, session `…:3:1`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- tests/tui/sidebar-segments.test.ts`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement**

- Add the type and widen the union.
- In `contributionSegments`, branch per panel:
  - `if (panel.keyValues !== undefined)`: `panel.keyValues.forEach((kv, index) => definitions.push({ … }))` with `id: sidebarAnonymousContributionSegmentId(panel.id, panel.generation, index)`, `label: text(panel.title)`, `description: \`Key/value row contributed by ${text(panel.source)}.\``, `defaultPanelId: panel.id`, `persistence: "session"`, `priority: "optional"`and`dropOrder: 24`. Its `resolve` returns:

    ```ts
    {
      kind: "keyValue",
      label: { text: text(kv.label), role: kv.labelRole ?? "muted" },
      value: { text: text(kv.value), role: kv.valueRole ?? panel.role ?? "primary" },
      ...(kv.progress !== undefined ? { progress: kv.progress } : {}),
    }
    ```

  - Otherwise, keep the current `panel.rows.forEach` loop byte for byte.

- In `entryRows` (`src/tui/sidebar-render.ts`), right after the `block` branch, add `if (entry.content.kind === "keyValue") continue;` so the union compiles. Task 3.3 replaces this line.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm test -- tests/tui/sidebar-segments.test.ts tests/tui/sidebar-render.test.ts && pnpm typecheck`
Expected: PASS, exit 0. The Task 3.0 snapshot is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/tui/sidebar-segments.ts src/tui/sidebar-render.ts tests/tui/sidebar-segments.test.ts
git commit -m "feat: add keyValue sidebar segment content"
```

### Task 3.3: Aligned rendering with progress bars

**Files:**

- Modify: `src/tui/sidebar-render.ts` (new exported `renderKeyValueRow`; `entryRows` ~336)
- Test: `tests/tui/sidebar-render.test.ts`

**Interfaces:**

- Consumes: `SidebarKeyValueContent` (Task 3.2), `Palette`/`createPalette` (already exported from `src/tui/sidebar-palette.ts`).
- Produces: `export function renderKeyValueRow(content: SidebarKeyValueContent, width: number, palette: Palette): string`.

- [ ] **Step 1: Write the failing tests**

Unit tests call `renderKeyValueRow` directly, with `const plain = createPalette(noColorTheme(), false)` and `kv(label, value, progress?)` building a `SidebarKeyValueContent` with roles `muted`/`primary`:

- `it("left-aligns the label and right-aligns the value at the width")`: `kv("CPU", "42%")` at 20 gives `"CPU" + " ".repeat(14) + "42%"`.
- `it("draws a proportional bar with one space on each side when at least 4 columns fit")`: `kv("CPU", "50%", 0.5)` at 20. The bar width is `20 - 3 - 3 - 2 = 12`, so the row is `"CPU " + "█".repeat(6) + "░".repeat(6) + " 50%"`.
- `it("draws all-empty at 0 and all-filled at 1")`.
- `it("omits the bar when fewer than 4 columns fit")`: `kv("CPU", "50%", 0.5)` at 11, which leaves a bar width of 3. The row has no `█`/`░` and `visibleWidth` is 11.
- `it("never exceeds the width and keeps the value when the label is wide")`: label `"長いラベル名前テスト"` (20 columns), value `"123456"`. At 12 the row is `"長い… 123456"`, and at 20 it is `"長いラベル名… 123456"`. At 8 the value is truncated too (`"1234…"`), because the label keeps its reserve of `floor(8 / 3) = 2` columns, and `visibleWidth` stays 8. Emoji `"😀😀😀😀"` with `"値値値値値値"` at 9 gives `visibleWidth <= 9`.
- `it("truncates an overlong value with a single-column ellipsis and no escape codes")`: value `"x".repeat(40)` at 20 gives `"CPU " + "x".repeat(15) + "…"`. It does not contain `"..."` or `"\x1b"`.
- `it("returns an empty string at width 0")`.
- `it("paints label, bar and value in their roles")`: a tagging palette `{ paint: (r, t) => \`<${r}>${t}</${r}>\` }`gives a label in`<muted>`, filled cells and value in the value role, and the track in `<dim>`.

Integration tests through `render(...)` use `colorEnabled: false`:

- `it("renders a registered keyValues panel inside its frame")`: build the panel through `createSidebarPanelRegistry().register({ id: "ext:kv", title: "kv", rows: ["fallback"], keyValues: [{ label: "CPU", value: "42%", progress: 0.42 }] })`, then `registry.get("ext:kv")`. Make the panel visible as in "renders a contributed panel with its own title". The output contains `CPU`, `42%` and `█`, does not contain `fallback`, and has no `\x1b`.
- `it("falls back to rows byte-identically when keyValues is malformed")`: register the Task 3.0 `contributedPanel()` contribution (id, title, rows, role) with `keyValues: [{}] as never` through the registry. Its rendered lines equal those of the same panel without `keyValues`. Sanitization only happens in the registry, so the panel must go through `register` to exercise the fallback.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- tests/tui/sidebar-render.test.ts`
Expected: the new tests FAIL. The Task 3.0 snapshot still PASSES.

- [ ] **Step 3: Implement `renderKeyValueRow`**

Layout. Atelier's `labeledRow` is the model. _(The glyphs and the label reserve are builder's calls within the spec.)_

```ts
const BAR_FILLED = "█";
const BAR_EMPTY = "░";
const MIN_BAR_WIDTH = 4;

/** Truncate to `max` columns with a one-column ellipsis; unlike truncateToWidth, it adds no reset codes. */
function fitToWidth(text: string, max: number): string {
  if (max <= 0) return "";
  if (visibleWidth(text) <= max) return text;
  return `${sliceByColumn(text, 0, max - 1, true)}…`;
}

export function renderKeyValueRow(
  content: SidebarKeyValueContent,
  width: number,
  palette: Palette,
): string {
  const safeWidth = Math.max(0, Math.trunc(width));
  if (safeWidth === 0) return "";
  // Reserve up to a third of the row for the label, so the value keeps priority but never hides the label.
  const labelReserve = Math.min(
    visibleWidth(content.label.text),
    Math.max(1, Math.floor(safeWidth / 3)),
  );
  const value = fitToWidth(
    content.value.text,
    Math.max(1, safeWidth - labelReserve - 1),
  );
  const label = fitToWidth(
    content.label.text,
    Math.max(0, safeWidth - visibleWidth(value) - 1),
  );
  const gap = Math.max(
    0,
    safeWidth - visibleWidth(label) - visibleWidth(value),
  );
  const barWidth = gap - 2;
  let middle = " ".repeat(gap);
  if (content.progress !== undefined && barWidth >= MIN_BAR_WIDTH) {
    const filled = Math.round(content.progress * barWidth);
    middle = ` ${palette.paint(content.value.role, BAR_FILLED.repeat(filled))}${palette.paint("dim", BAR_EMPTY.repeat(barWidth - filled))} `;
  }
  return `${palette.paint(content.label.role, label)}${middle}${palette.paint(content.value.role, value)}`;
}
```

Add `sliceByColumn` to the existing `@earendil-works/pi-tui` import. Every case listed in Step 1 was checked against pi-tui 1.5.2 while this plan was being revised.

Under `NO_COLOR` the palette returns plain text, so the bar is plain `█`/`░`, as the spec requires.

In `entryRows`, replace the Task 3.2 guard with:

```ts
if (entry.content.kind === "keyValue") {
  rows.push(renderKeyValueRow(entry.content, contentWidth, palette));
  continue;
}
```

`contentWidth` here is already the panel's inner width (`renderPanels` passes `width - 4`).

- [ ] **Step 4: Run tests and the full check**

Run: `pnpm test -- tests/tui/sidebar-render.test.ts && pnpm check`
Expected: PASS. The Task 3.0 snapshot and every pre-existing test pass unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/tui/sidebar-render.ts tests/tui/sidebar-render.test.ts
git commit -m "feat: render aligned key/value rows with progress bars"
```

### Task 3.4: Docs and release 0.8.0

**Files:** `README.md` ("Contributing panels", ~241), `CHANGELOG.md`, `package.json`

- [ ] **Step 1: Document**

README "Contributing panels" is a single paragraph today. Extend it with:

- one `registerSidebarPanel(pi, { id, title, rows, keyValues })` example in which `rows` mirrors the key/values as plain text;
- a fields table: `label` and `value` (required strings); `labelRole` (default `muted`); `valueRole` (default the panel `role`, else `primary`); `progress` (number from `0` to `1`; a bar is drawn when at least 4 columns fit);
- the limits: at most 24 entries (`SIDEBAR_PANEL_MAX_ROWS`), each label and value at most 160 visible characters;
- the fallback rule: "Keep `rows` as the fallback. Older pi-status versions, and any invalid `keyValues` list, render `rows`.";
- the identity note: key/value rows are session-only, so per-row moves in the Sidebar tab do not survive content updates.

CHANGELOG: `## 0.8.0 - <release date>`, under `### Added`: "`keyValues` on contributed sidebar panels: aligned label/value rows with optional progress bars. `rows` stays required as the fallback, and the protocol version is unchanged."

- [ ] **Step 2: Version and release check**

Set `package.json` `version` to `0.8.0`. Run `pnpm release:check`.
Expected: exit 0, and both verify messages are printed.

- [ ] **Step 3: Commit, PR, tag**

```bash
git add README.md CHANGELOG.md package.json
git commit -m "chore: release v0.8.0"
git push -u origin HEAD
```

Open the PR. After merge: `git tag v0.8.0 && git push origin v0.8.0`.

---

## Phase 4 — Auto sidebar, saved width, toggle key (release 0.9.0)

> Superseded 2026-11-14 after checking against `v0.8.0`: execute `2026-11-14-atelier-parity-phase-4-auto-sidebar.md` instead. That file's "Revision notes" list what changed, including cutting `toggleShortcut`. The tasks below are kept for history.

**Goal:** the sidebar can collapse and reopen with terminal width (opt-in), remembers its width across sessions, and can be toggled from a configurable key.

**Architecture:** Three new optional config keys are normalized in `src/core/config.ts`. The split pane gains a mode and a hysteresis flag that is updated only at render time, plus an `onResizeCommit` callback fired on Enter or mouse release. The sidebar controller forwards mode and width. `src/index.ts` registers the toggle shortcut once, keeps a session-scoped visibility override, and persists the width on commit. The Settings tab gains one row.

**Branch:** `20261114-auto-sidebar`

### Phase 4 Review Focus

- Thresholds at `sidebarWidth = 44`: visible at 124, collapses at 123, stays collapsed at 131, reopens at 132. Test in Task 4.2.
- A hand-edited `statusline.json` with `"sidebarWidth": "50"`, `50.5`, `10` or `500`: these normalize to 44, 44, 28 and 72. Test in Task 4.1.
- A mouse release that does not end a drag does not persist anything. Test in Task 4.2.
- A toggle hide survives `session_tree` and `/statusline` saves that do not change `sidebarEnabled`. Test in Task 4.4.
- `toggleShortcut` that Pi rejects (registration throws): one warning at the first `session_start`, and the extension still loads. Test in Task 4.4.

### Task 4.1: Config keys

**Files:**

- Modify: `src/shared/types.ts` (`PiStatusConfig` ~224)
- Modify: `src/core/config.ts`: `DEFAULT_CONFIG` (~42), `cloneDefaultConfig`, `normalizeConfig` (~256), `saveConfig` (~339)
- Test: `tests/core/config.test.ts`

**Interfaces:**

- Produces:

```ts
export type SidebarMode = "manual" | "auto"; // src/shared/types.ts
// PiStatusConfig gains: sidebarMode: SidebarMode; sidebarWidth: number; toggleShortcut: string;
```

Defaults: `"manual"`, `44`, `""`. Width bounds come from `MIN_SIDEBAR_WIDTH`/`MAX_SIDEBAR_WIDTH`/`DEFAULT_SIDEBAR_WIDTH` in `src/tui/split-pane.ts`, imported into config.

- [ ] **Step 1: Write the failing tests**

- `it("defaults sidebarMode, sidebarWidth and toggleShortcut")`: `loadConfig` with no file → `"manual"`, `44`, `""`.
- `it.each([["auto","auto"],["manual","manual"],["AUTO","manual"],[1,"manual"],[null,"manual"]])("normalizes sidebarMode %p")`.
- `it.each([[50,50],[28,28],[72,72],[10,28],[500,72],[50.5,44],["50",44],[NaN,44],[null,44]])("normalizes sidebarWidth %p")`.
- `it.each([[" Ctrl+T ","ctrl+t"],["",""],[5,""],[null,""]])("normalizes toggleShortcut %p")`.
- `it("persists the three keys through saveConfig")`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- tests/core/config.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

Normalization rules:

- `sidebarMode` is `"auto"` only for the exact string, otherwise `"manual"`.
- `sidebarWidth`: `Number.isInteger(v)` → clamp to 28..72; anything else → 44. _(Builder's call: clamp out-of-range integers, default everything else.)_
- `toggleShortcut`: string → `trim().toLowerCase()`, otherwise `""`.

Add all three to the defaults, the clone and the `saveConfig` object. Fix compile errors in test fixtures that build a full `PiStatusConfig` (`tests/helpers.ts` `withDefaults`, if typed).

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm test -- tests/core/config.test.ts && pnpm typecheck`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/core/config.ts tests/
git commit -m "feat: add sidebarMode, sidebarWidth and toggleShortcut config"
```

### Task 4.2: Split-pane auto mode and resize commit

**Files:**

- Modify: `src/tui/split-pane.ts` (options ~38, controller interface ~54, `visibleAt` ~142, `stopResize` ~155, `wrappedRender` ~188)
- Test: `tests/tui/split-pane.test.ts`

**Interfaces:**

- Consumes: `SidebarMode` (Task 4.1).
- Produces:

```ts
export const AUTO_MAIN_WIDTH = 80;
export const AUTO_REOPEN_MARGIN = 8;
export function autoSidebarVisible(
  terminalWidth: number,
  sidebarWidth: number,
  wasVisible: boolean,
): boolean;
// SplitPaneControllerOptions gains: mode?: SidebarMode; onResizeCommit?(width: number): void;
// SplitPaneController gains: setMode(mode: SidebarMode): void; getMode(): SidebarMode;
```

- [ ] **Step 1: Write the failing tests**

- `it.each([[124,true,true],[123,true,false],[131,false,false],[132,false,true]])("autoSidebarVisible(%i, 44, was=%p) → %p")`.
- `it("collapses and reopens with the hysteresis gap in auto mode")`: `harness(124)`, mode auto, show, render → reserved 44. Set columns to 123 and render → base width 123. Set 131 → 131. Set 132 → base width 88.
- `it("keeps manual mode at the existing 92-column threshold")`: unchanged behaviour at 92/91 with default mode.
- `it("stays hidden in auto mode after hide even when the terminal grows")`: hide, set columns to 200 → base width 200.
- `it("resets the hysteresis state when switching to auto")`.
- `it("fires onResizeCommit with the width on Enter")`: begin resize, `left` ×3, `enter` → called once with 47.
- `it("fires onResizeCommit on mouse release after a drag")`.
- `it("does not fire onResizeCommit on Escape, on hide, or on a release without a drag")`.
- `it("does not fire onResizeCommit when a terminal shrink cancels the resize")`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- tests/tui/split-pane.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

- `autoSidebarVisible`: `wasVisible ? tw >= 80 + sw : tw >= 80 + sw + 8`.
- State `mode` (from options, default `"manual"`) and `autoVisible = true`.
- At the top of `wrappedRender`, when `mode === "auto"`: `autoVisible = autoSidebarVisible(terminalWidth, sidebarWidth, autoVisible)`.
- `visibleAt(tw)` returns `enabled && Number.isFinite(tw) && (mode === "auto" ? autoVisible : tw >= minimumMain + minimumSidebar)`. In auto mode it reports the state from the last render; comment this.
- `setMode` sets `autoVisible = true` and calls `requestRender()`.
- `stopResize(restore)`: when `!restore` and a resize was active, call `options.onResizeCommit?.(sidebarWidth)` inside `safely`, after resetting state.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- tests/tui/split-pane.test.ts`. Expected: PASS, including all existing tests.

- [ ] **Step 5: Commit**

```bash
git add src/tui/split-pane.ts tests/tui/split-pane.test.ts
git commit -m "feat: add auto sidebar mode and resize commit to split pane"
```

### Task 4.3: Sidebar controller plumbing

**Files:**

- Modify: `src/tui/sidebar.ts` (options ~18, interface ~28, `createSplitPaneController` call ~47)
- Test: `tests/tui/sidebar.test.ts`

**Interfaces:**

- Consumes: Task 4.2.
- Produces: `SidebarControllerOptions` gains `sidebarMode?: SidebarMode; sidebarWidth?: number; onResizeCommit?(width: number): void`. `SidebarController` gains `setMode(mode: SidebarMode): void`.

- [ ] **Step 1: Write the failing tests**

- `it("starts at the configured sidebarWidth")`: `sidebarWidth: 50` at 200 columns → `getEffectiveWidth() === 50`.
- `it("forwards setMode to the split pane")`: auto mode at 123 columns with width 44, after a render → `isEffectivelyVisible() === false`.
- `it("forwards resize commits")`.

- [ ] **Step 2: Run, implement, run**

Run: `pnpm test -- tests/tui/sidebar.test.ts`. Expected: FAIL. Forward `defaultSidebarWidth`, `mode` and `onResizeCommit` to `createSplitPaneController`, and implement `setMode: (m) => split.setMode(m)`. Re-run. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/tui/sidebar.ts tests/tui/sidebar.test.ts
git commit -m "feat: pass sidebar mode and width through the sidebar controller"
```

### Task 4.4: Extension wiring, Settings row, toggle key

**Files:**

- Modify: `src/index.ts`: `registerShortcut("ctrl+shift+r")` (~144), `saveAndApplyConfig` (~159), `applySurfaceVisibility` (~336), `session_start` (~479, controller creation ~512)
- Modify: `src/tui/dashboard-state.ts` (row union ~83, settings rows ~420, activation ~817)
- Modify: `src/tui/dashboard-render.ts` (~312)
- Create: `tests/index-sidebar-mode.test.ts`
- Test: `tests/tui/dashboard-state.test.ts`, `tests/tui/dashboard-render.test.ts`

**Interfaces:**

- Consumes: Tasks 4.1–4.3.
- Produces (closure state in `createExtension`):
  - `sidebarVisibilityOverride: boolean | undefined`. It resets at `session_start`, and on a `/statusline` save whose `sidebarEnabled` differs from the previous config. _(Builder's call: the toggle is a session override of `sidebarEnabled`.)_
  - `toggleShortcutWarning: string | undefined`, notified once at the first `session_start`.
  - `persistSidebarWidth(width: number): void`.
  - Settings row `{ type: "sidebar_mode" }`.

- [ ] **Step 1: Write the failing extension tests** (`tests/index-sidebar-mode.test.ts`, using `tests/helpers.ts` and the temp `PI_CODING_AGENT_DIR` pattern from `tests/index-workspace-pulse.test.ts`)

- `it("shows an info notice and does not begin a resize in auto mode")`: config `sidebarMode: "auto"`. Invoke the `ctrl+shift+r` handler → `notify` called with `(expect.stringContaining("auto"), "info")`, and the controller's `beginResize` is not called.
- `it("persists sidebarWidth to statusline.json when a resize is committed")`: capture `onResizeCommit` from the controller options (spy on `createSidebarController`, or drive a fake TUI). Commit 50 → the file has `sidebarWidth: 50` and other keys are unchanged.
- `it("does not write the file when the committed width equals the saved width")`.
- `it("reports a warning when persisting the width fails")`: malformed existing file → `notify(…, "warning")`.
- `it("registers the toggle shortcut from config once at load")`: config `toggleShortcut: "ctrl+t"` → `registerShortcut` called with `"ctrl+t"`.
- `it("ignores an empty toggleShortcut silently")`: only `ctrl+shift+r` registered, no warning.
- `it("ignores ctrl+shift+r as toggleShortcut with one warning at session_start")`.
- `it("warns once when registering the toggle shortcut throws")`.
- `it("toggle is a no-op with an info notice when the sidebar cannot display")`: rpc ctx, and a tui ctx whose controller reports `isSupported() === false`. `isShown()` is unchanged.
- `it("toggle hide survives session_tree and unrelated /statusline saves")`.
- `it("a /statusline save that changes sidebarEnabled clears the toggle override")`.

- [ ] **Step 2: Write the failing dashboard tests**

- `dashboard-state.test.ts`: `it("lists sidebar_mode after sidebar_enabled in settings")`; `it("activating sidebar_mode flips manual ↔ auto in the draft")`.
- `dashboard-render.test.ts`: `it("renders the Sidebar mode row with Manual/Auto")`.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test -- tests/index-sidebar-mode.test.ts tests/tui/dashboard-state.test.ts tests/tui/dashboard-render.test.ts`. Expected: FAIL.

- [ ] **Step 4: Implement**

- `ctrl+shift+r` handler: before the visibility check, when `runtimeState.snapshot().config.sidebarMode === "auto"`, notify `"Sidebar resize is off in auto mode. Set Sidebar mode to Manual in /statusline Settings."` as `"info"` and return.
- Toggle registration at load, from `runtimeState.snapshot().config.toggleShortcut`:
  - `""` → skip.
  - `"ctrl+shift+r"` → set the warning `toggleShortcut "ctrl+shift+r" is reserved for sidebar resize and was ignored`.
  - Otherwise `try { pi.registerShortcut(key as KeyId, { description: "Show or hide the pi-status sidebar", handler: toggleSidebar }) } catch (e) { warning = \`Could not register toggleShortcut "${key}": ${message}\` }`.
- `toggleSidebar(ctx)`: same session guards as the resize handler. When `ctx.mode !== "tui"`, or there is no controller, or `!controller.isSupported()`, notify `"pi-status sidebar cannot be shown here"` as `"info"` and return. Otherwise `sidebarVisibilityOverride = !controller.isShown()`, `controller.setShown(sidebarVisibilityOverride)`, `syncWorkspacePulse(config)`, `controller.requestRender()`.
- `createSidebarController` call gets `sidebarMode`, `sidebarWidth` and `onResizeCommit: persistSidebarWidth`.
- `persistSidebarWidth(width)`: return if equal. Otherwise `saveConfig({ ...config, sidebarWidth: width })` then `runtimeState.update({ type: "config_reload", config: next })`. On a throw, notify `Could not save sidebar width: <message>` as `"warning"`.
- `applySurfaceVisibility`: `controller?.setMode(config.sidebarMode)` and `controller?.setShown(sidebarVisibilityOverride ?? config.sidebarEnabled)`.
- `session_start`: reset the override; notify `toggleShortcutWarning` once (module flag).
- Dashboard: a row type plus a settings entry after `sidebar_enabled`. Activation flips `draft.sidebarMode`. Render: `pushSelectable("↔", "Sidebar mode", draft.sidebarMode === "auto" ? "Auto" : "Manual")`. If `color_preset` handles left/right, mirror that.

- [ ] **Step 5: Run the tests and full check**

Run: `pnpm test -- tests/index-sidebar-mode.test.ts tests/tui/dashboard-state.test.ts tests/tui/dashboard-render.test.ts && pnpm check`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts src/tui/dashboard-state.ts src/tui/dashboard-render.ts tests/
git commit -m "feat: wire auto sidebar mode, saved width and toggle shortcut"
```

### Task 4.5: Docs, smoke test, release 0.9.0

**Files:** `README.md` (Sidebar, Configuration), `CHANGELOG.md`, `package.json`

- [ ] **Step 1: Document**

README:

- the config table for `sidebarMode`/`sidebarWidth`/`toggleShortcut` with types and defaults;
- the auto thresholds (`< 80 + width` collapses, `≥ 80 + width + 8` reopens);
- "resize is disabled in auto mode";
- "toggle changes need `/reload`";
- "`ctrl+shift+r` cannot be the toggle key";
- the Settings row.

CHANGELOG `## 0.9.0`, Added.

- [ ] **Step 2: Manual smoke run in a resizable terminal**

`pi -e ./src/index.ts`:

1. In manual mode, resize to 50 and press Enter. Restart Pi: the width is 50.
2. Resize, then Escape: the width reverts and the file is unchanged.
3. Switch Settings → Sidebar mode Auto and save. Narrow the terminal below 130: the sidebar collapses. Widen to 131: still collapsed. Widen to 138+: it reopens.
4. Set `"toggleShortcut": "ctrl+t"` and `/reload`. Ctrl+T hides; widening keeps it hidden; Ctrl+T shows.

- [ ] **Step 3: Version, release check, commit, PR, tag**

Version `0.9.0`. Run: `pnpm release:check`. Expected: exit 0.

```bash
git add README.md CHANGELOG.md package.json
git commit -m "chore: release v0.9.0"
```

After merge, tag `v0.9.0`.

---

## Phase 5 — Fullscreen sidebar (release 0.10.0)

**Goal:** the sidebar is visible beside the chat in Pi's fullscreen mode, with the same panels, mode and keyboard resize as regular mode.

**Architecture:** A new `src/tui/fullscreen-layout.ts` wraps the fullscreen TUI's current layout root in an `HStack` (main, sidebar) via the public `setLayoutRoot()`. It records ownership on the TUI under a `Symbol.for` key, so a later restore only undoes our own root and a second install never stacks. `SplitPaneController.attach` picks this path when `isViewportTUI(tui) && tui.mode === "fullscreen"`, and otherwise keeps the render-wrapping path unchanged. Width, mode, hysteresis and keyboard resize stay in the split pane. The HStack's `visible({ width })` callback replaces the render-time reconcile.

Facts from Pi 1.5.2 source that shape this phase:

- Extensions receive a proxy TUI (`createInteractiveTuiReference`, `tui-renderer.ts:53`), so `layoutRoot` reads and `setLayoutRoot` calls reach the current renderer.
- Pi refuses to switch TUI mode while overlay entries exist (`switchTuiMode`, `interactive-mode.ts:940`). pi-status's hidden lifecycle overlay therefore blocks a mid-session switch, and detecting fullscreen at attach time is sufficient. Task 5.3 confirms this manually.
- Pi already captures the mouse in fullscreen. _(Builder's call: fullscreen ships keyboard-only resize, as the spec's fallback allows. No mouse-reporting writes in fullscreen.)_

**Branch:** `20261114-fullscreen-sidebar`

### Phase 5 Review Focus

- `/reload` in fullscreen: the old instance's `dispose` restores the root, and the new instance wraps Pi's root, not our stale HStack. Test in Task 5.1 (second owner after restore).
- Terminal narrower than 92 columns (manual) or below the auto threshold in fullscreen: the HStack hides the sidebar entry and the main pane gets the full width. Test in Task 5.2.
- A selection that starts outside the transcript (e.g. in the editor) may copy sidebar text, because Pi selects by screen columns there. Check manually in Task 5.3. If it reproduces, document it as a known limitation; atelier patches `getSelectionColumns`, which is out of scope.
- An error thrown inside our sidebar component must not break Pi's layout. `renderSidebar` already returns `"Sidebar unavailable"` rows. Test in Task 5.2.
- The `/statusline` overlay renders above both panes. Check manually in Task 5.3.

### Task 5.1: Fullscreen layout adapter

**Files:**

- Create: `src/tui/fullscreen-layout.ts`
- Test: `tests/tui/fullscreen-layout.test.ts`

**Interfaces:**

- Produces:

```ts
import type { Component, TUI, ViewportTUI } from "@earendil-works/pi-tui";
export function isFullscreenTui(tui: TUI | undefined): tui is ViewportTUI; // isViewportTUI(tui) && tui.mode === "fullscreen"
export interface FullscreenSidebarLayoutOptions {
  tui: ViewportTUI;
  sidebar: Component;
  getSidebarWidth(): number;
  isSidebarVisible(viewportWidth: number): boolean;
  minMainWidth: number;
  minSidebarWidth: number;
  maxSidebarWidth: number;
}
export interface FullscreenSidebarLayout {
  sync(): boolean; // install or rebuild; false when no root or another owner holds it
  restore(): void; // owner-checked
  isInstalled(): boolean;
}
export function createFullscreenSidebarLayout(
  options: FullscreenSidebarLayoutOptions,
): FullscreenSidebarLayout;
```

- [ ] **Step 1: Write the failing tests**

Stub: `{ mode: "fullscreen", [Symbol.for("@earendil-works/pi-tui/viewport")]: true, layoutRoot: main, setLayoutRoot(c) { this.layoutRoot = c }, terminal: { columns: 160, rows: 40 }, requestRender: vi.fn() }`. `main.render(w)` returns `[\`main:${w}\`]` and `sidebar.render(w)` returns `[\`side:${w}\`]`.

- `it("detects fullscreen only for viewport TUIs in fullscreen mode")`: regular stub (no symbol) → false; symbol with `mode: "regular"` → false; fullscreen stub → true.
- `it("wraps the current root in an HStack")`: `sync()` is true, `layoutRoot !== main`, and `layoutRoot.render(160)[0]` contains `main:116` and `side:44`.
- `it("restores the original root")`.
- `it("does not restore when someone else replaced the root")`: after sync, `tui.layoutRoot = other`, then `restore()` → still `other`.
- `it("does not stack on a second sync with the same width")`: the root object is identical after two syncs.
- `it("rebuilds with the new width but keeps the original root")`: width 50 → `side:50`; restore → `main`.
- `it("wraps a replaced root on the next sync")`: replaced by `other`, then sync → the HStack wraps `other`; restore → `other`.
- `it("refuses to wrap a root owned by another live instance")`: instance A syncs, instance B `sync()` → false and the root is unchanged.
- `it("lets a new instance wrap after the previous one restored")` (the `/reload` case).
- `it("hides the sidebar entry when isSidebarVisible is false")`: `render(160)` → `main:160` only.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- tests/tui/fullscreen-layout.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

- State key: `const STATE = Symbol.for("@pi-vault/pi-status/fullscreen-layout")`, storing `{ owner: object; originalRoot: Component; splitRoot: Component; width: number }` on the TUI.
- Read the root via `(tui as unknown as { layoutRoot?: Component }).layoutRoot`, with the comment `// Non-public field; atelier relies on it too. Re-check on Pi upgrades.`
- Split root: `new HStack([{ component: originalRoot, basis: 0, grow: 1, shrink: 1, minSize: minMainWidth }, { component: sidebar, basis: getSidebarWidth(), grow: 0, shrink: 1, minSize: minSidebarWidth, maxSize: maxSidebarWidth, visible: ({ width }) => isSidebarVisible(width) }])`.
- `sync()` rules, in order:
  1. A foreign owner whose `splitRoot` is current → false.
  2. Own state with `splitRoot` current and the same width → true.
  3. Own state with `splitRoot` current and a new width → rebuild from `originalRoot`.
  4. Otherwise, wrap the current root if defined (else false).

  Every install calls `requestRender()`.

- `restore()`: only when `state.owner === me`. Set the original root back only if the current root is our `splitRoot`. Always clear our state.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- tests/tui/fullscreen-layout.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tui/fullscreen-layout.ts tests/tui/fullscreen-layout.test.ts
git commit -m "feat: add owner-checked fullscreen sidebar layout adapter"
```

### Task 5.2: Use the adapter from the split pane and sidebar

**Files:**

- Modify: `src/tui/split-pane.ts` (`attach` ~181, `show`/`hide`/`setSidebarWidth`/`beginResize`/`handleResizeInput`/`dispose`)
- Modify: `src/tui/sidebar.ts` (remove `VIEWPORT_TUI` ~40-43; `supportsSidebar`; resize banner option)
- Modify: `src/tui/sidebar-render.ts` (banner ~417)
- Modify: `src/index.ts` (`saveAndApplyConfig` commit path: call `activeSidebarController?.syncLayout()`)
- Test: `tests/tui/split-pane.test.ts`, `tests/tui/sidebar.test.ts`, `tests/tui/sidebar-render.test.ts`

**Interfaces:**

- Consumes: `isFullscreenTui`, `createFullscreenSidebarLayout` (Task 5.1). Mode, hysteresis and `onResizeCommit` (Phase 4).
- Produces:
  - `SplitPaneController.syncLayout(): void` (no-op in regular mode) and `SplitPaneController.isFullscreen(): boolean`.
  - `SidebarController.syncLayout(): void`.
  - `renderSidebarLines` option `keyboardOnlyResize?: boolean`.

- [ ] **Step 1: Write the failing tests**

`split-pane.test.ts`, `describe("fullscreen")`, using the Task 5.1 stub:

- `it("installs the HStack instead of patching render")`: after `attach` + `show`, `tui.render` is unchanged and `layoutRoot` is wrapped.
- `it("restores the root on hide and re-wraps on show")`.
- `it("restores the root on dispose")`.
- `it("hides the sidebar entry below 92 columns in manual mode and per hysteresis in auto mode")`: render the root at 91 → main only; auto at 123 → main only.
- `it("resizes with arrow keys, rebuilds the HStack, and commits on Enter without mouse sequences")`: `write` is never called with mouse enable/disable sequences, and mouse input is not consumed.
- `it("keeps the regular render-wrapping path for non-viewport TUIs")`: the existing harness still passes (existing tests).

`sidebar.test.ts`:

- `it("supports regular and fullscreen TUIs and rejects a viewport TUI in regular mode")`. Update any existing test that asserted fullscreen is unsupported.
- `it("keeps Pi's layout when the sidebar component throws")`: the `getView` throw path renders `"Sidebar unavailable"` rows inside the HStack.

`sidebar-render.test.ts`:

- `it("shows a keyboard-only resize banner")`: `keyboardOnlyResize: true` → contains `RESIZE · ←/→ Enter/Esc`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- tests/tui/split-pane.test.ts tests/tui/sidebar.test.ts tests/tui/sidebar-render.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

`attach(tui, renderTrailing)`: when `isFullscreenTui(tui)`, create the layout with:

- `sidebar = { render: (w) => renderTrailing?.(w, tui.terminal.rows) ?? [], invalidate() {} }`;
- `getSidebarWidth: () => sidebarWidth`;
- `isSidebarVisible: (w) => { if (mode === "auto") autoVisible = autoSidebarVisible(w, sidebarWidth, autoVisible); reconcileResizeWidth(w); return visibleAt(w); }`;
- the min/max constants.

Do not touch `tui.render`. Then:

- `show()` → `layout.sync()`. `hide()` and `dispose()` → `layout.restore()`.
- `setSidebarWidth` → `layout.sync()` after updating the width.
- `syncLayout()` → `if (enabled) layout?.sync()`.
- If `sync()` throws: `restore()`, `enabled = false`, `onError`.
- `beginResize` in fullscreen skips `tui.terminal.write(ENABLE_MOUSE)`. `handleResizeInput` ignores mouse input (returns `undefined`) in fullscreen.

`sidebar.ts`:

- `supportsSidebar = (tui) => tui !== undefined && (!isViewportTUI(tui) || tui.mode === "fullscreen")`;
- pass `keyboardOnlyResize: split.isFullscreen()` into `renderSidebarLines`;
- add `syncLayout: () => split.syncLayout()`.

`sidebar-render.ts`: the banner text is `"RESIZE · ←/→ Enter/Esc"` when `keyboardOnlyResize`, else unchanged. `index.ts`: call `activeSidebarController?.syncLayout()` after a successful `/statusline` save. `show`/toggle and `session_start` already reach `split.show()`/`attach`.

- [ ] **Step 4: Run the tests and full check**

Run: `pnpm test -- tests/tui/split-pane.test.ts tests/tui/sidebar.test.ts tests/tui/sidebar-render.test.ts && pnpm check`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tui/split-pane.ts src/tui/sidebar.ts src/tui/sidebar-render.ts src/index.ts tests/
git commit -m "feat: show the sidebar in Pi fullscreen mode"
```

### Task 5.3: Manual verification, docs, release 0.10.0

**Files:** `README.md` (Sidebar), `CHANGELOG.md`, `package.json`

- [ ] **Step 1: Manual verification in Pi 1.5.2 fullscreen**

Set Pi's TUI mode to fullscreen in settings, restart, then run `pi -e ./src/index.ts`. Confirm each:

1. The sidebar is visible beside the transcript at ≥ 92 columns and hides when narrower.
2. Wheel scroll and drag selection inside the transcript work and do not copy sidebar text.
3. A selection that starts in the editor: note whether sidebar text is copied (Review Focus).
4. `/statusline` opens above both panes; saving re-wraps without stacking (the sidebar appears once).
5. Ctrl+Shift+R, arrows, Enter: the width changes and persists. Escape reverts.
6. Auto mode collapses and reopens per Phase 4 thresholds.
7. `/reload`: exactly one sidebar, with no gap where an old one was.
8. Pi Settings → TUI mode → regular, with the sidebar mounted: expect "Close active overlays before changing TUI mode". If Pi instead switches, confirm that no stale HStack remains and the regular sidebar appears after `/reload`, and record the result in the CHANGELOG.

- [ ] **Step 2: Document**

README Sidebar: replace "Fullscreen and viewport TUIs do not render the Sidebar" with the fullscreen behaviour, keyboard-only resize in fullscreen, and any limitation found in Step 1 (editor-start selection, mode switching). CHANGELOG `## 0.10.0`, Added.

- [ ] **Step 3: Version, release check, commit, PR, tag**

Version `0.10.0`. Run: `pnpm release:check`. Expected: exit 0.

```bash
git add README.md CHANGELOG.md package.json
git commit -m "chore: release v0.10.0"
```

After merge, tag `v0.10.0`.
