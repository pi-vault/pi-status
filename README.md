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

You can opt into extra local-only segments with JSON config:

- Default path: `~/.pi/agent/pi-status.json`
- Override path: `PI_STATUS_CONFIG`
- Relative `PI_STATUS_CONFIG` is resolved from current working directory
- Config is loaded once at extension init (restart Pi after edits)

```json
{
  "segments": ["model-with-reasoning", "current-dir"]
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

If the file is missing, unreadable, malformed, wrong shape, or has invalid segment entries, pi-status silently falls back to defaults.

## Local Verification

```bash
pnpm check
pnpm pack --dry-run
pi -e .
```
