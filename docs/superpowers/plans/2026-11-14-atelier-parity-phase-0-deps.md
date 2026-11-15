# Atelier Parity Phase 0 — Dependency baseline (release 0.6.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Parent plan:** `docs/superpowers/plans/2026-11-14-atelier-parity.md`. This file replaces the parent's Phase 0 section. It was revised on 2026-11-14 after a trial upgrade in a throwaway worktree, so the fallout listed below has been observed, not guessed.

**Spec:** `docs/superpowers/specs/2026-11-14-atelier-parity-design.md` (section "Phase 0")

**Tech Stack:** TypeScript 7, pnpm, Biome, vitest, `@earendil-works/pi-coding-agent` / `@earendil-works/pi-tui` 1.5.2, Node ≥ 24.15.0.

**Prerequisite:** none. Start from current `master` (`7c48adc`).

## Global Constraints

- Minimum and development host from Phase 0 on: `@earendil-works/pi-coding-agent@1.5.2`, `@earendil-works/pi-tui@1.5.2`.
- Dependency bumps take the latest stable version published at least 48 hours earlier, or the second latest if the latest is younger.
- `peerDependencies` stay `"*"` for both Pi packages. The minimum is stated in README and CHANGELOG only.
- `@pi-vault/pi-usage` stays a regular `dependency` (`^0.7.1`, still latest).
- `engines.node` stays `">=24.15.0"`. vitest 5.1.0 requires `^22.12.0 || ^24.0.0 || >=26.0.0`, so this is compatible.
- `typescript` stays `^7.0.2` (still latest).
- No behaviour change. Default config and saved `statusline.json` files are unchanged.
- Module layout: `src/core`, `src/tui`, `src/shared`. Test layout: `tests/core`, `tests/tui`, `tests/index-*.test.ts`. Match the existing 2-space Biome style.
- Per phase: update `CHANGELOG.md` and the affected README sections, bump `package.json` version, make `pnpm release:check` pass, then PR, merge, tag `vX.Y.Z` (`release.yml` publishes).

## Verified Facts (2026-11-14)

| Package                           | From    | To      | Published  | ≥ 48 h old |
| --------------------------------- | ------- | ------- | ---------- | ---------- |
| `@earendil-works/pi-coding-agent` | ^0.84.4 | ^1.5.2  | 2026-11-10 | yes        |
| `@earendil-works/pi-tui`          | ^0.84.4 | ^1.5.2  | 2026-11-10 | yes        |
| `@biomejs/biome`                  | ^2.5.11 | ^2.6.7  | 2026-11-11 | yes        |
| `vitest`                          | ^4.1.11 | ^5.1.0  | 2026-11-02 | yes        |
| `@types/node`                     | ^26.4.0 | ^26.6.6 | 2026-10-28 | yes        |

Re-run `npm view <pkg> dist-tags.latest` before Step 3. If a newer version has appeared, apply the 48-hour rule again.

Trial upgrade results on `master` + the bumps above:

- Baseline on `master`: 35 files, **963 tests pass**.
- `pnpm typecheck`: **1 break**. pi-tui 1.5.x added `OverlayHandle.getBounds()`, and `FakeOverlayHandle` in `tests/tui/sidebar.test.ts` no longer satisfies the interface.
- `pnpm test`: **1 failure**. `tests/tui/dashboard-render.test.ts > keeps the rename input visible in a one-row dialog viewport`. Since pi-tui 1.2.0, `Input.render()` wraps the cursor cell in zero-width APC markers (`\x1b_pi:fc\x07R\x1b_pi:/fc\x07elease`). The test's local `stripAnsi` strips SGR only, so `"Release 🚀"` is not found. Product code is unaffected: pi-tui's `visibleWidth`/`truncateToWidth` treat the markers as zero-width.
- `pnpm lint`: exits 0 but Biome 2.6 adds **3 `lint/complexity/useMathMinMax` warnings** in `src/tui/dashboard-state.ts` (lines 522, 610, 686).
- **Not observed**, so there is no work for them: the `TurnEndEvent` field fallout (the only `turn_end` fixture is an event-name string in `tests/activity-adapter.test.ts`), exhaustive `ExtensionEvent` switches (there are none), and `queryTerminalColorScheme`/`queryTerminalBackgroundColor` calls (there are none).
- After the fixes in Task 0.1: typecheck clean, lint clean with no warnings, 964 tests pass, `pnpm release:check` exits 0.
- vitest 5 still honours `vi.mock("node:child_process")` in `tests/index-workspace-pulse.test.ts`. The positive inspection test still asserts `execFileMock` call counts and passes.
- APIs that later phases rely on exist in 1.5.2: `HStack`, `isViewportTUI`, `TUI.setLayoutRoot` (pi-tui) and `ExtensionContext.isProjectTrusted()` (pi-coding-agent).

