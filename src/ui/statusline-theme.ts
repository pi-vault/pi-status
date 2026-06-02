// Internal theme adapter for the `/statusline` configuration menu.
//
// This module owns the only place where the editor reads from Pi's live theme
// object. The editor itself only sees the narrow `StatuslineMenuTheme`
// surface so menu styling stays in one place, and the live Pi theme remains
// the single source of truth for menu colors while `/statusline` is open.
//
// The menu's own color usage is a narrow subset of Pi's palette
// (`accent`, `borderMuted`, `dim`); the union below is widened to also cover
// the `buildFooterLine` colors so the same adapted theme can feed the bottom
// preview line as well. The widened union is a strict superset of
// `FooterRenderColor` (defined in `../render.ts`), which makes a
// `StatuslineMenuTheme` assignable to the `ThemeLike` that `buildFooterLine`
// expects.

import type { FooterRenderColor } from "../render.ts";

export type StatuslineMenuColor = FooterRenderColor | "borderMuted";

export type StatuslineMenuTheme = {
  fg: (color: StatuslineMenuColor, text: string) => string;
  bold: (text: string) => string;
  dim: (text: string) => string;
};

// Shape of the live Pi theme object we care about. Kept narrow on purpose:
// the adapter only needs `fg` and `bold`; everything else is derived from
// those two primitives.
type PiThemeLike = {
  fg: (color: string, text: string) => string;
  bold: (text: string) => string;
};

function isPiThemeLike(value: unknown): value is PiThemeLike {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { fg?: unknown; bold?: unknown };
  return (
    typeof candidate.fg === "function" && typeof candidate.bold === "function"
  );
}

// Passthrough fallback. Used for tests and for any runtime where the live Pi
// theme is missing the methods we need. All calls return the input text
// unchanged, so styled output collapses to plain text.
export const noTheme: StatuslineMenuTheme = {
  fg: (_color, text) => text,
  bold: (text) => text,
  dim: (text) => text,
};

// Adapt a Pi theme object into the narrow `StatuslineMenuTheme` surface used
// by the editor. Returns `noTheme` for anything that is missing the required
// `fg` or `bold` methods so the editor never has to deal with partial
// runtime themes. The returned object captures the Pi theme by reference, so
// when Pi swaps the live theme instance the next render picks up the new
// colors without reopening `/statusline`.
export function fromPiTheme(theme: unknown): StatuslineMenuTheme {
  if (!isPiThemeLike(theme)) return noTheme;
  const pi = theme;
  return {
    fg: (color, text) => pi.fg(color, text),
    bold: (text) => pi.bold(text),
    // Pi exposes "dim" as a foreground color role, not as a separate method,
    // so the menu's `dim` helper is just a thin wrapper around `fg("dim", …)`.
    dim: (text) => pi.fg("dim", text),
  };
}
