import { homedir } from "node:os";
import { truncateToWidth } from "@earendil-works/pi-tui";

export type ThemeLike = {
  fg: (color: string, text: string) => string;
};

export type ModelLike = {
  id?: string;
  name?: string;
  reasoning?: boolean;
};

export type FooterRenderInput = {
  model?: ModelLike;
  cwd: string;
  thinkingLevel: string;
};

function normalizeThinkingLevel(level: string): string {
  switch (level) {
    case "minimal":
      return "min";
    case "medium":
      return "med";
    default:
      return level;
  }
}

export function formatModelWithReasoning(
  model: ModelLike | undefined,
  thinkingLevel: string,
): string | null {
  const base = model?.name ?? model?.id;
  if (!base) return null;
  if (!model?.reasoning) return base;
  return `${base} [${normalizeThinkingLevel(thinkingLevel)}]`;
}

export function abbreviateHomeDir(cwd: string, home = homedir()): string {
  if (!home) return cwd;
  if (cwd === home) return "~";
  if (cwd.startsWith(`${home}/`)) return `~${cwd.slice(home.length)}`;
  return cwd;
}

export function buildFooterLine(input: FooterRenderInput, theme: ThemeLike, width: number): string {
  const parts: string[] = [];
  const model = formatModelWithReasoning(input.model, input.thinkingLevel);
  if (model) parts.push(theme.fg("accent", model));

  const currentDir = abbreviateHomeDir(input.cwd);
  if (currentDir) parts.push(theme.fg("success", currentDir));

  const line = parts.join(theme.fg("dim", " · "));
  return truncateToWidth(line, width);
}
