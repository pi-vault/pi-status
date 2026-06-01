# pi-status

`@pi-vault/pi-status` is a Pi extension that replaces Pi's default footer with a sparse Codex-style line.

Default output:

`model-with-reasoning · current-dir`

## Install

```bash
pi install -e .
```

Or after publish:

```bash
pi install npm:@pi-vault/pi-status
```

## Local JSON config

You can opt into extra footer segments with JSON config:

- Default path: `~/.pi/agent/pi-status.json`
- Override path: `PI_STATUS_CONFIG`
- Relative `PI_STATUS_CONFIG` is resolved from current working directory
- Config is loaded once at extension init (restart Pi after edits)

```json
{
  "segments": ["model-with-reasoning", "current-dir"],
  "statusFilter": { "mode": "all", "hidden": [] }
}
```

Supported segment IDs:

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
- `five-hour-limit` (from `@pi-vault/pi-usage`, Codex only)
- `weekly-limit` (from `@pi-vault/pi-usage`, Codex only)
- `extension-statuses`

Example:

```json
{
  "segments": [
    "model",
    "run-state",
    "git-branch",
    "context-used",
    "context-remaining",
    "session-id"
  ]
}
```

`statusFilter` controls `extension-statuses`:

- `{"mode":"all","hidden":["extA"]}` = show all except hidden keys
- `{"mode":"only","shown":["extA","extB"]}` = show only listed keys

If the file is missing, unreadable, malformed, wrong shape, or has invalid entries, pi-status silently falls back to defaults.

## Local Verification

```bash
pnpm check
pnpm pack --dry-run
pi -e .
```
