import { describe, expect, it, vi } from "vitest";
import { Key, matchesKey, visibleWidth, type Component } from "@earendil-works/pi-tui";
import type { PiStatusConfig } from "../src/config.ts";
import type { FooterRenderInput, ThemeLike } from "../src/render.ts";
import { createStatuslineEditor } from "../src/statusline-ui.ts";

type EditorComponent = Component & { handleInput: (data: string) => void };

const UP = "\x1b[A";
const DOWN = "\x1b[B";
const LEFT = "\x1b[D";
const RIGHT = "\x1b[C";
const ENTER = "\r";
const ESCAPE = "\x1b";
const BACKSPACE = "\x7f";
const SPACE = " ";

const IDENTITY_THEME: ThemeLike = { fg: (_color, text) => text };

function makeConfig(overrides?: Partial<PiStatusConfig>): PiStatusConfig {
  return {
    segments: ["model-with-reasoning", "current-dir"],
    filter: { mode: "all", hidden: [] },
    ...overrides,
  };
}

function makePreviewInput(): Omit<FooterRenderInput, "segments" | "filter"> {
  return {
    cwd: "/Users/test/project",
    thinkingLevel: "medium",
    runState: "idle",
  };
}

function makeEditor(options?: {
  config?: PiStatusConfig;
  discovered?: string[];
  theme?: ThemeLike;
}) {
  const done = vi.fn();
  const requestRender = vi.fn();
  const editor = createStatuslineEditor({
    config: options?.config ?? makeConfig(),
    discoveredStatuses: options?.discovered ?? [],
    previewInput: makePreviewInput(),
    theme: options?.theme ?? IDENTITY_THEME,
    done,
    requestRender,
  }) as EditorComponent;
  return { editor, done, requestRender };
}

function stripAnsi(value: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI SGR sequences
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}

function renderLines(editor: EditorComponent, width = 120): string[] {
  return editor.render(width).map(stripAnsi);
}

function rowLines(lines: string[]): string[] {
  const previewIndex = lines.indexOf("Preview:");
  return lines.slice(5, previewIndex - 1);
}

