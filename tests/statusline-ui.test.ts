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

const SHELL_PREAMBLE = [
  "Configure Status Line",
  "Select which items to display in the status line.",
  "",
  "Type to search",
  "> ",
];

function findActiveRow(lines: string[]): string | undefined {
  return lines.find((line) => /^> \[[ x]\]/.test(line));
}

describe("statusline editor shell", () => {
  it("renders the exact Codex-style shell layout in order", () => {
    const { editor } = makeEditor();
    const lines = editor.render(120).map(stripAnsi);

    expect(lines.slice(0, SHELL_PREAMBLE.length)).toEqual(SHELL_PREAMBLE);
  });

  it("shows the visible query line for typed text", () => {
    const { editor } = makeEditor();
    editor.handleInput("m");
    editor.handleInput("o");
    editor.handleInput("d");
    const lines = editor.render(120).map(stripAnsi);
    expect(lines[4]).toBe("> mod");
  });

  it("always renders the preview block and help line", () => {
    const { editor } = makeEditor();
    const lines = editor.render(120).map(stripAnsi);

    const previewIndex = lines.indexOf("Preview:");
    expect(previewIndex).toBeGreaterThan(0);
    expect(lines[previewIndex - 1]).toBe("");
    expect(lines[previewIndex + 1].length).toBeGreaterThan(0);

    const helpLine = lines[lines.length - 1];
    expect(helpLine).toBe(
      "Toggle: Space  •  Reorder: ← / →  •  Save: Enter  •  Cancel: Esc",
    );
  });

  it("swaps the reorder clause in the help line when search is active", () => {
    const { editor } = makeEditor();
    editor.handleInput("m");
    const lines = editor.render(120).map(stripAnsi);
    const helpLine = lines[lines.length - 1];
    expect(helpLine).toBe(
      "Toggle: Space  •  Reorder: disabled while search is active  •  Save: Enter  •  Cancel: Esc",
    );
  });
});

describe("statusline editor query input", () => {
  it("appends printable ASCII characters to the query (Space is reserved for toggle)", () => {
    const { editor } = makeEditor();
    editor.handleInput("a");
    editor.handleInput("B");
    editor.handleInput("1");
    // Space is the toggle key, not a query character
    editor.handleInput(SPACE);
    const lines = editor.render(120).map(stripAnsi);
    expect(lines[4]).toBe("> aB1");
  });

  it("removes the last character on backspace", () => {
    const { editor } = makeEditor();
    editor.handleInput("a");
    editor.handleInput("b");
    editor.handleInput("c");
    editor.handleInput(BACKSPACE);
    const lines = editor.render(120).map(stripAnsi);
    expect(lines[4]).toBe("> ab");
  });

  it("ignores backspace when query is empty", () => {
    const { editor } = makeEditor();
    editor.handleInput(BACKSPACE);
    const lines = editor.render(120).map(stripAnsi);
    expect(lines[4]).toBe("> ");
  });

  it("ignores non-printable input", () => {
    const { editor } = makeEditor();
    editor.handleInput("\x01");
    editor.handleInput(BACKSPACE);
    editor.handleInput(ESCAPE);
    const lines = editor.render(120).map(stripAnsi);
    expect(lines[4]).toBe("> ");
  });
});

describe("statusline editor filtering", () => {
  it("filters segment rows by label and ignores descriptions", () => {
    const { editor } = makeEditor();
    editor.handleInput("c");
    editor.handleInput("u");
    editor.handleInput("r");
    const lines = editor.render(120).map(stripAnsi);
    expect(lines.some((line) => line.includes("Current Dir"))).toBe(true);
    // Description text is not part of the fuzzy match
    expect(
      lines.some(
        (line) =>
          line.includes("Show the current working directory") &&
          !line.includes("Current Dir"),
      ),
    ).toBe(false);
  });

  it("filters discovered status rows by key only", () => {
    const { editor } = makeEditor({
      discovered: ["alpha-status", "beta-status"],
    });
    editor.handleInput("a");
    editor.handleInput("l");
    editor.handleInput("p");
    const lines = editor.render(120).map(stripAnsi);
    expect(
      lines.some((line) => line.includes("alpha-status")),
    ).toBe(true);
    expect(
      lines.some((line) => line.includes("beta-status")),
    ).toBe(false);
  });

  it("keeps the policy row visible while searching", () => {
    const { editor } = makeEditor({
      discovered: ["alpha-status", "beta-status"],
    });
    editor.handleInput("z");
    editor.handleInput("z");
    editor.handleInput("z");
    const lines = editor.render(120).map(stripAnsi);
    expect(
      lines.some((line) => line.includes("New extension statuses")),
    ).toBe(true);
  });
});

