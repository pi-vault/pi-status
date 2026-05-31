# Phase 2: Scaffold Repo And Ship MVP Footer

## Usable Result

`@pi-vault/pi-status` is installable and replaces Pi's footer with the Codex default line.

## Implementation

- Scaffold the ESM package with Node `>=22.12`, Pi peer dependencies, TypeScript, Biome, Vitest, CI, release workflow, and documentation.
- Implement footer lifecycle with `ctx.ui.setFooter` on session startup and tree switches.
- Restore Pi's default footer on shutdown.
- Render only `model-with-reasoning · current-dir`.
- Use `ctx.model`, `pi.getThinkingLevel()`, and `ctx.cwd`.
- Abbreviate the home directory to `~`.
- Apply Pi semantic colors, dimmed separators, and ANSI-safe width truncation.

## Verification

- Test exact default rendering.
- Test missing model handling.
- Test home-directory abbreviation.
- Test narrow terminal widths.
- Test footer installation, replacement, and shutdown cleanup.
- Run `pnpm check`.
- Run `pnpm pack --dry-run`.
- Smoke test local installation with `pi -e .`.

## Completion Criteria

- The package installs as a Pi extension.
- A normal session shows the exact sparse Codex-style default.
- Resizing and shutdown do not leave stale footer state.