## Phase 0 Review Focus

- `statusline.json` files written by 0.5.1 load and save byte-for-byte unchanged. Task 0.1 pins this with a fixture captured **before** the bump.
- Test-only changes stay test-only. The one `src/` change is the Biome-suggested `Math.max(x, 0)` rewrite, which is equivalent for the integer indices involved (`findIndex` returns ≥ -1).
- `ctx.ui.onTerminalInput`, `footerData.getGitBranch/onBranchChange/getExtensionStatuses` and `ctx.ui.custom` overlay options behave the same on Pi 1.5.2. Typecheck plus the manual smoke run cover this.

---

### Task 0.1: Upgrade dependencies and fix fallout

**Branch:** `20261114-pi-atelier-parity-phase-0-deps` (already exists at `master`'s commit).

**Files:**

- Create: `tests/fixtures/statusline-0.5.1.json`
- Modify: `package.json`, `pnpm-lock.yaml`, `biome.json` (`$schema`)
- Modify: `tests/core/config.test.ts`, `tests/tui/sidebar.test.ts`, `tests/tui/dashboard-render.test.ts`, `src/tui/dashboard-state.ts`

**Produces:** devDependencies at the versions above. Later phases rely on `HStack`, `isViewportTUI`, `TUI.setLayoutRoot` and `ExtensionContext.isProjectTrusted()`.

- [ ] **Step 1: Sync the branch and confirm the baseline**

```bash
git switch 20261114-pi-atelier-parity-phase-0-deps
git fetch origin && git merge --ff-only origin/master
pnpm install --frozen-lockfile && pnpm test
```

Expected: 35 files, 963 tests pass.

- [ ] **Step 2: Capture the 0.5.1 config fixture (before any bump)**

The fixture must be written by 0.5.1's `saveConfig`, so generate it before touching dependencies. Use non-default values for every top-level key so the round trip covers each normalizer. Run from the repo root:

```bash
mkdir -p tests/fixtures
cat > /tmp/gen-fixture.mts <<'EOF'
import { DEFAULT_CONFIG, getConfigPath, saveConfig } from "./src/core/config.ts";
import { ATELIER_COLORS } from "./src/core/colors.ts";
import { MemoryConfigStore } from "./tests/helpers.ts";

const store = new MemoryConfigStore();
const layout = structuredClone(DEFAULT_CONFIG.sidebarPanelLayout);
layout[1].visible = false;
layout.reverse();
saveConfig(
  {
    ...structuredClone(DEFAULT_CONFIG),
    sidebarEnabled: false,
    completionNotifications: true,
    extensionStatusZone: "bottomLeft",
    zones: {
      topLeft: ["model-with-reasoning"],
      topRight: [],
      bottomLeft: ["current-dir", "workspace-pulse"],
      bottomRight: [],
    },
    extensionSegments: { hidden: ["ext:alpha"] },
    sidebarPanelLayout: layout,
    sidebarHiddenSegments: ["builtin:provider"],
    colors: {
      preset: "custom",
      custom: { ...ATELIER_COLORS, accent: "#b18cff" },
      customInitialized: true,
    },
  },
  { agentDir: "/agent", store },
);
process.stdout.write(store.read(getConfigPath("/agent"))!);
EOF
cp /tmp/gen-fixture.mts ./gen-fixture.mts
node gen-fixture.mts > tests/fixtures/statusline-0.5.1.json
rm gen-fixture.mts /tmp/gen-fixture.mts
```

Expected: a file of about 129 lines whose `zones.bottomLeft` includes `"workspace-pulse"`. `biome.json` only includes `*.ts`, so Biome ignores the fixture.

- [ ] **Step 3: Add the round-trip test**

Append to `tests/core/config.test.ts`. `readFileSync`, `join`, `getConfigPath`, `loadConfig`, `saveConfig` and `MemoryConfigStore` are already imported.

```ts
describe("config — 0.5.x compatibility", () => {
  it("round-trips a 0.5.x statusline.json without changing it", () => {
    const store = new MemoryConfigStore();
    const path = getConfigPath("/agent");
    const legacy = readFileSync(
      join(import.meta.dirname, "../fixtures/statusline-0.5.1.json"),
      "utf8",
    );
    store.seed(path, legacy);

    saveConfig(loadConfig({ agentDir: "/agent", store }), {
      agentDir: "/agent",
      store,
    });

    expect(store.read(path)).toBe(legacy);
  });
});
```

Run: `pnpm format && pnpm test -- tests/core/config.test.ts`
Expected: pass on 0.5.1 tooling. Sanity check: change `"#b18cff"` to `"#B18CFF"` in the fixture, confirm the test fails, then revert the change.

- [ ] **Step 4: Bump the dependencies**

```bash
pnpm add -D @earendil-works/pi-coding-agent@^1.5.2 @earendil-works/pi-tui@^1.5.2 \
  @biomejs/biome@^2.6.7 vitest@^5.1.0 @types/node@^26.6.6
sed -i '' 's#schemas/2.5.11/#schemas/2.6.7/#' biome.json
```

Expected: only `devDependencies` change in `package.json`. `dependencies`, `peerDependencies` and `engines` are untouched. `pnpm-workspace.yaml` needs no change.

- [ ] **Step 5: Fix the typecheck break**

Run: `pnpm typecheck`
Expected: TS2420/TS2741, `Property 'getBounds' is missing in type 'FakeOverlayHandle'` (`tests/tui/sidebar.test.ts`).

In `FakeOverlayHandle`, add after `isFocused`:

```ts
getBounds = vi.fn(() => undefined);
```

Run `pnpm typecheck` again. Expected: exit 0.

- [ ] **Step 6: Fix the APC cursor-marker test failure**

In `tests/tui/dashboard-render.test.ts`, replace the local SGR-only helper with pi-tui's own stripper, which removes SGR, OSC and APC sequences:

- Line 1: `import { Input, stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";`
- Delete the local `function stripAnsi(value: string): string { ... }` (around line 53).
- Replace every `stripAnsi(` call in the file with `stripTerminalSequences(`.

Run: `pnpm test -- tests/tui/dashboard-render.test.ts`
Expected: pass, including "keeps the rename input visible in a one-row dialog viewport".

- [ ] **Step 7: Resolve the Biome 2.6 warnings**

In `src/tui/dashboard-state.ts`, apply the `useMathMinMax` suggestions:

- `state.navigation.sidebar.selectedIndex = index >= 0 ? index : 0;` → `... = Math.max(index, 0);`
- `activeNavigation(state).selectedIndex = index >= 0 ? index : 0;` → `... = Math.max(index, 0);`
- `const startIndex = currentIndex >= 0 ? currentIndex : 0;` → `const startIndex = Math.max(currentIndex, 0);`

Run: `pnpm format && pnpm lint`
Expected: exit 0 with no warnings. Do not disable rules.

- [ ] **Step 8: Full check**

Run: `pnpm check`
Expected: exit 0, 35 files, **964 tests** pass.

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml biome.json src tests
git commit -m "chore: upgrade to Pi 1.5.2, Biome 2.6.7, vitest 5"
```

### Task 0.2: Docs and release 0.6.0

**Files:** `README.md`, `CHANGELOG.md`, `package.json` (`version`)

- [ ] **Step 1: Update README**

- Line 48: "Pi 0.84.4 or newer is required." → "Pi 1.5.2 or newer is required."
- Line 254 (Upgrade Notes): `0.84.3` → `1.5.2` for both packages. Per the spec, this is the line readers check for the tested baseline.
- Colours section: delete the standalone line 194 (`` `NO_COLOR` disables styling across Dashboard, Statusbar, and Sidebar without changing the saved preset. ``). Line 192 already says it.

- [ ] **Step 2: Add the CHANGELOG entry**

Insert above `## 0.5.1`, matching the existing style:

```markdown
## 0.6.0 - YYYY-MM-DD

### Compatibility

- Pi 1.5.2 or newer is now required. Updated the tested host baseline to `@earendil-works/pi-coding-agent@1.5.2` and `@earendil-works/pi-tui@1.5.2`. Pi 0.84.x users should stay on pi-status 0.5.x.
- Updated tooling: `@biomejs/biome` `^2.6.7`, `vitest` `^5.1.0`, `@types/node` `^26.6.6`. Node.js 24.15.0+ still required.
- Existing `statusline.json` files load and save unchanged.
```

Use the actual release date.

- [ ] **Step 3: Bump the version**

Set `package.json` `version` to `0.6.0`.

- [ ] **Step 4: Release check**

Run: `pnpm release:check`
Expected: exit 0. The dry-run tarball is `pi-vault-pi-status-0.6.0.tgz` and does not include `tests/`.

- [ ] **Step 5: Manual smoke run in Pi 1.5.2**

The globally installed `npm:@pi-vault/pi-status@0.5.1` would load alongside the local copy, so disable discovery (same convention as pi-atelier's CONTRIBUTING):

```bash
pi --version   # expect 1.5.2
pi --no-session --no-extensions -e ./src/index.ts
```

Confirm all of:

- the footer renders;
- the sidebar renders at ≥ 92 columns and hides below;
- `/statusline` opens, changes a setting, and saves (then restore the setting);
- `Ctrl+Shift+R` enters Resize mode, arrows resize, Enter accepts.

- [ ] **Step 6: Commit and open the PR**

```bash
git add README.md CHANGELOG.md package.json
git commit -m "chore: release v0.6.0"
git push -u origin HEAD
```

Open the PR. After merge: `git switch master && git pull && git tag v0.6.0 && git push origin v0.6.0`.