describe("statusline editor descriptions", () => {
  const exactDescriptions: Array<{ id: string; description: string }> = [
    {
      id: "model",
      description: "Show the current model name. Hidden when no model is available.",
    },
    {
      id: "model-with-reasoning",
      description:
        "Show the current model name and reasoning level. Hidden when no model is available.",
    },
    {
      id: "project-root",
      description:
        "Show the nearest project root folder name. Hidden when no project root is detected.",
    },
    { id: "current-dir", description: "Show the current working directory." },
    {
      id: "git-branch",
      description: "Show the current Git branch. Hidden when unavailable.",
    },
    { id: "run-state", description: "Show whether Pi is idle, queued, or busy." },
    {
      id: "context-remaining",
      description:
        "Show remaining context tokens. Hidden when context usage is unavailable.",
    },
    {
      id: "context-used",
      description:
        "Show percent of context already used. Hidden when context usage is unavailable.",
    },
    {
      id: "context-window-size",
      description:
        "Show the total context window size. Hidden when context usage is unavailable.",
    },
    {
      id: "used-tokens",
      description:
        "Show total assistant tokens used in this branch. Hidden when unavailable.",
    },
    {
      id: "total-input-tokens",
      description:
        "Show total assistant input tokens in this branch. Hidden when unavailable.",
    },
    {
      id: "total-output-tokens",
      description:
        "Show total assistant output tokens in this branch. Hidden when unavailable.",
    },
    {
      id: "session-id",
      description: "Show the short session ID. Hidden when unavailable.",
    },
    {
      id: "five-hour-limit",
      description: "Show remaining 5-hour Codex quota. Hidden when unavailable.",
    },
    {
      id: "weekly-limit",
      description: "Show remaining weekly Codex quota. Hidden when unavailable.",
    },
    {
      id: "extension-statuses",
      description:
        "Show visible extension status values. Hidden when none are visible.",
    },
  ];

  for (const { id, description } of exactDescriptions) {
    it(`renders the exact description for ${id}`, () => {
      const { editor } = makeEditor();
      // Render with no query so every segment row is present at width 200
      const lines = editor.render(200).map(stripAnsi);
      const matches = lines.filter((line) => line.includes(description));
      expect(matches.length).toBeGreaterThan(0);
    });
  }

  it("uses the generic description for discovered extension-status rows", () => {
    const { editor } = makeEditor({ discovered: ["custom-status"] });
    const lines = editor.render(200).map(stripAnsi);
    const statusLine = lines.find(
      (line) => line.includes("custom-status") && line.includes("Show or hide"),
    );
    expect(statusLine).toBeDefined();
    expect(statusLine).toContain(
      "Show or hide this extension status when extension-statuses is enabled.",
    );
  });

  it("uses the policy description for the new-extension-statuses row", () => {
    const { editor } = makeEditor();
    const lines = editor.render(200).map(stripAnsi);
    expect(
      lines.some(
        (line) =>
          line.includes("New extension statuses") &&
          line.includes(
            "Whether newly discovered extension statuses are shown by default.",
          ),
      ),
    ).toBe(true);
  });
});

