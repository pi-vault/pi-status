# @pi-vault/pi-status

[![npm version](https://img.shields.io/npm/v/%40pi-vault%2Fpi-status)](https://www.npmjs.com/package/@pi-vault/pi-status)
[![Quality](https://github.com/pi-vault/pi-status/actions/workflows/quality.yml/badge.svg?branch=master)](https://github.com/pi-vault/pi-status/actions/workflows/quality.yml)
[![Node >= 22.12](https://img.shields.io/badge/node-%3E%3D22.12-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

Replace Pi's default footer with a cleaner Codex-style status line that stays out of the way but keeps the useful bits visible.

Default status line:

`model-with-reasoning · current-dir`

## Install

Install `pi-status`:

```bash
pi install npm:@pi-vault/pi-status
```

Optional: install `pi-usage` if you want `/usage` plus the usage-backed footer segments:

```bash
pi install npm:@pi-vault/pi-usage
```

Then reload Pi:

```bash
/reload
```

## Use

Once installed, the footer updates automatically.

Use `/statusline` inside Pi to:

- turn footer items on or off
- reorder the items you want to see
- preview the result before saving
- control which extension status messages are shown

Changes are saved and reused the next time Pi starts.

## Available Status Items

You can build your footer from these items:

- `model`
- `model-with-reasoning`
- `project-name`
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
- `five-hour-limit`
- `weekly-limit`
- `extension-statuses`

`five-hour-limit` and `weekly-limit` require standalone [`@pi-vault/pi-usage`](https://www.npmjs.com/package/@pi-vault/pi-usage). When `pi-usage` is not installed or has not responded yet, those items are hidden from `/statusline` and omitted from the footer.

## Common Setups

Keep it minimal:

```text
model-with-reasoning · current-dir
```

Show more session detail:

```text
model · run-state · git-branch · context-used · context-remaining · session-id
```

## Compatibility

- Node.js `>=22.12`
- Pi host environment with `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui`
- Tested in this repo against `@earendil-works/pi-coding-agent@0.78.x` and `@earendil-works/pi-tui@0.78.x`

## Development Setup

```bash
pnpm install
pnpm check
pnpm pack --dry-run
pi -e .
```

## License

MIT
