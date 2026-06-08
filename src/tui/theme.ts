import type { FooterRenderColor } from "./render.ts";

export type StatusLineMenuColor = FooterRenderColor | "borderMuted";

export type StatusLineTheme = {
  fg: (color: StatusLineMenuColor, text: string) => string;
  bold: (text: string) => string;
  dim: (text: string) => string;
};

type PiThemeLike = {
  fg: (color: string, text: string) => string;
  bold: (text: string) => string;
};

function isPiThemeLike(value: unknown): value is PiThemeLike {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { fg?: unknown; bold?: unknown };
  return typeof candidate.fg === "function" && typeof candidate.bold === "function";
}

export const noTheme: StatusLineTheme = {
  fg: (_color, text) => text,
  bold: (text) => text,
  dim: (text) => text,
};

export function fromPiTheme(theme: unknown): StatusLineTheme {
  if (!isPiThemeLike(theme)) return noTheme;
  return {
    fg: (color, text) => theme.fg(color, text),
    bold: (text) => theme.bold(text),
    dim: (text) => theme.fg("dim", text),
  };
}