describe("statusline editor interactions", () => {
  it("moves the cursor down to the next row", () => {
    const { editor } = makeEditor();
    const before = findActiveRow(editor.render(120).map(stripAnsi));
    expect(before).toBeDefined();
    editor.handleInput(DOWN);
    const after = findActiveRow(editor.render(120).map(stripAnsi));
    expect(after).toBeDefined();
    expect(after).not.toBe(before);
  });

  it("moves the cursor up to the previous row", () => {
    const { editor } = makeEditor();
    editor.handleInput(DOWN);
    const downActive = findActiveRow(editor.render(120).map(stripAnsi));
    editor.handleInput(UP);
    const upActive = findActiveRow(editor.render(120).map(stripAnsi));
    expect(upActive).toBeDefined();
    expect(upActive).not.toBe(downActive);
  });

  it("toggles a segment row on space", () => {
    const { editor, done } = makeEditor({
      config: makeConfig({ segments: ["model-with-reasoning", "current-dir"] }),
    });
    // Cursor 0 is the "Model" row, which is not enabled by default
    editor.handleInput(SPACE);
    editor.handleInput(ENTER);
    const saved = done.mock.calls[0]?.[0] as PiStatusConfig | null;
    expect(saved).not.toBeNull();
    expect(saved?.segments).toContain("model");
  });

  it("reorders enabled segments with left and right", () => {
    const { editor, done } = makeEditor({
      config: makeConfig({ segments: ["model", "current-dir"] }),
    });
    // Move down 3 rows to reach "Current Dir" (row 3 in metadata order, enabled)
    editor.handleInput(DOWN);
    editor.handleInput(DOWN);
    editor.handleInput(DOWN);
    editor.handleInput(LEFT);
    editor.handleInput(ENTER);
    const saved = done.mock.calls[0]?.[0] as PiStatusConfig | null;
    expect(saved).not.toBeNull();
    expect(saved?.segments).toEqual(["current-dir", "model"]);
  });

  it("ignores reorder when query is non-empty", () => {
    const { editor, done } = makeEditor({
      config: makeConfig({ segments: ["model", "current-dir"] }),
    });
    editor.handleInput("m");
    // With query "m", "current-dir" is filtered out, so we can only land on
    // "Model" or "Model + Reasoning" which are at indices 0 and 1.
    editor.handleInput(LEFT);
    editor.handleInput(RIGHT);
    editor.handleInput(ENTER);
    const saved = done.mock.calls[0]?.[0] as PiStatusConfig | null;
    expect(saved).not.toBeNull();
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

describe("statusline editor live preview", () => {
  it("updates the preview from the draft after toggling a row", () => {
    const { editor, done } = makeEditor({
      config: makeConfig({ segments: ["model-with-reasoning", "current-dir"] }),
    });
    editor.handleInput(SPACE);
    editor.handleInput(ENTER);
    const saved = done.mock.calls[0]?.[0] as PiStatusConfig | null;
    // Toggling the "Model" row appends it to the end of the enabled list
    expect(saved?.segments).toEqual([
      "model-with-reasoning",
      "current-dir",
      "model",
    ]);
  });

  it("reflects filter changes in the preview when toggling the policy row", () => {
    const { editor, done } = makeEditor({
      config: makeConfig({
        segments: ["model-with-reasoning"],
        filter: { mode: "all", hidden: [] },
      }),
    });
    // 16 segment rows + 1 policy row at the end; press DOWN enough times
    for (let i = 0; i < 16; i++) editor.handleInput(DOWN);
    editor.handleInput(SPACE);
    editor.handleInput(ENTER);
    const saved = done.mock.calls[0]?.[0] as PiStatusConfig | null;
    // Toggling from "shown by default" to "hidden by default" yields only+shown: []
    expect(saved?.filter).toEqual({ mode: "only", shown: [] });
  });
});

describe("statusline editor row layout", () => {
  it("renders aligned label + description columns when width allows", () => {
    const { editor } = makeEditor();
    // Move cursor to "Model + Reasoning" (row 1) which is enabled
    editor.handleInput(DOWN);
    const lines = editor.render(200).map(stripAnsi);
    const modelRow = lines.find((line) => line.includes("Model + Reasoning"));
    expect(modelRow).toBeDefined();
    // Aligned mode: cursor (1) + space (1) + [x] (3) + space (1) + label padded to 24 + gap (2) + description
    // Label "Model + Reasoning (1)" is 21 chars, padded with 3 spaces to 24
    expect(modelRow).toBe(
      "> [x] Model + Reasoning (1)     Show the current model name and reasoning level. Hidden when no model is available.",
    );
  });

  it("falls back to label - description form on narrow widths", () => {
    const { editor } = makeEditor();
    editor.handleInput(DOWN); // move to "Model + Reasoning" (enabled, has order suffix)
    const lines = editor.render(40).map(stripAnsi);
    const modelRow = lines.find((line) => line.includes("Model + Reasoning"));
    expect(modelRow).toBeDefined();
    // Fallback: "{labelWithOrder} - {description}" (description gets truncated)
    expect(modelRow).toMatch(
      /^> \[x\] Model \+ Reasoning \(1\) - Show th/,
    );
  });

  it("keeps the fallback separator visible when the row is extremely narrow", () => {
    const { editor } = makeEditor();
    editor.handleInput(DOWN); // move to "Model + Reasoning" (enabled, has order suffix)
    const lines = editor.render(28).map(stripAnsi);
    const modelRow = lines.find((line) => line.startsWith("> [x] Model"));
    expect(modelRow).toBeDefined();
    expect(modelRow).toContain(" - ");
    expect(visibleWidth(modelRow ?? "")).toBeLessThanOrEqual(28);
  });

  it("truncates without exceeding the available width in aligned mode", () => {
    const { editor } = makeEditor();
    const width = 80;
    const lines = editor.render(width).map(stripAnsi);
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(width);
    }
  });

  it("truncates without exceeding the available width in fallback mode", () => {
    const { editor } = makeEditor();
    const width = 40;
    const lines = editor.render(width).map(stripAnsi);
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(width);
    }
  });
});
