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

## Configuration

Use `/statusline` inside Pi to configure and persist statusline settings.

Primary persisted location:

- `statusLine` in Pi settings (`~/.pi/agent/settings.json` or `.pi/settings.json`)

Read precedence:

1. merged Pi settings (`~/.pi/agent/settings.json` + `.pi/settings.json`)
2. built-in defaults

```json
{
  "statusLine": {
    "segments": ["model-with-reasoning", "current-dir"],
    "filter": { "mode": "all", "hidden": [] }
  }
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
- `project-root`

Example:

```json
{
  "statusLine": {
    "segments": [
      "model",
      "run-state",
      "git-branch",
      "context-used",
      "context-remaining",
      "session-id"
    ]
  }
}
```

`filter` controls `extension-statuses`:

- `{"mode":"all","hidden":["extA"]}` = show all except hidden keys
- `{"mode":"only","shown":["extA","extB"]}` = show only listed keys

If config sources are missing, unreadable, malformed, wrong shape, or have invalid entries, pi-status silently falls back to defaults.

## Local Verification

```bash
pnpm check
pnpm pack --dry-run
pi -e .
```