function activeInteractiveRow(lines: string[]): string | undefined {
  return rowLines(lines).find((line) => /^> \[(?: |x|shown|hidden)/.test(line));
}

describe("statusline editor shell", () => {
  it("renders the exact Codex-style shell layout in order", () => {
    const { editor } = makeEditor();
    const lines = renderLines(editor);

    expect(lines.slice(0, 5)).toEqual([
      "Configure Status Line",
      "Select which items to display in the status line.",
      "",
      "Type to search",
      "> ",
    ]);
  });

  it("shows the visible query line for typed text", () => {
    const { editor } = makeEditor();
    editor.handleInput("m");
    editor.handleInput("o");
    editor.handleInput("d");
    expect(renderLines(editor)[4]).toBe("> mod");
  });

  it("always renders the preview block and help line", () => {
    const { editor } = makeEditor();
    const lines = renderLines(editor);
    const previewIndex = lines.indexOf("Preview:");

    expect(previewIndex).toBeGreaterThan(0);
    expect(lines[previewIndex - 1]).toBe("");
    expect(lines[previewIndex + 1].length).toBeGreaterThan(0);
    expect(lines.at(-1)).toBe(
      "Toggle: Space  •  Reorder: ← / →  •  Save: Enter  •  Cancel: Esc",
    );
  });

  it("swaps the reorder clause in the help line when search is active", () => {
    const { editor } = makeEditor();
    editor.handleInput("m");
    expect(renderLines(editor).at(-1)).toBe(
      "Toggle: Space  •  Reorder: disabled while search is active  •  Save: Enter  •  Cancel: Esc",
    );
  });
});

describe("statusline editor query input", () => {
  it("appends printable ASCII characters to the query but keeps Space reserved for toggle", () => {
    const { editor } = makeEditor();
    editor.handleInput("a");
    editor.handleInput("B");
    editor.handleInput("1");
    editor.handleInput(SPACE);
    expect(renderLines(editor)[4]).toBe("> aB1");
  });

  it("removes the last character on backspace", () => {
    const { editor } = makeEditor();
    editor.handleInput("a");
    editor.handleInput("b");
    editor.handleInput("c");
    editor.handleInput(BACKSPACE);
    expect(renderLines(editor)[4]).toBe("> ab");
  });
});

describe("statusline editor sections and ordering", () => {
  it("shows both section headers and the divider when query is empty", () => {
    const { editor } = makeEditor();
    const lines = rowLines(renderLines(editor));

    expect(lines).toContain("Status line items");
    expect(lines).toContain("Extension statuses");
    expect(lines.some((line) => /^─+$/.test(line))).toBe(true);
  });

  it("renders enabled segments before disabled segments", () => {
    const { editor } = makeEditor({
      config: makeConfig({
        segments: ["current-dir", "git-branch"],
      }),
    });
    const lines = rowLines(renderLines(editor, 200));
    const segmentLines = lines.filter(
      (line) =>
        line.includes("Model") ||
        line.includes("Current Dir") ||
        line.includes("Git Branch"),
    );

    expect(segmentLines[0]).toContain("Current Dir (1)");
    expect(segmentLines[1]).toContain("Git Branch (2)");
    expect(segmentLines[2]).toContain("Model");
  });

  it("preserves saved order for enabled segments", () => {
    const { editor } = makeEditor({
      config: makeConfig({
        segments: ["git-branch", "current-dir", "model"],
      }),
    });
    const lines = rowLines(renderLines(editor, 200));
    const enabledLines = lines.filter((line) => /\([123]\)/.test(line));

    expect(enabledLines[0]).toContain("Git Branch (1)");
    expect(enabledLines[1]).toContain("Current Dir (2)");
    expect(enabledLines[2]).toContain("Model (3)");
  });

  it("preserves canonical order for disabled segments", () => {
    const { editor } = makeEditor({
      config: makeConfig({ segments: ["current-dir"] }),
    });
    const lines = rowLines(renderLines(editor, 200));
    const modelIndex = lines.findIndex((line) => line.includes("Model"));
    const reasoningIndex = lines.findIndex((line) =>
      line.includes("Model + Reasoning"),
    );
    const projectRootIndex = lines.findIndex((line) =>
      line.includes("Project Root"),
    );

    expect(modelIndex).toBeLessThan(reasoningIndex);
    expect(reasoningIndex).toBeLessThan(projectRootIndex);
  });

  it("keeps discovered extension-status rows alphabetically sorted", () => {
    const { editor } = makeEditor({
      discovered: ["zeta-status", "alpha-status", "beta-status"],
    });
    const lines = rowLines(renderLines(editor, 200));
    const alphaIndex = lines.findIndex((line) => line.includes("alpha-status"));
    const betaIndex = lines.findIndex((line) => line.includes("beta-status"));
    const zetaIndex = lines.findIndex((line) => line.includes("zeta-status"));

    expect(alphaIndex).toBeLessThan(betaIndex);
    expect(betaIndex).toBeLessThan(zetaIndex);
  });

  it("renders the policy row before discovered extension-status rows", () => {
    const { editor } = makeEditor({
      discovered: ["alpha-status", "beta-status"],
    });
    const lines = rowLines(renderLines(editor, 200));
    const policyIndex = lines.findIndex((line) =>
      line.includes("New extension statuses"),
    );
    const alphaIndex = lines.findIndex((line) => line.includes("alpha-status"));

    expect(policyIndex).toBeLessThan(alphaIndex);
  });

  it("shows the empty-state hint when no extension statuses are discovered", () => {
    const { editor } = makeEditor();
    const lines = rowLines(renderLines(editor, 200));

    expect(lines.some((line) => line.includes("New extension statuses"))).toBe(true);
    expect(lines).toContain("No extension statuses discovered yet.");
  });
});

describe("statusline editor search", () => {
  it("searches segment rows by label and description", () => {
    const { editor } = makeEditor();
    for (const char of "nearest") editor.handleInput(char);
    const lines = rowLines(renderLines(editor, 200));

    expect(lines.some((line) => line.includes("Project Root"))).toBe(true);
    expect(lines.some((line) => line.includes("Model + Reasoning"))).toBe(false);
  });

  it("searches discovered status rows by key and generic description", () => {
    const { editor } = makeEditor({ discovered: ["custom-status"] });

    for (const char of "custom") editor.handleInput(char);
    let lines = rowLines(renderLines(editor, 200));
    expect(lines.some((line) => line.includes("custom-status"))).toBe(true);

    for (let i = 0; i < 6; i++) editor.handleInput(BACKSPACE);
    for (const char of "enabled") editor.handleInput(char);
    lines = rowLines(renderLines(editor, 200));
    expect(lines.some((line) => line.includes("custom-status"))).toBe(true);
  });

  it("searches the policy row by label and description", () => {
    const { editor } = makeEditor({ discovered: ["custom-status"] });
    for (const char of "newly") editor.handleInput(char);
    const lines = rowLines(renderLines(editor, 200));

    expect(lines.some((line) => line.includes("New extension statuses"))).toBe(true);
    expect(lines.some((line) => line.includes("custom-status"))).toBe(false);
  });

  it("omits section headers, divider, and empty-state hint while searching", () => {
    const { editor } = makeEditor();
    editor.handleInput("m");
    const lines = rowLines(renderLines(editor, 200));

    expect(lines).not.toContain("Status line items");
    expect(lines).not.toContain("Extension statuses");
    expect(lines.some((line) => /^─+$/.test(line))).toBe(false);
    expect(lines).not.toContain("No extension statuses discovered yet.");
  });

  it("does not force the policy row visible during search", () => {
    const { editor } = makeEditor({ discovered: ["alpha-status"] });
    for (const char of "alpha") editor.handleInput(char);
    const lines = rowLines(renderLines(editor, 200));

    expect(lines.some((line) => line.includes("alpha-status"))).toBe(true);
    expect(lines.some((line) => line.includes("New extension statuses"))).toBe(false);
  });

  it("shows an empty list area when a non-empty search has no matches", () => {
    const { editor } = makeEditor({ discovered: ["alpha-status"] });
    for (const char of "zzz") editor.handleInput(char);
    expect(rowLines(renderLines(editor, 200))).toEqual([]);
  });
});

describe("statusline editor descriptions", () => {
  it("renders segment descriptions with the exact copy", () => {
    const { editor } = makeEditor();
    const lines = renderLines(editor, 200);

    expect(
      lines.some((line) =>
        line.includes(
          "Show the current model name and reasoning level. Hidden when no model is available.",
        ),
      ),
    ).toBe(true);
    expect(
      lines.some((line) =>
        line.includes(
          "Show the nearest project root folder name. Hidden when no project root is detected.",
        ),
      ),
    ).toBe(true);
  });

  it("renders generic descriptions for discovered rows and the policy row", () => {
    const { editor } = makeEditor({ discovered: ["custom-status"] });
    const lines = renderLines(editor, 200);

    expect(
      lines.some((line) =>
        line.includes(
          "Show or hide this extension status when extension-statuses is enabled.",
        ),
      ),
    ).toBe(true);
    expect(
      lines.some((line) =>
        line.includes(
          "Whether newly discovered extension statuses are shown by default.",
        ),
      ),
    ).toBe(true);
  });
});

describe("statusline editor interactions", () => {
  it("moves up and down across interactive rows only", () => {
    const { editor } = makeEditor();
    const before = activeInteractiveRow(renderLines(editor, 200));
    editor.handleInput(DOWN);
    const after = activeInteractiveRow(renderLines(editor, 200));

    expect(before).toContain("Model + Reasoning");
    expect(after).toContain("Current Dir");
  });

  it("toggles the currently selected segment row on space", () => {
    const { editor, done } = makeEditor();
    editor.handleInput(SPACE);
    editor.handleInput(ENTER);
    const saved = done.mock.calls[0]?.[0] as PiStatusConfig | null;

    expect(saved?.segments).toEqual(["current-dir"]);
  });

  it("reorders enabled segments with left and right", () => {
    const { editor, done } = makeEditor({
      config: makeConfig({ segments: ["model", "current-dir"] }),
    });
    editor.handleInput(DOWN);
    editor.handleInput(LEFT);
    editor.handleInput(ENTER);
    const saved = done.mock.calls[0]?.[0] as PiStatusConfig | null;

    expect(saved?.segments).toEqual(["current-dir", "model"]);
  });

  it("keeps left/right as no-ops for disabled segments", () => {
    const { editor, done } = makeEditor({
      config: makeConfig({ segments: ["current-dir"] }),
    });
    editor.handleInput(LEFT);
    editor.handleInput(RIGHT);
    editor.handleInput(ENTER);
    const saved = done.mock.calls[0]?.[0] as PiStatusConfig | null;

    expect(saved?.segments).toEqual(["current-dir"]);
  });

  it("keeps left/right as no-ops for the policy row and discovered rows", () => {
    const { editor, done } = makeEditor({ discovered: ["alpha-status"] });
    for (let i = 0; i < 16; i++) editor.handleInput(DOWN);
    editor.handleInput(LEFT);
    editor.handleInput(RIGHT);
    editor.handleInput(DOWN);
    editor.handleInput(LEFT);
    editor.handleInput(RIGHT);
    editor.handleInput(ENTER);
    const saved = done.mock.calls[0]?.[0] as PiStatusConfig | null;

    expect(saved?.segments).toEqual(["model-with-reasoning", "current-dir"]);
  });

  it("keeps left/right as no-ops while a query is active", () => {
    const { editor, done } = makeEditor({
      config: makeConfig({ segments: ["model", "current-dir"] }),
    });
    editor.handleInput("m");
    editor.handleInput(LEFT);
    editor.handleInput(RIGHT);
    editor.handleInput(ENTER);
    const saved = done.mock.calls[0]?.[0] as PiStatusConfig | null;

    expect(saved?.segments).toEqual(["model", "current-dir"]);
  });

  it("saves on Enter and cancels on Escape", () => {
    const enterEditor = makeEditor();
    enterEditor.editor.handleInput(ENTER);
    expect(enterEditor.done).toHaveBeenCalledWith(
      expect.objectContaining({ segments: expect.any(Array) }),
    );

    const escEditor = makeEditor();
    escEditor.editor.handleInput(ESCAPE);
    expect(escEditor.done).toHaveBeenCalledWith(null);
  });

  it("preserves keybinding matching for the original keys", () => {
    expect(matchesKey(UP, Key.up)).toBe(true);
    expect(matchesKey(DOWN, Key.down)).toBe(true);
    expect(matchesKey(LEFT, Key.left)).toBe(true);
    expect(matchesKey(RIGHT, Key.right)).toBe(true);
    expect(matchesKey(ENTER, Key.enter)).toBe(true);
    expect(matchesKey(ESCAPE, Key.escape)).toBe(true);
    expect(matchesKey(BACKSPACE, Key.backspace)).toBe(true);
    expect(matchesKey(SPACE, Key.space)).toBe(true);
  });
});

describe("statusline editor live preview and layout", () => {
  it("updates the preview from the draft after toggling a row", () => {
    const { editor, done } = makeEditor();
    editor.handleInput(SPACE);
    editor.handleInput(ENTER);
    const saved = done.mock.calls[0]?.[0] as PiStatusConfig | null;

    expect(saved?.segments).toEqual(["current-dir"]);
  });

  it("updates filter state when toggling the policy row", () => {
    const { editor, done } = makeEditor({
      config: makeConfig({
        segments: ["model-with-reasoning"],
        filter: { mode: "all", hidden: [] },
      }),
    });
    for (let i = 0; i < 16; i++) editor.handleInput(DOWN);
    editor.handleInput(SPACE);
    editor.handleInput(ENTER);
    const saved = done.mock.calls[0]?.[0] as PiStatusConfig | null;

    expect(saved?.filter).toEqual({ mode: "only", shown: [] });
  });

  it("renders aligned label and description columns when width allows", () => {
    const { editor } = makeEditor();
    const lines = renderLines(editor, 200);
    const target = lines.find((line) => line.includes("Model + Reasoning"));

    expect(target).toBe(
      "> [x] Model + Reasoning (1)     Show the current model name and reasoning level. Hidden when no model is available.",
    );
  });

  it("falls back to label - description form on narrow widths", () => {
    const { editor } = makeEditor();
    const lines = renderLines(editor, 40);
    const target = lines.find((line) => line.includes("Model + Reasoning"));

    expect(target).toMatch(/^> \[x\] Model \+ Reasoning \(1\) - /);
  });

  it("never renders lines wider than the requested width", () => {
    for (const width of [40, 80, 200]) {
      const { editor } = makeEditor({ discovered: ["very-long-status-name"] });
      const lines = renderLines(editor, width);
      for (const line of lines) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});
