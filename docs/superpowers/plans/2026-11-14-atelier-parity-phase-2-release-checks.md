# Atelier Parity Phase 2 — Release verification (release 0.7.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Parent plan:** `docs/superpowers/plans/2026-11-14-atelier-parity.md` (this file is Phase 2, copied verbatim)

**Spec:** `docs/superpowers/specs/2026-11-14-atelier-parity-design.md` (section "Phase 2")

**Tech Stack:** TypeScript 7, pnpm, Biome, vitest, `@earendil-works/pi-coding-agent` / `@earendil-works/pi-tui` 1.5.2, Node ≥ 24.15.0.

**Prerequisite:** Phase 1 is merged to `master`.

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
