# @pi-vault/pi-status

[![npm version](https://img.shields.io/npm/v/%40pi-vault%2Fpi-status)](https://www.npmjs.com/package/@pi-vault/pi-status)
[![Quality](https://github.com/pi-vault/pi-status/actions/workflows/quality.yml/badge.svg?branch=master)](https://github.com/pi-vault/pi-status/actions/workflows/quality.yml)
[![Node >= 24.15.0](https://img.shields.io/badge/node-%3E%3D24.15.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

Replace Pi's default footer with a compact, configurable status line that shows the session details you actually care about. `@pi-vault/pi-status` installs a live footer, adds `/statusline` for interactive configuration, and surfaces a sidebar with the same live session data. Optionally, install [`@pi-vault/pi-usage`](https://www.npmjs.com/package/@pi-vault/pi-usage) to light up usage-limit segments.

![Status UI](docs/assets/status-ui.png)
![Status Dashboard](docs/assets/status-dashboard.png)

## Install, Upgrade, & Reload

Install or upgrade the extension:

```bash
pi install npm:@pi-vault/pi-status
```

Optional: install `pi-usage` if you want the `five-hour-limit` and `weekly-limit` footer segments:

```bash
pi install npm:@pi-vault/pi-usage
```

Reload Pi after installing or upgrading:

```bash
/reload
```

## Quick Start

Once installed, the footer updates automatically. Run `/statusline` inside Pi to open the dashboard — a centered overlay with six tabs:

- **Statusbar** — the four-zone footer layout (TL, TR, BL, BR).
- **Sidebar** — toggle, reorder, and search the panels that show on the right edge.
- **Statuses** — per-key visibility for extension-reported status text.
- **Session** — current session details, with Rename and Compact inside the same overlay.
- **Tools** — per-tool enable/disable; applies immediately.
- **Settings** — independently toggle Statusbar and Sidebar visibility, select their shared colour preset, and opt in to completion notifications.

`Tab` / `Shift+Tab` moves between tabs, arrow keys navigate, `Space` toggles, type to search. The saved footer remains visible behind the dashboard overlay.

`/statusline` stays available even when both the Statusbar and Sidebar are disabled — you can re-enable either surface from the Settings tab at any time.

Pi 1.5.2 or newer is required.

## Available Segments

You can compose the footer from these segment IDs:

- `model`
- `model-with-reasoning`
- `project-name`
- `current-dir`
- `git-branch`
- `workspace-pulse`
- `run-state`
- `context-remaining`
- `context-used`
- `used-tokens`
- `total-input-tokens`
- `total-output-tokens`
- `session-id`
- `five-hour-limit`
- `weekly-limit`
- `cache-read-tokens`
- `cache-write-tokens`
- `cache-hit`
- `session-cost`
- `access-type`
- `turn-progress`
- `response-performance`

`five-hour-limit` and `weekly-limit` require [`@pi-vault/pi-usage`](https://www.npmjs.com/package/@pi-vault/pi-usage); they appear in `/statusline` only after `pi-usage` is loaded.

The five telemetry segments (`cache-read-tokens`, `cache-write-tokens`, `cache-hit`, `session-cost`, `access-type`) are opt-in — none are enabled by default. `access-type` reads `subscription` for OAuth or `kimi-coding` models and `metered` otherwise. `session-cost` is best-effort telemetry rather than billing-grade data.

The two live activity segments (`turn-progress`, `response-performance`) are also opt-in and session-local — nothing is persisted and nothing leaves the runtime. `turn-progress` shows the active tool (or the most recent one) plus counts. `response-performance` shows time-to-first-token and a streaming tokens-per-second estimate.

Default footer:

```text
model-with-reasoning
current-dir
```

### Workspace Pulse

`workspace-pulse` is an opt-in, read-only Git workspace summary. It runs only two bounded `git` commands per refresh (root lookup and a porcelain status), each with a 2-second timeout and a 256 KiB cap, and it never blocks other Git operations. Refreshes happen on session start, every `turn_start`, and 250 ms after every `tool_execution_end`. It never polls the filesystem.

Output: a `Git` anchor, a clean / conflict indicator, the branch name, staged / unstaged / untracked counts, and ahead / behind upstream. When a refresh fails, the last known state stays visible with a stale marker. Changed-file paths are never retained or displayed.

Workspace Pulse runs Git only in projects Pi trusts. In an untrusted project the `workspace-pulse` segment and the sidebar Workspace panel show `Git · untrusted`. To enable it, run `/trust`, save the decision, then restart Pi. `/reload` keeps the session's existing trust decision. Projects without project-local Pi resources are trusted by default. The separate `git-branch` segment comes from Pi's own footer data and is unaffected.

## Footer Layout And Extension Statuses

The footer has four ordered zones: TL (top-left), TR (top-right), BL (bottom-left), BR (bottom-right). Top zones render on the first row, bottom zones on the second; left zones left-align, right zones right-align. The two rows fit independently at narrow widths — lower-priority items drop as needed, then the remaining line is truncated.

Extension statuses are not normal footer segments. Visible statuses are pinned to the bottom-right zone and drop before configured segments when space is tight. Use `/statusline` to hide individual status keys.

## Common Examples

Each example below is a value for the `"zones"` field in `statusline.json`.

Keep the default layout:

```json
{
  "topLeft": ["model-with-reasoning"],
  "topRight": [],
  "bottomLeft": ["current-dir"],
  "bottomRight": []
}
```

Show more session detail on the top row:

```json
{
  "topLeft": ["model", "run-state", "git-branch"],
  "topRight": ["context-used", "context-remaining", "session-id"],
  "bottomLeft": [],
  "bottomRight": []
}
```

Usage-aware footer:

```json
{
  "topLeft": ["model-with-reasoning"],
  "topRight": [],
  "bottomLeft": ["current-dir"],
  "bottomRight": ["five-hour-limit", "weekly-limit"]
}
```

If another extension reports status text, it appears in the bottom-right zone.

## Configuration Behavior

`@pi-vault/pi-status` stores one global configuration file at `<Pi agent directory>/extensions/statusline.json`. When `PI_CODING_AGENT_DIR` is set, the path is `$PI_CODING_AGENT_DIR/extensions/statusline.json`; otherwise Pi supplies its default agent directory.

```json
{
  "statusbarEnabled": true,
  "sidebarEnabled": true,
  "sidebarMode": "manual",
  "sidebarWidth": 44,
  "zones": {
    "topLeft": ["model-with-reasoning"],
    "topRight": [],
    "bottomLeft": ["current-dir"],
    "bottomRight": []
  },
  "extensionSegments": { "hidden": [] },
  "completionNotifications": false,
  "colors": {
    "preset": "pi",
    "custom": {
      "accent": "#b18cff",
      "primary": "#d4d4d4",
      "muted": "#808080",
      "dim": "#666666",
      "ready": "#6ea8fe",
      "working": "#ff9f43",
      "input": "#6ea8fe",
      "output": "#b18cff",
      "cache": "#7dd3fc",
      "cost": "#ff9f43",
      "context": "#6ea8fe",
      "menu": "#b18cff",
      "warning": "#ff9f43",
      "error": "#ff5d73"
    },
    "customInitialized": false
  }
}
```

`statusbarEnabled` and `sidebarEnabled` both default to `true`. Only the literal JSON value `false` disables a surface; any other value (`true`, missing, `null`, numbers, strings, arrays, objects) leaves that surface enabled. Older or hand-edited files therefore load with both surfaces on. The next successful `/statusline` save rewrites both fields as canonical booleans.

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `sidebarMode` | `"manual"` or `"auto"` | `"manual"` | Auto collapses and reopens the Sidebar with terminal width. Any other value loads as `"manual"`. Also a Settings row in `/statusline`. |
| `sidebarWidth` | integer 28–72 | `44` | Starting Sidebar width for new sessions. Out-of-range integers are clamped; other values load as `44`. A confirmed resize saves it. |

When the Statusbar is disabled, pi-status restores Pi's built-in footer through `ctx.ui.setFooter(undefined)` rather than installing a blank custom footer. When the Sidebar is disabled, the live right-edge Sidebar is hidden but `/statusline`, panel discovery, and the controller lifecycle remain available so you can re-enable it later.

Missing, malformed, or empty layouts fall back to the default layout. A legacy direct config with a `"segments"` array still loads by placing those segments in TL; the first save from `/statusline` rewrites it to the `zones` shape. There are no project-specific overrides — pi-status no longer reads or writes Pi's global or project `settings.json`.

### Colours

Pi is the default colour preset. It resolves Pi's active theme on every Dashboard, Statusbar, and Sidebar render, so changing Pi's theme updates all three surfaces without changing pi-status configuration.

The Dashboard order is Pi, Atelier, Catppuccin Mocha, Catppuccin Latte, Dracula, Dracula Alucard, Tokyo Night Moon, Tokyo Night Day, and Custom. Catppuccin Mocha/Latte, Dracula/Alucard, and Tokyo Night Moon/Day are explicit dark/light choices; fixed presets do not switch automatically. Their local constants are attributed to the official [Catppuccin palette](https://github.com/catppuccin/palette/blob/main/palette.json), [Dracula palettes](https://github.com/dracula/dracula-theme#color-palette), and [TokyoNight sources](https://github.com/folke/tokyonight.nvim/tree/main/lua/tokyonight/colors).

The first switch to Custom copies the selected fixed palette; switching from Pi copies Atelier because Pi exposes live theme operations rather than stable hex values. Later preset switches preserve all 14 Custom roles. Custom is editable from the Settings tab: the row opens per-role hex inputs that validate case-insensitive `#rrggbb`, persist lowercase values, and require truecolour terminal support. `NO_COLOR` continues to disable styling across Dashboard, Statusbar, and Sidebar without changing the saved preset.

## Surface Visibility Outcomes

The two Settings-tab checkboxes are independent and take effect immediately after Save (and again at the next session start):

- **Statusbar enabled** installs the pi-status custom footer.
- **Statusbar disabled** restores Pi's built-in footer; pi-status does not leave a blank footer behind.
- **Sidebar enabled** shows the right-edge pi-status Sidebar.
- **Sidebar disabled** hides the live Sidebar; `/statusline`, the panel registry, and the controller lifecycle stay mounted so you can re-enable the Sidebar later from the Settings tab.

All four combinations of the two checkboxes are supported. `/statusline` remains reachable even when both surfaces are disabled.

## Completion Notifications

The Settings tab in `/statusline` controls an opt-in, global preference for direct-terminal notifications when a TUI agent run settles or `@pi-vault/pi-questionnaire` enters its wait state. The preference is off by default and lives in `extensions/statusline.json`.

Outside a Herdr pane, the preference enables Ghostty OSC 9 notifications with fixed text (`Pi finished` / `Pi needs input`). Terminal control characters are removed before sending, and write failures do not interrupt Pi.

Inside a Herdr pane (`HERDR_ENV=1`), pi-status forwards the same semantic events to Herdr and lets it decide how to present them. The official Herdr Pi integration owns settlement state, presentation, toast delivery, delay, and sound.

RPC and print contexts do not receive direct notifications.

## Sidebar

`@pi-vault/pi-status` installs a right-edge, non-capturing sidebar that surfaces the same live data the footer tracks — session, run, turn, tools, workspace pulse, extension statuses — alongside optional contributions from other extensions. The sidebar is on by default and runs only in TUI sessions.

On the regular Pi TUI, the live Sidebar is composed into the trailing logical render block of `tui.render()` and scrolls away with that block rather than staying fixed to the viewport. Pi exposes no arbitrary historical scroll-position API, so the Sidebar does not pin to a separately selected terminal scroll position. In Pi's fullscreen mode the Sidebar is a column beside the transcript: pi-status wraps Pi's fullscreen layout in a two-column layout, so it stays fixed to the viewport and scrolls independently of the chat. The mode is detected when Pi starts. Pi blocks switching between fullscreen and regular mode while pi-status is loaded, so restart Pi after changing the mode setting.

Fullscreen limitations:

- Resize is keyboard-only (no divider drag), because Pi's fullscreen viewport owns the mouse.
- A text selection that starts outside the transcript (for example in the editor) can include Sidebar text.
- Sidebar rows beside an inline image in the transcript are blank, as in regular mode.

### Built-in panels and order

Nine built-in panels ship in this default order:

1. `agent` — current model, provider, thinking level, access type
2. `activity` — run, turn, tool count, TTFT / tokens-per-second
3. `alerts` — extension statuses whose text matches an exception keyword
4. `statuses` — every other discovered extension status
5. `todos` — pending / in-progress / completed task list
6. `context` — used tokens, context window, percentage, meter
7. `workspace` — project name, branch, workspace pulse summary
8. `usage` — session input/output/cache tokens and cost
9. `tools` — active vs available tool count, optionally expanded to names

### Width and resize

At very narrow widths the sidebar collapses to a compact layout; at widths below 92 columns it hides entirely to preserve the main viewport. Press `Ctrl+Shift+R` to enter temporary Resize mode, then use arrow keys to adjust the width, `Enter` to accept, `Escape` to restore the previous width. On the regular TUI you can also drag the divider with the mouse while in Resize mode; in fullscreen, resize is keyboard-only.

A confirmed resize that changed the width (`Enter`, or releasing the mouse after a drag) becomes `sidebarWidth` and is saved to `statusline.json` for new sessions. `Escape`, an unchanged `Enter`, and terminal resizes never change the saved width. You can also set `sidebarWidth` by hand in the file.

### Auto mode

Set **Sidebar mode** to **Auto** in `/statusline` → Settings (or `"sidebarMode": "auto"`) and the Sidebar follows the terminal width instead of the 92-column cut-off:

- It collapses when the terminal is narrower than `80 + sidebarWidth` columns. With the default width of 44, that is below 124.
- It reopens only at `80 + sidebarWidth + 8` columns (132 by default). The 8-column gap stops it flickering at the edge.
- `Ctrl+Shift+R` is off in auto mode and shows a notice. Switch to Manual to resize.
- Settings → **Sidebar** off hides the Sidebar in both modes, however wide the terminal.

Manual mode keeps the behaviour described above.

### Contributing panels

Other extensions can publish structured panels through the public contribution channel `pi-status:sidebar-panels`. Panel IDs must be namespaced (`vendor:name`). Newly registered contributions are hidden by default — add them via the Sidebar tab to make them appear.

Use `keyValues` for aligned label/value rows with optional progress bars:

```ts
registerSidebarPanel(pi, {
  id: "vendor:build",
  title: "Build",
  rows: ["CPU 42%", "Jobs 3"], // fallback for older pi-status versions
  keyValues: [
    { label: "CPU", value: "42%", valueRole: "warning", progress: 0.42 },
    { label: "Jobs", value: "3" },
  ],
});
```

| Field | Meaning |
| --- | --- |
| `label`, `value` | Required strings. The label is left-aligned and the value right-aligned at the sidebar width. |
| `labelRole` | Optional colour role. Defaults to `muted`. |
| `valueRole` | Optional colour role. Defaults to the panel `role`, else `primary`. |
| `progress` | Optional number from `0` to `1`. A bar is drawn between label and value when at least 4 columns fit. Other values are dropped and the row is kept. |

A panel accepts at most 24 `keyValues` entries, and each label and value is at most 160 visible characters. Keep `rows` as the fallback: older pi-status versions, and any empty or invalid `keyValues` list, render `rows`. Key/value rows are session-only, so moving or hiding one in the Sidebar tab does not survive a content update.

## Upgrade Notes For 0.3.x Users

If you are upgrading from `0.3.x`, note these compatibility changes:

- `/statusline` is the sole dashboard command; former `tools`, `session`, `notifications`, and `preset` arguments are no longer accepted.
- The dashboard is a six-tab overlay: Statusbar, Sidebar, Statuses, Session, Tools, Settings.
- Configuration lives in the global extension-owned `<Pi agent directory>/extensions/statusline.json`. Pi `settings.json` values are ignored and not migrated automatically.
- Per-tool sidebar rows replace the old global tool-name switch and default to disabled.
- Several new opt-in segments are available: `workspace-pulse`, `turn-progress`, `response-performance`, `cache-read-tokens`, `cache-write-tokens`, `cache-hit`, `session-cost`, `access-type`.
- The tested Pi host baseline is now `@earendil-works/pi-coding-agent@1.5.2` and `@earendil-works/pi-tui@1.5.2`.
- The extension requires Node.js `>=24.15.0`.

## Development & Verification

```bash
pnpm install
pnpm check
pnpm verify:pack
pnpm verify:install
pnpm run release:check
```

`release:check` runs `check`, then verifies the packed file set and that the packed tarball installs with Pi's npm flags and loads in Pi's extension loader.

## Acknowledgements

The sidebar was inspired by and builds on ideas from the [pi-atelier](https://github.com/michaelmjhhhh/pi-atelier)

## Changelog

See [`CHANGELOG.md`](CHANGELOG.md) for release notes.

## License

MIT. See [`LICENSE`](LICENSE).
