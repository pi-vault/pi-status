# Phase 1: Harden `pi-usage`

## Usable Result

`@pi-vault/pi-usage` becomes a reliable backend for late-loading extensions, independently of `pi-status`.

## Implementation

- Add public event constants and types under `@pi-vault/pi-usage/events`.
- Preserve `usage-core:ready` and `usage-core:update-current`.
- Add `usage-core:request` with `{ type: "current", reply(payload) }`.
- Reply synchronously with a cloned current state; ignore malformed or unsupported requests.
- Export the root extension, `./events`, and `./types` without breaking Pi package loading.
- Publish a patch release before Phase 4 consumes it.

## Verification

- Test replay before and after bootstrap.
- Test cloned reply isolation.
- Test malformed and unsupported requests.
- Confirm existing ready and update events remain compatible.
- Run `pnpm check`.
- Run `pnpm pack --dry-run`.

## Completion Criteria

- Existing consumers continue receiving ready and update events.
- A consumer loaded after bootstrap can request and receive current state.
- The patched package is published and available for Phase 4.
