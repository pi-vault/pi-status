# Changelog

All notable changes to `@pi-vault/pi-status` are documented in this file.

## 0.2.1 - 2026-06-14

### Changed

- Updated the Pi host baseline to the `0.79.x` package line and refreshed the packaged dependency set.
- Reworked the README around install, reload, `/statusline`, footer segments, and `pi-usage` integration so the published docs match current behavior.
- Added this changelog to the published package contents.

### Internal

- Refactored internal snapshot and runtime-state code without changing the public behavior of the extension.
- Exported `formatSegment` with full test coverage to harden segment rendering behavior.

## 0.2.0 - 2026-06-07

### Added

- Screenshots for the live footer and interactive `/statusline` editor.
- A usage runtime that integrates with `@pi-vault/pi-usage` for live limit-backed footer segments.

### Changed

- Upgraded usage-backed segments to the `@pi-vault/pi-usage@0.2.x` line.
- Consolidated the TUI implementation and theme plumbing used by the footer preview and `/statusline`.
- Refreshed the README to cover the shipped UI and configuration flow.

## 0.1.0 - 2026-06-02

### Added

- Initial release of the Pi status line extension.
- A footer that can replace Pi's default footer with configurable status segments.
- The `/statusline` interactive editor for enabling, disabling, reordering, and previewing segments.
- Settings persistence through Pi's `settings.json` with project and global loading behavior.
- Segment support for model, reasoning level, project name, working directory, Git branch, run state, context metrics, token counts, session ID, usage limits, and extension statuses.
- Filtering controls for visible extension statuses.

### Changed

- Iterated on the `/statusline` UI to use sectioned rows, search, inline rendering, live preview, theme adaptation, and footer suppression while editing.
