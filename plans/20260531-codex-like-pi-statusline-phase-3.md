# Phase 3: Add Local Segment Catalog And JSON Config

## Usable Result

Users can opt into additional local-only footer segments through persisted JSON without requiring `pi-usage`.

## Dependency

- Complete Phase 2 first.

## Public Interface

Read configuration from `~/.pi/agent/pi-status.json`, overridable with `PI_STATUS_CONFIG`.

```ts
interface PiStatusConfig {
  segments: StatusLineSegmentId[];
}
```

Add ordered segment IDs:

- `model`
- `model-with-reasoning`
- `current-dir`
- `git-branch`
- `run-state`
- `context-remaining`
- `context-used`
- `context-window-size`
- `used-tokens`
- `total-input-tokens`
- `total-output-tokens`
- `session-id`

## Implementation

- Keep the default footer unchanged: `model-with-reasoning · current-dir`.
- Add a local `StatusLineSegmentId` union and `PiStatusConfig` type without introducing package exports in this phase.
- Add `src/config.ts` to resolve config from `PI_STATUS_CONFIG` or `~/.pi/agent/pi-status.json`.
- If `PI_STATUS_CONFIG` is relative, resolve it from `process.cwd()`.
- Cache the normalized config during extension initialization; manual JSON edits require a Pi restart in this phase.
- If the config file is missing, unreadable, malformed, not an object, or `segments` is not an array, silently fall back to the default config.
- Normalize `segments` by keeping the first occurrence of each known string ID and dropping unknown, duplicate, or non-string entries.
- Continue installing the footer on `session_start` and `session_tree`, repainting on `model_select` and `thinking_level_select`, and restoring the built-in footer on `session_shutdown`.
- Use typed `footerData` in the footer factory and subscribe to `footerData.onBranchChange(() => tui.requestRender())` so `git-branch` updates reactively.
- Read segment data from these sources:
  - `model`: `ctx.model`
  - `thinkingLevel`: `pi.getThinkingLevel()`
  - `current-dir`: `ctx.cwd`
  - `git-branch`: `footerData.getGitBranch()`
  - `session-id`: `ctx.sessionManager.getSessionId()`
  - context usage: `ctx.getContextUsage()`
  - branch totals: sum assistant-message `usage.input`, `usage.output`, and `usage.totalTokens` across `ctx.sessionManager.getBranch()`
- Derive `run-state` with this precedence:
  - `busy` when `!ctx.isIdle()`
  - `queued` when `ctx.isIdle()` and `ctx.hasPendingMessages()`
  - `idle` otherwise
- Use one shared compact-number formatter:
  - values below `1000`: plain integer
  - values at or above `1000`: one decimal with `k` or `M`, trimming trailing `.0`
- Format and color segments exactly as follows:
  - `model`: `name ?? id`, `accent`
  - `model-with-reasoning`: existing phase-2 formatter, `accent`
  - `current-dir`: existing home-abbreviated path, `success`
  - `git-branch`: raw branch name, `warning`
  - `run-state`: `busy`, `queued`, or `idle`; `accent` for `busy` and `queued`, `dim` for `idle`
  - `context-used`: `<percent>% ctx`; omit if `percent` is missing; color by usage with `success` below `70`, `warning` from `70` to below `90`, and `error` at `90+`
  - `context-remaining`: `<remaining> left`; omit if `tokens`, `contextWindow`, or `percent` is missing; color from the same usage thresholds
  - `context-window-size`: `<contextWindow> ctx` when `contextWindow` exists, `dim`
  - `used-tokens`: `<totalTokens> tok`, `dim`
  - `total-input-tokens`: `↑<input>`, `dim`
  - `total-output-tokens`: `↓<output>`, `dim`
  - `session-id`: `sid <first-8-chars>`, `dim`
- Keep rendering order fully config-driven.
- Omit any segment whose value is unavailable.
- Join visible segments with `theme.fg("dim", " · ")`.
- Truncate only after styling and joining so ANSI-safe truncation preserves configured left-to-right priority.
- Document the config path, env override, supported local segment IDs, JSON examples, and the restart-required behavior in `README.md`.

## Verification

- Test config loading for:
  - missing file
  - malformed JSON
  - wrong top-level shape
  - unknown IDs
  - duplicates
  - non-string entries
  - `PI_STATUS_CONFIG` override
- Test the compact-number formatter and every segment formatter.
- Test that default output remains unchanged with no config file present.
- Test configured ordering and unavailable-value omission.
- Test branch token aggregation from assistant usage entries.
- Test context threshold colors at values below `70`, from `70` to below `90`, and at `90+`.
- Test ANSI-safe line truncation after styled join.
- Test branch-change repaint wiring through `footerData.onBranchChange(...)`.
- Run `pnpm check`.
- Run `pnpm pack --dry-run`.

## Completion Criteria

- Existing default output remains unchanged.
- Users can opt into any local segment with a persisted JSON file.
- Invalid configuration cannot prevent the footer from rendering.
- Manual config edits take effect after restarting Pi.
