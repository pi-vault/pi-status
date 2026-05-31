# Phase 4: Add External Integrations

## Usable Result

Users can opt into Codex-style rate limits and compact Pi extension statuses through JSON configuration.

## Dependencies

- Complete Phase 1 and consume the published `@pi-vault/pi-usage` patch release.
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

- Depend on the patched `@pi-vault/pi-usage`.
- Listen for ready and update events.
- Request replay on startup so either load order works.
- Format rate limits as remaining capacity, for example `5h 82% left`.
- Read extension statuses from `footerData.getExtensionStatuses()`.
- Render statuses deterministically with redundant prefixes removed.
- Render at most five statuses, truncate each value, then truncate the final line.
- Show newly discovered status keys by default unless allow-list mode is configured.

## Verification

- Test backend replay when `pi-usage` loads before and after `pi-status`.
- Test unavailable rate windows and non-Codex providers.
- Test status filtering, new-status policy, ordering, and truncation.
- Test duplicate backend loading remains safe.
- Run `pnpm check`.
- Run `pnpm pack --dry-run`.

## Completion Criteria

- Enabled rate segments update without requiring a Pi restart.
- Late-loading status extensions receive current backend state.
- Extension statuses stay compact and respect persisted filtering.
