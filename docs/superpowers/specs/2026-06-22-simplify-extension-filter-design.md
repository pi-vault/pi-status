# Simplify Extension Status Filter

## Problem

The `StatusFilter` type and its policy row add unnecessary complexity. After Phase 4 removed the `extension-statuses` segment, extension statuses auto-append to the footer. The only remaining question is which individual statuses to hide. The two-mode discriminated union (`{ mode: "all", hidden }` vs `{ mode: "only", shown }`) and its corresponding editor policy row are overhead for a simple "toggle each status on/off" interaction.

## Design

### New type

Replace:

```ts
export type StatusFilter =
  | { mode: "all"; hidden: string[] }
  | { mode: "only"; shown: string[] };

export type PiStatusConfig = {
  segments: StatusLineSegmentId[];
  filter: StatusFilter;
};
```

With:

```ts
export type ExtensionSegments = { hidden: string[] };

export type PiStatusConfig = {
  segments: StatusLineSegmentId[];
  extensionSegments: ExtensionSegments;
};
```

New extension statuses default to visible. Users hide individual keys via the editor. No policy row, no mode concept.

### Config migration

`normalizeStatusFilter` becomes `normalizeExtensionSegments`. It must handle three input shapes from existing settings files:

1. **`{ mode: "all", hidden: [...] }`** — convert to `{ hidden: [...] }` (drop `mode`, keep `hidden`).
2. **`{ mode: "only", shown: [...] }`** — cannot invert without knowing all discovered keys at load time. Since we default to "show all", treat this as `{ hidden: [] }` (show everything). Users who had an allowlist will see all statuses after the migration and can re-hide from the editor.
3. **Missing/invalid** — default to `{ hidden: [] }`.

The field name in the settings JSON changes from `filter` to `extensionSegments`. The legacy fallback happens in `normalizePiStatus`: read `extensionSegments` first, fall back to `filter` if present. This handles mixed old/new settings files across global and project configs.

### Config persistence

`saveConfigToSettings` writes the new shape:

```json
{
  "statusLine": {
    "segments": ["model-with-reasoning", "current-dir"],
    "extensionSegments": { "hidden": ["alpha"] }
  }
}
```

The old `filter` key is removed from the written output (overwritten by the new structure).

### Config merging

`mergePiStatus` currently deep-merges `filter` objects between global and project settings. Update to merge `extensionSegments` instead. Same shallow-merge strategy: project values override global values.

### Editor changes

- Remove `PolicyInteractiveRow` type and all `type: "policy"` handling.
- Remove `newPolicyShown` state variable.
- Remove `mapStatusDraftToFilter` — replace with a simpler function that returns `{ hidden: string[] }` by collecting unchecked status keys.
- Remove the policy row from `getInteractiveRows`, `rowMatchesQuery`, and render logic.
- Update `toConfig()` to produce the new `PiStatusConfig` shape.
- Remove `POLICY_ROW_LABEL`, `POLICY_ROW_DESCRIPTION` constants.

### Render changes

In `formatExtensionStatuses`, replace the two-mode filter logic:

```ts
const blocked = filter.mode === "all" ? new Set(...) : undefined;
const allowed = filter.mode === "only" ? new Set(...) : undefined;
```

With:

```ts
const blocked = new Set(normalizeFilterList(input.extensionSegments.hidden));
```

Filter visible entries by `!blocked.has(key)`.

### FooterRenderInput

Rename the `filter` field to `extensionSegments` with type `ExtensionSegments`. Update all call sites (`index.ts`, `editor.ts` preview, tests).

### Tests

- **Config tests:** Update `normalizeStatusFilter` tests to test `normalizeExtensionSegments`. Add migration cases for old `{ mode: "only", shown }` and old `{ mode: "all", hidden }` inputs. Test that a legacy `filter` field is read and migrated.
- **Render tests:** Update `buildFooterLine` extension-status tests to use `extensionSegments` instead of `filter`. Remove any tests that exercised `mode: "only"` filter behavior (that mode no longer exists).
- **Editor tests:** Remove policy-row tests. Update filter persistence tests to verify `extensionSegments: { hidden: [...] }` output. Update navigation step counts (one fewer interactive row since the policy row is gone).

### README

Update the extension-status note to remove any reference to allowlist mode. The description should say extension statuses are visible by default and can be hidden individually via `/statusline`.

## Files touched

| File                   | Change                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `src/shared/types.ts`  | Replace `StatusFilter` with `ExtensionSegments`, rename field                        |
| `src/core/config.ts`   | Rename + simplify normalize/save/merge/clone functions, add legacy migration         |
| `src/tui/render.ts`    | Rename `filter` to `extensionSegments` in `FooterRenderInput`, simplify filter logic |
| `src/tui/editor.ts`    | Remove policy row, simplify draft-to-config mapping, rename field                    |
| `src/index.ts`         | Update `filter:` to `extensionSegments:` at call site                                |
| `tests/config.test.ts` | Update normalize tests, add migration tests                                          |
| `tests/render.test.ts` | Update extension-status tests to use new field name                                  |
| `tests/editor.test.ts` | Remove policy-row tests, update step counts and filter assertions                    |
| `README.md`            | Update extension-status description                                                  |
