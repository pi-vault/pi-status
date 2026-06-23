import { describe, expect, it } from "vitest";
import { visibleWidth } from "@earendil-works/pi-tui";
import { initEditorState, editorReducer } from "../../src/tui/editor-state.ts";
import { renderEditor } from "../../src/tui/editor-render.ts";
import { noTheme } from "../../src/tui/theme.ts";

const THEME = noTheme;
const WIDTH = 80;

function makePreviewInput() {
  return {
    model: { id: "test-model", name: "TestModel", reasoning: false },
    cwd: "/tmp/test",
    thinkingLevel: "off",
    runState: "idle" as const,
  };
}

function makeState(overrides?: {
  segments?: Parameters<typeof initEditorState>[0]["segments"];
  discovered?: string[];
}) {
  return initEditorState(
    {
      segments: overrides?.segments ?? ["model-with-reasoning", "current-dir"],
      extensionSegments: { hidden: [] },
    },
    overrides?.discovered ?? [],
  );
}

function render(state: ReturnType<typeof makeState>, width = WIDTH) {
  return renderEditor(state, makePreviewInput(), THEME, width);
}

describe("renderEditor — structure", () => {
  it("includes title and subtitle in first two lines", () => {
    const lines = render(makeState());
    expect(lines[0]).toContain("Configure Status Line");
    expect(lines[1]).toContain("Select which items to display");
  });

  it("includes search placeholder", () => {
    const lines = render(makeState());
    expect(lines[3]).toContain("Type to search");
  });

  it("includes section headers when not searching", () => {
    const lines = render(makeState());
    const joined = lines.join("\n");
    expect(joined).toContain("Status line items");
    expect(joined).toContain("Extension statuses");
  });

  it("omits section headers when searching", () => {
    const state = makeState();
    const result = editorReducer(state, { type: "type_char", char: "m" });
    if (result.type !== "next") throw new Error("expected next");
    const lines = render(result.state);
    const joined = lines.join("\n");
    expect(joined).not.toContain("Status line items");
    expect(joined).not.toContain("Extension statuses");
  });

  it("ends with help text", () => {
    const lines = render(makeState());
    const lastLine = lines[lines.length - 1];
    expect(lastLine).toContain("Toggle: Space");
    expect(lastLine).toContain("Reorder:");
  });

  it("shows searching help text when query is active", () => {
    const state = makeState();
    const result = editorReducer(state, { type: "type_char", char: "m" });
    if (result.type !== "next") throw new Error("expected next");
    const lines = render(result.state);
    const lastLine = lines[lines.length - 1];
    expect(lastLine).toContain("disabled while search is active");
  });
});

describe("renderEditor — segment rows", () => {
  it("shows enabled segments with filled checkbox", () => {
    const lines = render(makeState({ segments: ["model"] }));
    const joined = lines.join("\n");
    expect(joined).toMatch(/\[.\]\s*Model/);
  });

  it("shows disabled segments with empty checkbox", () => {
    const state = makeState({ segments: [] });
    const lines = render(state);
    const joined = lines.join("\n");
    expect(joined).toMatch(/\[ \]\s*Model/);
  });

  it("shows order numbers for enabled segments", () => {
    const lines = render(makeState({ segments: ["model", "current-dir"] }));
    const joined = lines.join("\n");
    expect(joined).toContain("(1)");
    expect(joined).toContain("(2)");
  });
});

describe("renderEditor — preview line", () => {
  it("includes a preview line near the bottom", () => {
    const lines = render(makeState({ segments: ["model-with-reasoning"] }));
    const secondToLast = lines[lines.length - 2];
    expect(secondToLast).toContain("TestModel");
  });
});

describe("renderEditor — width respect", () => {
  it("no line exceeds the given width", () => {
    const narrow = 40;
    const lines = render(makeState(), narrow);
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(narrow);
    }
  });
});
