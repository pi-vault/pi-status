# Phase 4: Add External Usage And Extension Status Segments

## Usable Result

Users can opt into live Codex rate-limit segments and compact extension-status output through JSON configuration, without changing the default footer.

## Dependencies

- Complete Phase 1 and consume published `@pi-vault/pi-usage@^0.1.1`.
- Complete Phase 3 first.

## Public Interface

Extend the segment catalog:

- `five-hour-limit`
- `weekly-limit`
- `extension-statuses`

Extend persisted configuration:

```ts
interface PiStatusConfig {
  segments: StatusLineSegmentId[];
  statusFilter:
    | { mode: "all"; hidden: string[] }
    | { mode: "only"; shown: string[] };
}
```

Default `statusFilter`:

```ts
{ mode: "all", hidden: [] }
```

Auto-load status before usage:

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

## Implementation

- Add a runtime dependency on `@pi-vault/pi-usage@^0.1.1`.
- Keep the default footer unchanged: `model-with-reasoning · current-dir`.
- Keep config loading restart-only in this phase.

### Config

- Extend `StatusLineSegmentId` with the three new segment IDs.
- Extend `PiStatusConfig` with `statusFilter`.
- Normalize `statusFilter` arrays by:
  - keeping the first occurrence of each string
  - dropping non-string entries
  - dropping empty strings
- If `statusFilter` is missing or malformed, fall back to `{ mode: "all", hidden: [] }` while preserving any valid `segments`.
- Continue falling back to default segments when `segments` is missing, malformed, or empty after normalization.

### Usage Backend Wiring

- Import `USAGE_CORE_READY_EVENT`, `USAGE_CORE_UPDATE_CURRENT_EVENT`, `USAGE_CORE_REQUEST_EVENT`, and `UsageCoreState` from `@pi-vault/pi-usage`.
- Cache the latest `UsageCoreState` in extension runtime state.
- Subscribe to `usage-core:ready` and `usage-core:update-current`.
- Emit a `usage-core:request` with `{ type: "current", reply(payload) }` during startup so either extension load order works.
- On every accepted backend payload, update cached usage state and request a footer rerender.
- Keep duplicate backend loading safe by continuing to rely on `pi-usage`'s global initialization guard.

### Footer Data And Rendering

- Extend the local footer-data typing to include:

```ts
getExtensionStatuses(): ReadonlyMap<string, string>;
```

- Continue sourcing existing segments from the current Phase 3 data flow.
- Render configured segments left-to-right, omitting any unavailable segment, joining with `theme.fg("dim", " · ")`, then truncating the final ANSI string with `truncateToWidth`.

### Rate Segments

- Read live windows from `usageState.compatibility.currentLiveProviderSnapshot`.
- Render rate segments only when `currentLiveProviderSnapshot?.providerId === "openai-codex"`.
- Resolve windows by key:
  - `five-hour-limit` -> `fiveHour`
  - `weekly-limit` -> `weekly`
- Omit the segment if the window is missing or has `unavailableReason`.
- Format remaining capacity as:
  - `five-hour-limit`: `5h <remaining>% left`
  - `weekly-limit`: `wk <remaining>% left`
- Compute `remaining` as `clamp(0, 100 - Math.round(usedPercent), 100)`.
- Color each rate segment from `usedPercent` with the existing thresholds:
  - below `70`: `success`
  - `70` to below `90`: `warning`
  - `90` and above: `error`

### Extension Status Segment

- Read statuses from `footerData.getExtensionStatuses()`.
- Start from keys sorted ascending for deterministic output.
- Apply filtering:
  - `mode: "all"` includes every key except those in `hidden`
  - `mode: "only"` includes only keys listed in `shown`
- Show at most the first 5 visible statuses.
- Render values only; do not prepend status keys in the footer.
- For plain-text values, strip one redundant leading prefix matching the key, case-insensitive, in any of these forms:
  - `<key>:`
  - `<key> -`
  - `<key> =`
  - `<key> `
- If a value contains ANSI escapes, skip prefix stripping and keep the original styled value unchanged.
- Truncate each individual status value to 18 visible columns with `truncateToWidth(..., 18, "...")`.
- Join visible status values with `theme.fg("dim", " | ")`.
- Do not recolor extension status values.

## Verification

- Test config loading for:
  - missing `statusFilter`
  - malformed `statusFilter`
  - duplicate filter entries
  - non-string and empty-string filter entries
  - preserving valid `segments` when `statusFilter` is invalid
- Test rate rendering for:
  - Codex `fiveHour` and `weekly` windows
  - non-Codex provider omission
  - missing window omission
  - `unavailableReason` omission
  - threshold colors
- Test extension-status rendering for:
  - deterministic ordering
  - `all` mode filtering
  - `only` mode filtering
  - new-key default visibility in `all` mode
  - five-status cap
  - plain-text redundant-prefix stripping
  - ANSI-valued passthrough
  - per-value truncation
  - final-line truncation
- Test runtime behavior for:
  - replay when `pi-usage` loads before `pi-status`
  - replay when `pi-status` loads before `pi-usage`
  - rerender on ready and update events
  - duplicate backend loading safety
- Run `pnpm check`.
- Run `pnpm pack --dry-run`.

## Completion Criteria

- Default output remains unchanged when no new segments are configured.
- Enabled rate-limit segments update without requiring a Pi restart.
- Either extension load order produces current rate data.
- Extension statuses stay compact and respect persisted filtering.
