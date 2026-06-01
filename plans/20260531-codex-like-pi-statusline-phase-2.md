# Phase 2: Scaffold `@pi-vault/pi-status` And Ship The Default Footer

## Usable Result

`@pi-vault/pi-status` is installable as a Pi extension and replaces Pi's default footer with the sparse Codex-style line:

`model-with-reasoning · current-dir`

This phase intentionally ships only that default footer. It does not add configuration, `/statusline`, `pi-usage`, git branch, rate limits, or extension statuses.

## Public Interface

- Publish package `@pi-vault/pi-status` as ESM with Node `>=22.12`.
- Register the Pi extension via:

```json
{
  "pi": {
    "extensions": ["./src/index.ts"]
  }
}
```

- Do not add commands or persisted config in this phase.

## Implementation

### Scaffold The Package

- Scaffold the repo using the existing `@pi-vault/pi-usage` package as the baseline for:
  - `package.json`
  - `tsconfig.json`
  - `vitest.config.ts`
  - `biome.json`
  - `.github/workflows/quality.yml`
  - `.github/workflows/release.yml`
- Use the same script names and tooling versions as `pi-usage`.
- Set the initial package version to `0.1.0`.
- Do not require a package root `exports` entry in this phase; Pi only needs the `pi.extensions` manifest for loading.
- Keep the package layout minimal:
  - `src/index.ts` for lifecycle wiring
  - `src/render.ts` for pure footer formatting
  - `tests/*.test.ts` for render and runtime coverage

### Footer Lifecycle

- On `session_start`, if `ctx.hasUI`, install the footer with `ctx.ui.setFooter(...)` and store the active `ctx`.
- On `session_tree`, reinstall the footer with the new `ctx` so `cwd` and model state do not stay bound to the previous tree.
- On `model_select` and `thinking_level_select`, update the stored `ctx` and request a repaint.
- On `session_shutdown`, remove the custom footer with `ctx.ui.setFooter(undefined)` and clear runtime references.
- Do not use `session_switch`; current Pi integrations rely on `session_tree`.

### Footer Rendering

- Render a single-line footer with at most two segments, in this fixed order:
  - `model-with-reasoning`
  - `current-dir`
- Omit any segment whose value is unavailable.
- Join visible segments with a dimmed `·` separator.

Model segment:

- Base label is `ctx.model.name ?? ctx.model.id`.
- If `ctx.model` is missing, omit the segment.
- If `ctx.model.reasoning` is `true`, append the current thinking level as:
  - ` [off]`
  - ` [min]`
  - ` [low]`
  - ` [med]`
  - ` [high]`
  - ` [xhigh]`
- Normalize Pi thinking labels as:
  - `minimal -> min`
  - `medium -> med`
  - all other values unchanged

Current-dir segment:

- Use `ctx.cwd` as the displayed path.
- Abbreviate the home-directory prefix to `~`.
- Do not collapse to basename or last path segments in this phase.

Styling and truncation:

- Render the model segment with `theme.fg("accent", text)`.
- Render the current-dir segment with `theme.fg("success", text)`.
- Render separators with `theme.fg("dim", " · ")`.
- Join the styled segments first, then truncate the final ANSI string with `truncateToWidth` from `@earendil-works/pi-tui`.

### Documentation

- Replace the placeholder README with installation, local smoke-test, and current-scope documentation.
- State explicitly that Phase 2 only ships the default sparse footer and that richer segments come later.

## Verification

- Test reasoning-capable model rendering with normalized thinking labels.
- Test non-reasoning model rendering without a thinking suffix.
- Test missing model handling.
- Test home-directory abbreviation.
- Test ANSI-safe truncation for narrow widths.
- Test footer installation on `session_start`.
- Test footer reinstallation on `session_tree`.
- Test repaint behavior on `model_select` and `thinking_level_select`.
- Test footer cleanup on `session_shutdown`.
- Run `pnpm check`.
- Run `pnpm pack --dry-run`.
- Smoke test local installation with `pi -e .`.

## Completion Criteria

- The package installs as a Pi extension.
- A normal session shows the sparse Codex-style default line with the exact segment order.
- Tree changes refresh `cwd` and model state correctly.
- Shutdown removes the custom footer cleanly.
