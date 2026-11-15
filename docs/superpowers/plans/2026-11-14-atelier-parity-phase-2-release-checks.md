# Atelier Parity Phase 2 — Release verification (release 0.7.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Parent plan:** `docs/superpowers/plans/2026-11-14-atelier-parity.md`. This file replaces the parent's Phase 2 section. It was re-verified against `master` @ `ed023a8` (v0.6.1), Pi source `v1.5.2`, and atelier @ `a799be1` on 2026-11-14. Both scripts below were run in a trial against the working tree; see "Verification notes".

**Spec:** `docs/superpowers/specs/2026-11-14-atelier-parity-design.md` (section "Phase 2"). One spec claim is weaker than stated (optional peers); this plan corrects it.

**Tech Stack:** Node ≥ 24.15.0 ESM scripts (no dependencies), pnpm (local 12.9.1, CI 11.21.0), npm 12, Biome 2.6.7, `@earendil-works/pi-coding-agent` 1.5.2 (dev dependency, provides the loader).

**Prerequisite:** Phase 1 is merged to `master` (done: PR #97, v0.6.1). Baseline `pnpm check` is green.

## Global Constraints

- No dependency version changes in this phase. `peerDependencies` stay `"*"`; `@pi-vault/pi-usage` stays a regular `dependency`; `engines.node` stays `">=24.15.0"`.
- Scripts are dependency-free `.mjs` files in `scripts/`, 2-space Biome style, double quotes, semicolons.
- No `src/` or `tests/` changes. No runtime behaviour changes.
- Per phase: branch from `master`; update `CHANGELOG.md` and the affected README sections; bump `package.json` version; `pnpm release:check` passes; PR, merge, tag `vX.Y.Z` (`release.yml` publishes).

## Verification notes (2026-11-14)

What the old plan got right, and what changed:

| Claim                                                                              | Result                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm pack --json` shape differs between pnpm 12 and 11.21.0                       | **False.** Both print one object `{ name, version, filename, files: [{ path }] }`. Atelier's array/object handling (`npm-run.mjs`) is for npm 12, not pnpm; do not port it.                                                                                                                                                                |
| `filename` may be relative or absolute                                             | **True.** `--dry-run` prints a bare name; `--pack-destination <dir>` prints an absolute path (both pnpm versions). Keep the `isAbsolute` check.                                                                                                                                                                                            |
| Pi's npm flags are at `package-manager.ts:2007`                                    | Line 2007 is the **git-source** install. npm-source installs (`getNpmInstallArgs`, line 2041) use `install <spec> --prefix <root> --legacy-peer-deps --no-audit --no-fund` — no `--omit=dev`. A tarball has no devDependencies, so the result is identical. Cite the function, not a line.                                                 |
| Consumer lock = exactly pi-status + pi-usage                                       | **True** (trial: 2 packages added, lock keys `node_modules/@pi-vault/pi-status`, `node_modules/@pi-vault/pi-usage`).                                                                                                                                                                                                                       |
| `loadExtensions(paths, cwd)` from `dist/core/extensions/loader.js`                 | **True** in 1.5.2 (signature `(paths, cwd, eventBus?, runtime?)`). Trial: `errors: []`, 1 extension, commands `["statusline"]`.                                                                                                                                                                                                            |
| `pnpm format:check && pnpm lint` checks the new scripts                            | **False.** `biome.json` `files.includes` only covers `src/**/*.ts` and `tests/**/*.ts`. Add `scripts/**/*.mjs` (trial: both scripts pass format and lint).                                                                                                                                                                                 |
| `peerDependenciesMeta` optional ⇒ "a non-Pi `npm install` never pulls a second Pi" | **False today.** `@pi-vault/pi-usage@0.7.1` declares the same peers as required, so a plain `npm install` of the tarball still installs Pi (126 packages, 8 `@earendil-works/*`). Decision: add the field anyway (matches atelier; effective once pi-usage follows) and state the limit in CHANGELOG. Follow-up in pi-usage, out of scope. |
| `peerDependenciesMeta` needs a lockfile change                                     | **No.** `pnpm install --frozen-lockfile` passes with the field added.                                                                                                                                                                                                                                                                      |
| Task 2.2 Step 4 probe: "revert with `git checkout package.json`"                   | **Bug.** That discards the uncommitted Step 1/3 edits. Use a backup copy (below).                                                                                                                                                                                                                                                          |
| Remove `pack:dry-run` in Task 2.1                                                  | **Ordering bug.** `release.yml` and README still call it until Task 2.3. Remove it in Task 2.3 together with its callers.                                                                                                                                                                                                                  |
| Untracked `src/untracked-probe.ts` fails verify:pack                               | **True** (trial: `Unexpected: src/untracked-probe.ts`).                                                                                                                                                                                                                                                                                    |
| Loader-path failure gives a named error                                            | **True** (trial with a bad path: `Cannot load Pi's extension loader from …; update the deep import for this Pi version`).                                                                                                                                                                                                                  |
| Other gaps                                                                         | `quality.yml` does not run `format:check` today. Out of scope; noted, not changed.                                                                                                                                                                                                                                                         |

## Phase 2 — Release verification (release 0.7.0)

**Goal:** every release is proven to pack exactly the right files, install cleanly the way Pi installs it, and load in Pi's real extension loader.

**Architecture:** Two dependency-free Node scripts in `scripts/`, modelled on atelier's but calling `pnpm pack` directly. `verify-pack` diffs `pnpm pack --dry-run --json` against `package.json` + `git ls-files -- <files>`. `verify-install` packs a tarball, installs it with Pi's npm flags into a temp consumer, asserts the lockfile, and loads the entry with Pi's loader from the dev dependency. `release:check` runs both; `quality.yml` runs `verify:pack`; `release.yml` runs `release:check`.

**Branch:** `20261114-pi-atelier-parity-phase-2-release-checks` (already exists; contains only this plan update on top of `master`).

### Review focus

- A Pi upgrade can move `dist/core/extensions/loader.js`. The script must fail with the named error, not a bare module-not-found.
- `verify:pack` fails on any untracked file under a `files` entry (`src/`, `docs/assets/`). That is intended; release from a clean tree.
- `verify:install` needs network access to the npm registry (to fetch `@pi-vault/pi-usage`). CI has it.
- `peerDependenciesMeta` is not effective until pi-usage marks its Pi peers optional. CHANGELOG must not claim otherwise.

### Task 2.1: `verify:pack` and Biome coverage

**Files:**

- Create: `scripts/verify-pack.mjs`
- Modify: `biome.json` (`files.includes`), `package.json` (`scripts.verify:pack`)

**Interfaces:**

- Produces: `pnpm verify:pack`. Exits 0 and prints `Package contents verified (<n> files)`, or exits 1 with an error listing `Missing:` and `Unexpected:` paths.

- [ ] **Step 1: Extend Biome to scripts**

In `biome.json`:

```json
"includes": ["src/**/*.ts", "tests/**/*.ts", "scripts/**/*.mjs", "!**/node_modules"]
```

- [ ] **Step 2: Write `scripts/verify-pack.mjs`**

```js
// The packed file set must be exactly package.json plus the tracked files named by `files`.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoDir = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const report = JSON.parse(
  execFileSync("pnpm", ["pack", "--dry-run", "--json"], {
    cwd: repoDir,
    encoding: "utf8",
  }),
);
const packed = new Set(report.files.map((file) => file.path));
const tracked = execFileSync("git", ["ls-files", "--", ...pkg.files], {
  cwd: repoDir,
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean);
const expected = new Set(["package.json", ...tracked]);
const missing = [...expected].filter((path) => !packed.has(path));
const unexpected = [...packed].filter((path) => !expected.has(path));
if (missing.length > 0 || unexpected.length > 0) {
  throw new Error(
    `Package contents differ from package.json files.\nMissing: ${missing.join(", ") || "none"}\nUnexpected: ${unexpected.join(", ") || "none"}`,
  );
}
console.log(`Package contents verified (${packed.size} files)`);
```

- [ ] **Step 3: Wire the script**

In `package.json` `scripts`, add `"verify:pack": "node scripts/verify-pack.mjs"` after `pack:dry-run`. Keep `pack:dry-run` for now (Task 2.3 removes it with its callers).

- [ ] **Step 4: Verify it passes**

Run: `pnpm verify:pack`
Expected: `Package contents verified (38 files)` (count at v0.6.1), exit 0.

- [ ] **Step 5: Verify it catches an untracked file**

Run: `touch src/untracked-probe.ts; pnpm verify:pack; echo "exit=$?"; rm src/untracked-probe.ts`
Expected: error containing `Unexpected: src/untracked-probe.ts`, non-zero exit.

- [ ] **Step 6: Lint and commit**

Run: `pnpm format:check && pnpm lint`. Expected: exit 0, and the reported file count rises by 1 (the new script is checked).

```bash
git add biome.json scripts/verify-pack.mjs package.json
git commit -m "build: verify packed file set"
```

### Task 2.2: `verify:install` and optional peers

**Files:**

- Create: `scripts/verify-install.mjs`
- Modify: `package.json` (`scripts.verify:install`, `peerDependenciesMeta`)

**Interfaces:**

- Produces: `pnpm verify:install`. Exits 0 and prints `Package install verified (statusline command registered)`.

- [ ] **Step 1: Add `peerDependenciesMeta`** after `peerDependencies`:

```json
"peerDependenciesMeta": {
  "@earendil-works/pi-coding-agent": { "optional": true },
  "@earendil-works/pi-tui": { "optional": true }
}
```

Run `pnpm install --frozen-lockfile`. Expected: exit 0, no lockfile change.

- [ ] **Step 2: Write `scripts/verify-install.mjs`**

```js
// Install the packed tarball the way Pi does, then load it with Pi's real extension loader.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoDir = fileURLToPath(new URL("..", import.meta.url));
const loaderPath =
  "../node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js";
const expectedPackages = [
  "node_modules/@pi-vault/pi-status",
  "node_modules/@pi-vault/pi-usage",
];
const tempDir = mkdtempSync(join(tmpdir(), "pi-status-verify-"));

try {
  const report = JSON.parse(
    execFileSync("pnpm", ["pack", "--pack-destination", tempDir, "--json"], {
      cwd: repoDir,
      encoding: "utf8",
    }),
  );
  const tarball = isAbsolute(report.filename)
    ? report.filename
    : join(tempDir, report.filename);
  const consumerDir = join(tempDir, "consumer");
  mkdirSync(consumerDir);
  writeFileSync(
    join(consumerDir, "package.json"),
    JSON.stringify({ name: "pi-status-install-check", private: true }),
  );
  // Same flags as Pi's npm install (packages/coding-agent/src/core/package-manager.ts).
  execFileSync(
    "npm",
    [
      "install",
      "--omit=dev",
      "--legacy-peer-deps",
      "--no-audit",
      "--no-fund",
      tarball,
    ],
    { cwd: consumerDir, stdio: ["ignore", "ignore", "inherit"] },
  );

  const lock = JSON.parse(
    readFileSync(join(consumerDir, "package-lock.json"), "utf8"),
  );
  const installed = Object.keys(lock.packages)
    .filter((path) => path !== "")
    .sort();
  const unexpected = installed.filter(
    (path) => !expectedPackages.includes(path),
  );
  const missing = expectedPackages.filter((path) => !installed.includes(path));
  assert.deepEqual(
    { missing, unexpected },
    { missing: [], unexpected: [] },
    `Installed package set differs.\nMissing: ${missing.join(", ") || "none"}\nUnexpected: ${unexpected.join(", ") || "none"}`,
  );

  process.env.PI_CODING_AGENT_DIR = join(tempDir, "agent");
  // Pi's package index does not export the loader; this deep import may need updating on Pi upgrades.
  let loadExtensions;
  try {
    ({ loadExtensions } = await import(loaderPath));
  } catch (error) {
    throw new Error(
      `Cannot load Pi's extension loader from ${loaderPath}; update the deep import for this Pi version`,
      { cause: error },
    );
  }
  const packageDir = join(
    consumerDir,
    "node_modules",
    "@pi-vault",
    "pi-status",
  );
  const manifest = JSON.parse(
    readFileSync(join(packageDir, "package.json"), "utf8"),
  );
  const entries = manifest.pi.extensions.map((path) => join(packageDir, path));
  const result = await loadExtensions(entries, consumerDir);
  assert.deepEqual(
    result.errors,
    [],
    "Packed extension failed to load in Pi's extension loader",
  );
  assert.equal(result.extensions.length, entries.length);
  assert.ok(
    result.extensions.some((extension) => extension.commands.has("statusline")),
    "pi-status did not register /statusline",
  );
  console.log("Package install verified (statusline command registered)");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
```

- [ ] **Step 3: Wire the script and run it**

Add `"verify:install": "node scripts/verify-install.mjs"` after `verify:pack`. Run: `pnpm verify:install`.
Expected: `Package install verified (statusline command registered)`, exit 0. No `pi-status-verify-*` dir left in `$TMPDIR`.

- [ ] **Step 4: Prove the lockfile assertion bites**

```bash
cp package.json /tmp/pi-status-package.json.bak
node -e 'const p=require("./package.json");p.dependencies["left-pad"]="^1.3.0";require("fs").writeFileSync("package.json",JSON.stringify(p,null,2)+"\n")'
pnpm verify:install; echo "exit=$?"
cp /tmp/pi-status-package.json.bak package.json && git diff --stat package.json
```

Expected: `Unexpected: node_modules/left-pad`, non-zero exit; afterwards `package.json` still has the Step 1/3 edits and no `left-pad`.

- [ ] **Step 5: Prove the loader error is named**

Temporarily change `loader.js` to `missing.js` in `loaderPath`, run `pnpm verify:install`, then change it back.
Expected: `Cannot load Pi's extension loader from ../node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/missing.js; update the deep import for this Pi version`. Confirm `git diff scripts/` is empty against the Step 2 content before committing.

- [ ] **Step 6: Lint and commit**

```bash
pnpm format:check && pnpm lint
git add scripts/verify-install.mjs package.json
git commit -m "build: verify packed install loads in Pi's extension loader"
```

### Task 2.3: Wire release check and CI; release 0.7.0

**Files:**

- Modify: `package.json` (`release:check`, remove `pack:dry-run`, version), `.github/workflows/quality.yml`, `.github/workflows/release.yml`, `README.md` (Development & Verification), `CHANGELOG.md`

- [ ] **Step 1: Update scripts**

- `"release:check": "pnpm check && pnpm verify:pack && pnpm verify:install"`
- Remove `"pack:dry-run"`. Then `grep -rn "pack:dry-run" --exclude-dir=node_modules --exclude-dir=docs .` must only show hits fixed in Steps 2–3.

- [ ] **Step 2: Update CI**

- `quality.yml`: after `Test`, add:

  ```yaml
  - name: Verify package contents
    run: pnpm verify:pack
  ```

- `release.yml`: replace the `Check` step (`pnpm check`) and the `Pack dry run` step (`pnpm run pack:dry-run`) with:

  ```yaml
  - name: Release check
    run: pnpm release:check
  ```

  Keep `Verify tag matches package version` and `Publish to npm` unchanged and after it.

- [ ] **Step 3: README**

In `## Development & Verification`, replace `pnpm run pack:dry-run` with `pnpm verify:pack` and `pnpm verify:install`, and add one sentence: `release:check` runs `check`, then verifies the packed file set and that the packed tarball installs with Pi's npm flags and loads in Pi's extension loader.

- [ ] **Step 4: CHANGELOG and version**

Bump `package.json` version to `0.7.0`. Add at the top of `CHANGELOG.md`, matching the existing format:

```markdown
## 0.7.0 - <release date>

### Added

- Release verification: `pnpm verify:pack` checks the packed file set against the tracked files listed in `package.json` `files`; `pnpm verify:install` installs the packed tarball with Pi's npm flags and loads it in Pi's extension loader. Both run in `pnpm release:check`, and the release workflow runs it before publishing.

### Compatibility

- Marked the `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` peers optional. Pi installs are unchanged. A plain `npm install` of pi-status still installs Pi through `@pi-vault/pi-usage`'s required peers until pi-usage marks them optional.
```

- [ ] **Step 5: Verify**

Run: `pnpm release:check`. Expected: exit 0; output includes `Package contents verified (38 files)` (`scripts/` is not in `files`, so the count is unchanged) and `Package install verified (statusline command registered)`.

- [ ] **Step 6: Commit, PR, tag**

```bash
git add package.json .github/workflows README.md CHANGELOG.md
git commit -m "chore: release v0.7.0"
```

The PR's `Quality` run must show `Verify package contents` passing. After merge, tag `v0.7.0` on the merge commit and confirm `release.yml` ran `Release check` (both verify messages in its log) before `Publish to npm`.

## Follow-ups (out of scope)

- `@pi-vault/pi-usage`: add `peerDependenciesMeta` optional for both Pi peers, then bump pi-status to it so the Compatibility note above becomes true.
- `quality.yml` does not run `pnpm format:check`.
