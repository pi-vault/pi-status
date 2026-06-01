# Phase 1: Harden `pi-usage`

## Status

Completed on 2026-05-31 after verifying the merged `@pi-vault/pi-usage` `v0.1.1` release and published npm package.

## Usable Result

`@pi-vault/pi-usage` becomes a reliable backend for late-loading extensions, independently of `pi-status`.

## Implementation

- Added public event constants and types under `@pi-vault/pi-usage/events`.
- Preserved `usage-core:ready` and `usage-core:update-current`.
- Added `usage-core:request` with `{ type: "current", reply(payload) }`.
- Implemented synchronous replies with a cloned current state and ignored malformed or unsupported requests.
- Exported the root extension, `./events`, and `./types` without breaking Pi package loading.
- Published the patch release as `@pi-vault/pi-usage@0.1.1` before Phase 4 consumption.

## Verification

- Verified replay before and after bootstrap in `tests/index.test.ts`.
- Verified cloned reply isolation in `tests/index.test.ts`.
- Verified malformed and unsupported requests in `tests/index.test.ts`.
- Confirmed existing ready and update events remain compatible for bus listeners in `tests/index.test.ts`.
- Ran `pnpm check` successfully: lint, typecheck, and 69 tests passed.
- Ran `pnpm pack --dry-run` successfully for `@pi-vault/pi-usage@0.1.1`.
- Confirmed Pi's extension loader still loads `./src/index.ts` successfully.
- Confirmed npm publishes `0.1.1` as the current `latest` version.

## Completion Criteria

- Existing consumers continue receiving ready and update events.
- A consumer loaded after bootstrap can request and receive current state.
- The patched package is published and available for Phase 4.
