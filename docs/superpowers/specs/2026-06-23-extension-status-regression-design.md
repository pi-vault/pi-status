# Extension Status Regression Fix Design

Fix the regression introduced by the runtime-state refactor where extension status text disappears from the footer until `onBranchChange()` fires.

## Problem

The regression was introduced in `cf6dab9` (`refactor: wire RuntimeStateMachine into index.ts`). Before that change, the footer read `footerData.getExtensionStatuses()` during every render. After the refactor, `extensionStatuses` and `gitBranch` moved into `RuntimeStateMachine` and are only updated from the `onBranchChange()` callback.

That changed the ownership boundary:

- **Before:** render-time read from the footer provider was the source of truth.
- **After:** branch-change events became the source of truth.

Pi's footer API does not guarantee that `onBranchChange()` fires before the first render. Its contract is:

- `getGitBranch()` and `getExtensionStatuses()` are readable during `render()`
- `onBranchChange()` is a reactive trigger to request another render

As a result, the current implementation can render with an empty `extensionStatuses` map even when the provider already has values. The same stale state also affects `/statusline`, which discovers extension status keys from the cached runtime snapshot.

## Goal

Restore extension status visibility on initial render and keep `/statusline` discovery in sync, without re-expanding the footer wiring back into an unstructured mutable blob.

## Design

### 1. Split state by ownership

`RuntimeStateMachine` should own only durable session/config state:

- `ctx`
- `config`
- `thinkingLevel`

It should no longer own:

- `gitBranch`
- `extensionStatuses`

Those two values are owned by the footer provider and should stay in the footer layer.

### 2. Add a footer-provider cache in `src/index.ts`

Introduce a small local cache for the latest provider-owned values:

```ts
type FooterProviderState = {
  gitBranch: string | null;
  extensionStatuses: Map<string, string>;
};
```

This cache is not the source of truth. It exists so non-render callers in `index.ts` (notably `/statusline`) can reuse the latest observed provider data.

Initial value:

```ts
{
  gitBranch: null,
  extensionStatuses: new Map(),
}
```

### 3. Refresh provider data at render time

Inside the footer component's `render(width)` method:

1. read `footerData.getGitBranch()`
2. read `footerData.getExtensionStatuses()`
3. refresh the footer-provider cache
4. build the footer snapshot from:
   - runtime session/config state
   - live provider-owned state
   - usage runtime state

This restores the original correct behavior: the first render sees provider data even if `onBranchChange()` has not fired yet.

### 4. Keep `onBranchChange()` as a trigger, not a source of truth

The branch-change callback should continue to exist, but its role changes:

1. refresh the same footer-provider cache
2. call `requestRender()`

It should no longer dispatch provider-owned data into `RuntimeStateMachine`.

This gives the code two complementary guarantees:

- **render-time read** ensures correctness
- **branch-change callback** ensures responsiveness

### 5. `/statusline` should discover statuses from the provider cache

When the `/statusline` command opens, discovered status keys should come from the footer-provider cache rather than from `RuntimeStateMachine`.

Expected behavior:

- after at least one footer render, `/statusline` sees the latest known extension status keys
- if no footer render has happened yet, the discovered list may still be empty
- discovery is no longer coupled to branch-change timing

## File Responsibilities

### `src/core/runtime-state.ts`

Narrow the state machine so it manages only durable extension/session state.

Planned changes:

- remove `gitBranch` and `extensionStatuses` from `RuntimeEvent`
- remove `gitBranch` and `extensionStatuses` from `RuntimeSnapshot`
- remove storage/update logic for those fields
- keep `ctx`, `config`, `thinkingLevel`, `onInvalidate`, and `dispose`

### `src/index.ts`

Own the footer-provider cache and use it in both footer rendering and `/statusline` discovery.

Planned changes:

- add local `FooterProviderState`
- add a small helper that copies live data from `footerData` into the cache
- call that helper from `render()` before building the snapshot
- call that helper from `onBranchChange()` before requesting re-render
- build `buildSnapshot(...)` input using runtime state + cached provider values
- switch `/statusline` discovered status lookup from runtime snapshot to provider cache

### `tests/core/runtime-state.test.ts`

Update tests to reflect the narrower ownership boundary.

Planned changes:

- remove assertions about `gitBranch` and `extensionStatuses`
- keep coverage for session/config/thinking-level transitions and invalidation behavior

### `tests/index.test.ts`

Add integration coverage for the regression and for the new boundary.

Planned tests:

1. **initial render includes extension statuses without `onBranchChange()` firing**
   - provider returns non-empty statuses
   - `onBranchChange` registers but does not invoke immediately
   - footer output includes the extension status text

2. **`/statusline` discovers statuses from the provider cache**
   - render the footer once with known provider statuses
   - invoke `/statusline`
   - verify the editor receives discovered status keys derived from the cache

3. **reactive updates still refresh correctly**
   - simulate a branch/status change after first render
   - verify re-render occurs and uses updated provider values

## Data Flow After the Fix

### Footer render path

```text
footerData.getGitBranch()
footerData.getExtensionStatuses()
  -> refresh local provider cache
  -> combine with runtime snapshot + usage state
  -> resolveFooter(...)
  -> buildFooterLineFromResolved(...)
```

### Reactive path

```text
onBranchChange()
  -> refresh local provider cache
  -> requestRender()
  -> render() re-reads provider state and paints current footer
```

### `/statusline` path

```text
latest provider cache
  -> discovered status keys
  -> createStatusLineEditor(...)
```

## Non-Goals

This fix does not change:

- footer formatting rules
- extension status filtering behavior
- usage-runtime behavior
- config persistence format
- editor interaction model

This is a boundary correction, not a UI redesign.

## Risks and Mitigations

### Risk: duplicated provider-refresh logic

Mitigation: use one small helper in `src/index.ts` to read and copy provider data so render and callback paths stay consistent.

### Risk: stale cache used by `/statusline`

Mitigation: keep render-time reads authoritative. The cache is refreshed from the same provider data the footer uses.

### Risk: future state ownership drift

Mitigation: keep the state machine documentation and tests explicit that provider-owned data does not belong in `RuntimeStateMachine`.

## Verification

The fix is complete when all of the following are true:

1. initial footer render shows extension status text even if `onBranchChange()` has never fired
2. `/statusline` can discover extension status keys after the footer has rendered once
3. reactive updates still trigger re-render and display updated provider values
4. updated runtime-state unit tests pass
5. full test suite passes

## Scope

Files expected to change:

- `src/index.ts`
- `src/core/runtime-state.ts`
- `tests/index.test.ts`
- `tests/core/runtime-state.test.ts`

No new modules are required unless the implementation reveals repeated logic large enough to justify extraction. The preferred implementation is a small, surgical boundary fix.