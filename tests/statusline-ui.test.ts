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
  return lines.slice(5, -3);
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

  it("always renders the preview line and help line at the bottom", () => {
    const { editor } = makeEditor();
    const lines = renderLines(editor);

    expect(lines).not.toContain("Preview:");
    expect(lines.at(-3)).toBe("");
    expect((lines.at(-2) ?? "").length).toBeGreaterThan(0);
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
    const projectNameIndex = lines.findIndex((line) =>
      line.includes("Project Name"),
    );

    expect(modelIndex).toBeLessThan(reasoningIndex);
    expect(reasoningIndex).toBeLessThan(projectNameIndex);
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
    expect(lines).toContain("No extension statuses yet.");
  });
});

describe("statusline editor search", () => {
  it("searches segment rows by label and description", () => {
    const { editor } = makeEditor();
    for (const char of "queued") editor.handleInput(char);
    const lines = rowLines(renderLines(editor, 200));

    expect(lines.some((line) => line.includes("Run State"))).toBe(true);
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
    for (const char of "default") editor.handleInput(char);
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
    expect(lines).not.toContain("No extension statuses yet.");
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
        line.includes("Current model name with reasoning level"),
      ),
    ).toBe(true);
    expect(
      lines.some((line) =>
        line.includes("Project name (omitted when unavailable)"),
      ),
    ).toBe(true);
  });

  it("renders generic descriptions for discovered rows and the policy row", () => {
    const { editor } = makeEditor({ discovered: ["custom-status"] });
    const lines = renderLines(editor, 200);

    expect(
      lines.some((line) =>
        line.includes("Visible when extension-statuses is enabled"),
      ),
    ).toBe(true);
    expect(
      lines.some((line) =>
        line.includes("Default visibility for new extension statuses"),
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

  it("moves enabled segments later with right", () => {
    const { editor, done } = makeEditor({
      config: makeConfig({ segments: ["model", "current-dir", "git-branch"] }),
    });
    editor.handleInput(RIGHT);
    editor.handleInput(ENTER);
    const saved = done.mock.calls[0]?.[0] as PiStatusConfig | null;

    expect(saved?.segments).toEqual(["current-dir", "model", "git-branch"]);
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

  it("persists the current draft on Enter with all pending changes", () => {
    const initialConfig = makeConfig({
      segments: ["model", "current-dir", "git-branch"],
    });
    const { editor, done } = makeEditor({ config: initialConfig });
    editor.handleInput(DOWN);
    editor.handleInput(SPACE); // toggles off current-dir
    editor.handleInput(ENTER);

    const saved = done.mock.calls[0]?.[0] as PiStatusConfig | null;
    expect(saved?.segments).toEqual(["model", "git-branch"]);
  });

  it("leaves the runtime config unchanged on Escape", () => {
    const initialConfig = makeConfig({
      segments: ["model", "current-dir", "git-branch"],
    });
    const { editor, done } = makeEditor({ config: initialConfig });
    editor.handleInput(DOWN);
    editor.handleInput(SPACE);
    editor.handleInput(DOWN);
    editor.handleInput(SPACE);
    editor.handleInput(DOWN);
    editor.handleInput(SPACE);
    editor.handleInput(ESCAPE);

    expect(done).toHaveBeenCalledWith(null);
    expect(initialConfig.segments).toEqual([
      "model",
      "current-dir",
      "git-branch",
    ]);
  });

  it("preserves keybinding matching for the editor keys", () => {
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
  it("renders the preview as the bottom preview line without a Preview label", () => {
    const { editor } = makeEditor({
      config: makeConfig({ segments: ["model-with-reasoning", "current-dir"] }),
    });
    const lines = renderLines(editor, 200);

    expect(lines).not.toContain("Preview:");
    expect(lines.at(-3)).toBe("");
    expect(lines.at(-2)).toBe("/Users/test/project");
    expect(lines.at(-1)).toBe(
      "Toggle: Space  •  Reorder: ← / →  •  Save: Enter  •  Cancel: Esc",
    );
  });

  it("updates the preview line after toggling a segment", () => {
    const { editor } = makeEditor({
      config: makeConfig({ segments: ["model-with-reasoning", "current-dir"] }),
    });
    const before = renderLines(editor, 200).at(-2);
    expect(before).toBe("/Users/test/project");
    editor.handleInput(DOWN);
    editor.handleInput(SPACE); // toggle off current-dir
    const after = renderLines(editor, 200).at(-2);
    expect(after).toBe("");
  });

  it("updates the preview line after reordering enabled segments", () => {
    const editor = createStatuslineEditor({
      config: makeConfig({ segments: ["current-dir", "run-state"] }),
      discoveredStatuses: [],
      previewInput: { ...makePreviewInput(), runState: "busy" },
      theme: IDENTITY_THEME,
      done: vi.fn(),
      requestRender: vi.fn(),
    }) as EditorComponent;
    expect(editor.render(200).at(-2)).toBe(
      "/Users/test/project · busy",
    );
    editor.handleInput(DOWN);
    editor.handleInput(LEFT);
    expect(editor.render(200).at(-2)).toBe(
      "busy · /Users/test/project",
    );
  });

  it("keeps the preview line stable when the user only edits the search query", () => {
    const { editor } = makeEditor({
      config: makeConfig({ segments: ["current-dir", "run-state"] }),
    });
    const initial = renderLines(editor, 200).at(-2);
    expect(initial).toBe("/Users/test/project · idle");
    editor.handleInput("c");
    editor.handleInput("u");
    editor.handleInput("r");
    expect(renderLines(editor, 200).at(-2)).toBe(initial);
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
      "> [x] Model + Reasoning (1)     Current model name with reasoning level",
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
