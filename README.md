# pi-status

`@pi-vault/pi-status` is a Pi extension that replaces Pi's default footer with a sparse Codex-style line:

`model-with-reasoning · current-dir`

## Install

```bash
pi install -e .
```

Or after publish:

```bash
pi install npm:@pi-vault/pi-status
```

## Phase 2 Scope

This package currently ships only the default footer line. It does not yet add configuration, `/statusline`, rate limits, git branch rendering, or extension statuses.

## Local Verification

```bash
pnpm check
pnpm pack --dry-run
pi -e .
```

In Pi, verify that the footer shows the active model plus current directory, updates on tree changes, and disappears on shutdown or unload.
