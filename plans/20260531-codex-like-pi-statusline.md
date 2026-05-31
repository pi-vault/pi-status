# Build `@pi-vault/pi-status`

## Summary

- Create a greenfield Pi extension with a compact, one-line Codex-like footer.
- Use Codex's sparse default: `model-with-reasoning · current-dir`.
- Make additional reliable segments opt-in through `/statusline`.
- Treat `pi-usage` as ready after hardening its event API. Its current checks pass: `63/63` tests plus lint and typecheck.

## Public Interfaces

- Add ordered segment IDs: `model`, `model-with-reasoning`, `current-dir`, `git-branch`, `run-state`, `context-remaining`, `context-used`, `context-window-size`, `used-tokens`, `total-input-tokens`, `total-output-tokens`, `session-id`, `five-hour-limit`, `weekly-limit`, `extension-statuses`.
- Persist configuration in `~/.pi/agent/pi-status.json`, overridable with `PI_STATUS_CONFIG`.
- Store ordered enabled segments and extension-status filtering:

```ts
interface PiStatusConfig {
  segments: StatusLineSegmentId[];
  statusFilter:
    | { mode: "all"; hidden: string[] }
    | { mode: "only"; shown: string[] };
}
```

- Extend `@pi-vault/pi-usage` with exported constants and types under `@pi-vault/pi-usage/events` for `usage-core:ready`, `usage-core:update-current`, and a new `usage-core:request`.
- Define `usage-core:request` as `{ type: "current", reply(payload) }`, returning a cloned current state synchronously.

## Implementation

### Harden `pi-usage`

- Add the request/reply event so statuslines loaded after backend initialization can retrieve the latest state.
- Continue emitting cloned state for ready, update, and request responses.
- Publish the patch release before wiring the status package dependency.

### Scaffold `pi-status`

- Create ESM package `@pi-vault/pi-status` with Node `>=22.12`, Pi peer dependencies, TypeScript, Biome, Vitest, CI, release workflow, and package documentation.
- Depend on the patched `@pi-vault/pi-usage`.
- Auto-load status before usage so listeners are ready during normal startup:

```json
{
  "pi": {
    "extensions": [
      "./src/index.ts",
      "node_modules/@pi-vault/pi-usage/src/index.ts"
    ]
  }
}
```

- Preserve the existing README correction and expand it with installation, `/statusline`, config path, and backend behavior.

### Render The Footer

- Install a `ctx.ui.setFooter` component on session startup and tree switches; restore Pi's default footer on shutdown.
- Read git branch from `footerData`, context from `ctx.getContextUsage()`, session data from `ctx.sessionManager`, model state from `ctx.model`, and reasoning from `pi.getThinkingLevel()`.
- Render available configured segments only, joined by dimmed ` · ` separators.
- Apply fixed Pi semantic colors: accent for model and active state, success for paths, warning for git, muted for metadata, and success/warning/error thresholds at 70% and 90% usage.
- Format rate limits from `pi-usage` snapshots as Codex-style remaining capacity, for example `5h 82% left`.
- Render extension statuses as one opt-in compact segment: deterministic key ordering, filtered keys, redundant key prefixes removed, at most five values, and per-value truncation before final line truncation.
- ANSI-safely truncate the final line to terminal width while preserving configured left-to-right priority.

### Add `/statusline`

- Implement a custom ordered multi-select picker with live preview.
- Support `Space` to toggle, `Left/Right` to reorder enabled segments, `Up/Down` to navigate, fuzzy search, `Enter` to save atomically, and `Esc` to discard the draft.
- Disable reorder while search filtering is active.
- Add non-orderable extension-status rows plus a `New extension statuses` toggle. New keys are shown by default unless the filter is switched to allow-list mode.
- Validate persisted JSON by ignoring unknown or duplicate segment IDs while preserving valid order; fall back to defaults for malformed files.

## Test Plan

- In `pi-usage`, test replay before and after bootstrap, cloned reply isolation, unsupported requests, existing events, `pnpm check`, and `pnpm pack --dry-run`.
- In `pi-status`, test sparse default output, ordering, unavailable omissions, home-directory abbreviation, token aggregation, Codex-style rate formatting, status filtering, semantic thresholds, and ANSI-safe narrow-width truncation.
- Test picker toggle, reorder, search behavior, live preview, atomic save, cancel-without-write, malformed config fallback, and discovered-status handling.
- Test runtime lifecycle, footer cleanup, branch redraw, usage updates, and replay when `pi-usage` loads before or after `pi-status`.
- Run a manual Pi smoke test: load the package, verify the exact default line, enable rate limits and statuses through `/statusline`, resize the terminal, reload Pi, and confirm persisted configuration.

## Assumptions And Deferred Work

- V1 intentionally excludes powerline glyphs, multi-row overflow, presets, cost display, tool activity, progress estimation, and provider-general rate-limit compatibility.
- `pi-usage` rate segments remain available only when OpenAI Codex exposes usable five-hour or weekly windows.
- Standard npm dependency installation is sufficient; npm `bundleDependencies` is not required.
