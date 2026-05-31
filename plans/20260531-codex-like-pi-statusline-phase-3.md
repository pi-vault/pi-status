# Phase 3: Add Local Segment Catalog And File Configuration

## Usable Result

Users can configure a richer statusline through JSON without requiring `pi-usage`.

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

- Keep the default line unchanged: `model-with-reasoning · current-dir`.
- Ignore unknown and duplicate IDs while preserving valid configured order.
- Fall back to defaults for missing or malformed configuration.
- Read branch, context, session ID, run state, and branch token totals from Pi APIs.
- Omit segments when their values are unavailable.
- Use success, warning, and error colors at 70% and 90% usage thresholds.
- Document manual JSON configuration.

## Verification

- Test every segment formatter.
- Test ordered rendering and unavailable-value omission.
- Test malformed JSON, unknown IDs, duplicates, and environment path override.
- Test token aggregation and usage thresholds.
- Test ANSI-safe line truncation.
- Run `pnpm check`.
- Run `pnpm pack --dry-run`.

## Completion Criteria

- Existing default output remains unchanged.
- Users can opt into any local segment with a persisted JSON file.
- Invalid configuration cannot prevent the footer from rendering.
