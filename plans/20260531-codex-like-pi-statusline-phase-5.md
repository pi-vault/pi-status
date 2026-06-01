# Phase 5: Add Interactive `/statusline` With `settings.json` Persistence

## Usable Result

Users can configure the full statusline inside Pi and persist it only in Pi `settings.json`.

## Dependencies

- Complete Phase 4 first.

## Public Interface

Persist statusline config under Pi settings as:

```json
{
  "statusLine": {
    "segments": ["model-with-reasoning", "current-dir"],
    "filter": { "mode": "all", "hidden": [] }
  }
}
```

Keep the existing config shape:

```ts
interface PiStatusConfig {
  segments: StatusLineSegmentId[];
  filter:
    | { mode: "all"; hidden: string[] }
    | { mode: "only"; shown: string[] };
}
```

Add `project-root` to `StatusLineSegmentId`.

## Configuration Rules

### Read Precedence

Load config from the first applicable source in this order:

1. Merged Pi settings:
   - `~/.pi/agent/settings.json`
   - `.pi/settings.json` overriding global
2. Built-in defaults

### Settings Behavior

- Read `statusLine` only when the parsed settings file is a JSON object.
- Merge global and project `statusLine` the same way Pi merges settings:
  - project overrides global
  - nested `filter` object merges by key
  - arrays replace, they do not concatenate
- If a settings file is missing, unreadable, malformed, or not an object, ignore that file and continue with lower-risk fallbacks.

### Write Target

Persist `/statusline` saves into Pi settings.

- If project `.pi/settings.json` already contains a top-level `statusLine` key, write to project settings.
- Otherwise write to global `~/.pi/agent/settings.json`.
- Preserve all unrelated settings keys in the chosen file.
- If the chosen target file exists but is malformed JSON or not a JSON object, refuse the save and surface a user-visible warning.
- Write atomically using temp-file-plus-rename within the same directory.

## Implementation

### Runtime Config State

- Replace startup-only config loading with mutable in-memory config state owned by the extension runtime.
- Initialize runtime config from the precedence rules above.
- Continue rendering from the current runtime config on every footer repaint.
- On successful `/statusline` save:
  - update runtime config immediately
  - request footer rerender immediately
- On cancel or failed save:
  - leave runtime config unchanged
  - leave disk config unchanged

### `/statusline` Command

- Register `/statusline` with `pi.registerCommand`.
- If `ctx.hasUI` is false, show a warning and exit without attempting custom UI.
- Open a custom overlay via `ctx.ui.custom()`.
- Use the existing footer rendering pipeline to generate the live preview, so preview behavior matches the real footer:
  - same segment formatting
  - same omission of unavailable segments
  - same width truncation behavior

### Overlay Behavior

- Show one ordered list containing:
  - configurable statusline segments
  - discovered extension-status rows
  - a `New extension statuses` policy row
- Keyboard behavior:
  - `Up` / `Down`: move selection
  - `Space`: toggle the selected row
  - `Left` / `Right`: reorder enabled segment rows
  - `Enter`: save draft and close
  - `Esc`: discard draft and close
- Reordering rules:
  - only reorder actual segment rows
  - never reorder discovered extension-status rows
  - disable reorder while search filtering is active
- Search behavior:
  - support fuzzy search over segment labels and discovered extension-status keys
  - when search is non-empty, keep toggle/navigation active and disable reorder
- Preview behavior:
  - update live as the draft changes
  - preview against current runtime/session data, not placeholder data

### Segment And Status Modeling

- Extend the configurable segment catalog with `project-root`.
- `project-root` renders the basename of the nearest ancestor of `cwd` that contains either `.git` or `.pi/settings.json`.
- Walk upward from `cwd`; the nearest matching ancestor wins.
- If no matching ancestor can be inferred, omit `project-root`.
- Keep `current-dir` behavior unchanged; it still renders the current path.
- Continue storing extension status visibility through `filter`.
- Build discovered extension-status rows from the current `footerData.getExtensionStatuses()` keys, sorted ascending.
- Include a `New extension statuses` row that controls how unseen future keys are handled.

Map UI state to persisted `filter` as follows:

- `New extension statuses = shown`:
  - persist `mode: "all"`
  - store hidden discovered keys in `hidden`
- `New extension statuses = hidden`:
  - persist `mode: "only"`
  - store shown discovered keys in `shown`

This keeps the persisted config shape unchanged while supporting the interactive policy toggle.

### Compatibility

- Preserve current defaults when no config is present:
  - `segments = ["model-with-reasoning", "current-dir"]`
  - `filter = { mode: "all", hidden: [] }`
- Preserve silent fallback to defaults for invalid config values after normalization.
- Do not read from, write to, document, or otherwise depend on any separate `pi-status.json`-style statusline file.

## Verification

- Test config loading precedence:
  - merged project/global settings override defaults
- Test settings parsing and merging:
  - missing project/global files
  - malformed settings files
  - non-object settings files
  - nested `filter` precedence
- Test save targeting:
  - write to project when project already defines `statusLine`
  - otherwise write to global
  - preserve unrelated keys in target settings file
  - refuse write on malformed/non-object target file
  - atomic save path updates target file contents correctly
- Test `project-root` behavior:
  - nearest `.git` ancestor
  - nearest `.pi/settings.json` ancestor
  - nearest matching ancestor wins when both exist at different levels
  - render basename only
  - omit when no root can be inferred
- Test overlay behavior:
  - toggle, reorder, navigation, and fuzzy search
  - reorder disabled during active search
  - live preview updates on draft change
  - `Enter` saves and updates runtime config
  - `Esc` cancels without write
- Test extension-status behavior:
  - deterministic discovered-key ordering
  - `mode: "all"` mapping from shown-new policy
  - `mode: "only"` mapping from hidden-new policy
  - new-key default visibility behavior after save
- Test runtime behavior:
  - saved config takes effect without Pi restart
  - saved config survives Pi restart
  - `/reload` reloads persisted settings correctly
- Run `pnpm check`.
- Run `pnpm pack --dry-run`.
- Smoke test persistence, terminal resizing, reload behavior, status filtering, and `project-root` rendering in Pi.

## Completion Criteria

- `/statusline` supports the complete persisted configuration without manual edits to any separate statusline file.
- The canonical persisted store is `statusLine` inside Pi `settings.json`.
- `project-root` is available as a configurable segment and omits itself when no root can be inferred.
- Cancel leaves runtime and disk configuration unchanged.
- Saved configuration applies immediately and survives a Pi restart.

## Deferred Work

- Powerline glyphs
- Multi-row overflow
- Presets
- Cost display
- Tool activity
- Progress estimation
- Provider-general rate-limit compatibility
