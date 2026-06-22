import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFooterLine,
  findProjectRootLabel,
  formatCompactNumber,
  formatModelWithReasoning,
  formatSegment,
  type FooterRenderInput,
  type ThemeLike,
} from "../src/tui/render.ts";
import { withDefaults } from "./test-helpers.ts";

/** Theme that passes text through unchanged — isolates formatting logic from color application. */
const identityTheme: ThemeLike = { fg: (_c, t) => t };

/** Build a minimal FooterRenderInput with sensible defaults; override only the fields under test. */
function segmentInput(
  overrides?: Partial<FooterRenderInput>,
): FooterRenderInput {
  return {
    cwd: "/Users/test/project",
    thinkingLevel: "medium",
    runState: "idle",
    segments: [],
    filter: { mode: "all", hidden: [] },
    ...overrides,
  };
}

describe("render", () => {
  it("formats compact numbers", () => {
    expect(formatCompactNumber(999)).toBe("999");
    expect(formatCompactNumber(1200)).toBe("1.2k");
    expect(formatCompactNumber(1000)).toBe("1k");
    expect(formatCompactNumber(1500000)).toBe("1.5M");
  });

  it("formats model with reasoning", () => {
    expect(
      formatModelWithReasoning(
        { id: "x", name: "X", reasoning: true },
        "medium",
      ),
    ).toBe("X [med]");
  });

  it("finds nearest project root label", () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-status-root-"));
    const root = join(dir, "repo");
    const nested = join(root, "a/b/c");
    mkdirSync(nested, { recursive: true });
    mkdirSync(join(root, ".git"), { recursive: true });
    expect(findProjectRootLabel(nested)).toBe("repo");
    expect(findProjectRootLabel(tmpdir())).toBeNull();
  });

  it("renders project-name segment when available", () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-status-root-"));
    const root = join(dir, "repo2");
    const nested = join(root, "x/y");
    mkdirSync(nested, { recursive: true });
    mkdirSync(join(root, ".pi"), { recursive: true });
    writeFileSync(join(root, ".pi/settings.json"), "{}", "utf8");

    const line = buildFooterLine(
      withDefaults({
        cwd: nested,
        thinkingLevel: "medium",
        runState: "idle",
        segments: ["project-name"],
      }),
      { fg: (_c, t) => t },
      200,
    );
    expect(line).toBe("repo2");
  });

  it("keeps default unchanged", () => {
    const line = buildFooterLine(
      withDefaults({
        model: { id: "gpt-5", name: "GPT-5", reasoning: true },
        cwd: "/Users/test/project",
        thinkingLevel: "medium",
        runState: "idle",
      }),
      { fg: (_c, t) => t },
      200,
    );
    expect(line).toContain("GPT-5 [med]");
    expect(line).toContain("/Users/test/project");
  });

  it("renders compatibility windows for MiniMax too", () => {
    const line = buildFooterLine(
      withDefaults({
        cwd: "/Users/test/project",
        thinkingLevel: "medium",
        runState: "idle",
        segments: ["five-hour-limit", "weekly-limit"],
        usageState: {
          compatibility: {
            currentLiveProviderSnapshot: {
              providerId: "minimax",
              windows: [
                { key: "fiveHour", usedPercent: 40 },
                { key: "weekly", usedPercent: 20 },
              ],
            },
          },
        },
      }),
      { fg: (_c, t) => t },
      200,
    );
    expect(line).toContain("5h 60% left");
    expect(line).toContain("wk 80% left");
  });
});

describe("formatSegment — model", () => {
  it("returns model name with accent color", () => {
    const result = formatSegment(
      "model",
      segmentInput({ model: { id: "gpt-5", name: "GPT-5" } }),
      identityTheme,
    );
    expect(result).toEqual(["GPT-5", "accent"]);
  });

  it("falls back to model id when name is missing", () => {
    const result = formatSegment(
      "model",
      segmentInput({ model: { id: "gpt-5" } }),
      identityTheme,
    );
    expect(result).toEqual(["gpt-5", "accent"]);
  });

  it("returns null when model is undefined", () => {
    const result = formatSegment("model", segmentInput(), identityTheme);
    expect(result).toBeNull();
  });
});

describe("formatSegment — model-with-reasoning", () => {
  it("appends reasoning level abbreviation for reasoning models", () => {
    const result = formatSegment(
      "model-with-reasoning",
      segmentInput({ model: { id: "x", name: "X", reasoning: true } }),
      identityTheme,
    );
    expect(result).toEqual(["X [med]", "accent"]);
  });

  it("returns plain name for non-reasoning models", () => {
    const result = formatSegment(
      "model-with-reasoning",
      segmentInput({ model: { id: "x", name: "X", reasoning: false } }),
      identityTheme,
    );
    expect(result).toEqual(["X", "accent"]);
  });

  it("abbreviates 'minimal' to 'min'", () => {
    const result = formatSegment(
      "model-with-reasoning",
      segmentInput({
        model: { id: "x", name: "X", reasoning: true },
        thinkingLevel: "minimal",
      }),
      identityTheme,
    );
    expect(result).toEqual(["X [min]", "accent"]);
  });

  it("returns null when model is undefined", () => {
    const result = formatSegment(
      "model-with-reasoning",
      segmentInput(),
      identityTheme,
    );
    expect(result).toBeNull();
  });
});

describe("formatSegment — current-dir", () => {
  it("returns cwd with success color", () => {
    const result = formatSegment(
      "current-dir",
      segmentInput({ cwd: "/tmp/foo" }),
      identityTheme,
    );
    expect(result).toEqual(["/tmp/foo", "success"]);
  });

  it("abbreviates home directory to ~", () => {
    const home = homedir();
    const result = formatSegment(
      "current-dir",
      segmentInput({ cwd: `${home}/dev` }),
      identityTheme,
    );
    expect(result?.[0]).toBe("~/dev");
  });
});

describe("formatSegment — project-name", () => {
  it("returns null when no project root is found", () => {
    const result = formatSegment(
      "project-name",
      segmentInput({ cwd: "/tmp" }),
      identityTheme,
    );
    expect(result).toBeNull();
  });
});

describe("formatSegment — git-branch", () => {
  it("returns branch name with warning color", () => {
    const result = formatSegment(
      "git-branch",
      segmentInput({ gitBranch: "main" }),
      identityTheme,
    );
    expect(result).toEqual(["main", "warning"]);
  });

  it("returns null when gitBranch is null", () => {
    const result = formatSegment(
      "git-branch",
      segmentInput({ gitBranch: null }),
      identityTheme,
    );
    expect(result).toBeNull();
  });

  it("returns null when gitBranch is undefined", () => {
    const result = formatSegment("git-branch", segmentInput(), identityTheme);
    expect(result).toBeNull();
  });
});

describe("formatSegment — run-state", () => {
  it("returns 'idle' with dim color", () => {
    const result = formatSegment(
      "run-state",
      segmentInput({ runState: "idle" }),
      identityTheme,
    );
    expect(result).toEqual(["idle", "dim"]);
  });

  it("returns 'busy' with accent color", () => {
    const result = formatSegment(
      "run-state",
      segmentInput({ runState: "busy" }),
      identityTheme,
    );
    expect(result).toEqual(["busy", "accent"]);
  });

  it("returns 'queued' with accent color", () => {
    const result = formatSegment(
      "run-state",
      segmentInput({ runState: "queued" }),
      identityTheme,
    );
    expect(result).toEqual(["queued", "accent"]);
  });
});

describe("formatSegment — context-used", () => {
  it("returns rounded percent with success color when under 70%", () => {
    const result = formatSegment(
      "context-used",
      segmentInput({ contextUsage: { percent: 45.7 } }),
      identityTheme,
    );
    expect(result).toEqual(["46% ctx", "success"]);
  });

  it("returns warning color when percent is between 70-89", () => {
    const result = formatSegment(
      "context-used",
      segmentInput({ contextUsage: { percent: 75 } }),
      identityTheme,
    );
    expect(result).toEqual(["75% ctx", "warning"]);
  });

  it("returns error color when percent is 90+", () => {
    const result = formatSegment(
      "context-used",
      segmentInput({ contextUsage: { percent: 95 } }),
      identityTheme,
    );
    expect(result).toEqual(["95% ctx", "error"]);
  });

  it("returns null when percent is null", () => {
    const result = formatSegment(
      "context-used",
      segmentInput({ contextUsage: { percent: null } }),
      identityTheme,
    );
    expect(result).toBeNull();
  });

  it("returns null when contextUsage is undefined", () => {
    const result = formatSegment("context-used", segmentInput(), identityTheme);
    expect(result).toBeNull();
  });
});

describe("formatSegment — context-remaining", () => {
  it("calculates remaining tokens and formats compactly", () => {
    const result = formatSegment(
      "context-remaining",
      segmentInput({
        contextUsage: { tokens: 50000, contextWindow: 200000, percent: 25 },
      }),
      identityTheme,
    );
    expect(result).toEqual(["150k left", "success"]);
  });

  it("returns null when tokens is null", () => {
    const result = formatSegment(
      "context-remaining",
      segmentInput({
        contextUsage: { tokens: null, contextWindow: 200000, percent: 25 },
      }),
      identityTheme,
    );
    expect(result).toBeNull();
  });

  it("returns null when contextWindow is undefined", () => {
    const result = formatSegment(
      "context-remaining",
      segmentInput({ contextUsage: { tokens: 50000, percent: 25 } }),
      identityTheme,
    );
    expect(result).toBeNull();
  });

  it("returns null when percent is null", () => {
    const result = formatSegment(
      "context-remaining",
      segmentInput({
        contextUsage: { tokens: 50000, contextWindow: 200000, percent: null },
      }),
      identityTheme,
    );
    expect(result).toBeNull();
  });

  it("clamps remaining to zero when tokens exceed window", () => {
    const result = formatSegment(
      "context-remaining",
      segmentInput({
        contextUsage: { tokens: 250000, contextWindow: 200000, percent: 100 },
      }),
      identityTheme,
    );
    expect(result).toEqual(["0 left", "error"]);
  });
});

describe("formatSegment — used-tokens", () => {
  it("formats total tokens compactly with dim color", () => {
    const result = formatSegment(
      "used-tokens",
      segmentInput({
        branchTotals: { input: 100, output: 50, totalTokens: 1500 },
      }),
      identityTheme,
    );
    expect(result).toEqual(["1.5k tok", "dim"]);
  });

  it("returns null when branchTotals is undefined", () => {
    const result = formatSegment("used-tokens", segmentInput(), identityTheme);
    expect(result).toBeNull();
  });
});

describe("formatSegment — total-input-tokens", () => {
  it("formats with up arrow prefix", () => {
    const result = formatSegment(
      "total-input-tokens",
      segmentInput({
        branchTotals: { input: 2500, output: 100, totalTokens: 2600 },
      }),
      identityTheme,
    );
    expect(result).toEqual(["↑2.5k", "dim"]);
  });

  it("returns null when branchTotals is undefined", () => {
    const result = formatSegment(
      "total-input-tokens",
      segmentInput(),
      identityTheme,
    );
    expect(result).toBeNull();
  });
});

describe("formatSegment — total-output-tokens", () => {
  it("formats with down arrow prefix", () => {
    const result = formatSegment(
      "total-output-tokens",
      segmentInput({
        branchTotals: { input: 100, output: 800, totalTokens: 900 },
      }),
      identityTheme,
    );
    expect(result).toEqual(["↓800", "dim"]);
  });

  it("returns null when branchTotals is undefined", () => {
    const result = formatSegment(
      "total-output-tokens",
      segmentInput(),
      identityTheme,
    );
    expect(result).toBeNull();
  });
});

describe("formatSegment — session-id", () => {
  it("truncates to first 8 characters with sid prefix", () => {
    const result = formatSegment(
      "session-id",
      segmentInput({ sessionId: "abcdef1234567890" }),
      identityTheme,
    );
    expect(result).toEqual(["sid abcdef12", "dim"]);
  });

  it("returns null when sessionId is undefined", () => {
    const result = formatSegment("session-id", segmentInput(), identityTheme);
    expect(result).toBeNull();
  });
});

describe("formatSegment — five-hour-limit", () => {
  it("calculates remaining percent with success color", () => {
    const result = formatSegment(
      "five-hour-limit",
      segmentInput({
        usageState: {
          compatibility: {
            currentLiveProviderSnapshot: {
              providerId: "anthropic",
              windows: [{ key: "fiveHour", usedPercent: 30 }],
            },
          },
        },
      }),
      identityTheme,
    );
    expect(result).toEqual(["5h 70% left", "success"]);
  });

  it("returns warning color when usage is between 70-89%", () => {
    const result = formatSegment(
      "five-hour-limit",
      segmentInput({
        usageState: {
          compatibility: {
            currentLiveProviderSnapshot: {
              providerId: "anthropic",
              windows: [{ key: "fiveHour", usedPercent: 75 }],
            },
          },
        },
      }),
      identityTheme,
    );
    expect(result).toEqual(["5h 25% left", "warning"]);
  });

  it("returns error color when usage is 90%+", () => {
    const result = formatSegment(
      "five-hour-limit",
      segmentInput({
        usageState: {
          compatibility: {
            currentLiveProviderSnapshot: {
              providerId: "anthropic",
              windows: [{ key: "fiveHour", usedPercent: 95 }],
            },
          },
        },
      }),
      identityTheme,
    );
    expect(result).toEqual(["5h 5% left", "error"]);
  });

  it("returns null when no fiveHour window exists", () => {
    const result = formatSegment(
      "five-hour-limit",
      segmentInput({
        usageState: {
          compatibility: {
            currentLiveProviderSnapshot: {
              providerId: "anthropic",
              windows: [{ key: "weekly", usedPercent: 30 }],
            },
          },
        },
      }),
      identityTheme,
    );
    expect(result).toBeNull();
  });

  it("returns null when window has unavailableReason", () => {
    const result = formatSegment(
      "five-hour-limit",
      segmentInput({
        usageState: {
          compatibility: {
            currentLiveProviderSnapshot: {
              providerId: "anthropic",
              windows: [
                {
                  key: "fiveHour",
                  usedPercent: 30,
                  unavailableReason: "disabled",
                },
              ],
            },
          },
        },
      }),
      identityTheme,
    );
    expect(result).toBeNull();
  });

  it("returns null when usageState is undefined", () => {
    const result = formatSegment(
      "five-hour-limit",
      segmentInput(),
      identityTheme,
    );
    expect(result).toBeNull();
  });

  it("returns null when snapshot is null", () => {
    const result = formatSegment(
      "five-hour-limit",
      segmentInput({
        usageState: { compatibility: { currentLiveProviderSnapshot: null } },
      }),
      identityTheme,
    );
    expect(result).toBeNull();
  });

  it("clamps remaining to 0-100 range", () => {
    const result = formatSegment(
      "five-hour-limit",
      segmentInput({
        usageState: {
          compatibility: {
            currentLiveProviderSnapshot: {
              providerId: "anthropic",
              windows: [{ key: "fiveHour", usedPercent: 105 }],
            },
          },
        },
      }),
      identityTheme,
    );
    expect(result).toEqual(["5h 0% left", "error"]);
  });
});

describe("formatSegment — weekly-limit", () => {
  it("calculates remaining percent with success color", () => {
    const result = formatSegment(
      "weekly-limit",
      segmentInput({
        usageState: {
          compatibility: {
            currentLiveProviderSnapshot: {
              providerId: "anthropic",
              windows: [{ key: "weekly", usedPercent: 20 }],
            },
          },
        },
      }),
      identityTheme,
    );
    expect(result).toEqual(["wk 80% left", "success"]);
  });

  it("returns null when no weekly window exists", () => {
    const result = formatSegment(
      "weekly-limit",
      segmentInput({
        usageState: {
          compatibility: {
            currentLiveProviderSnapshot: {
              providerId: "anthropic",
              windows: [{ key: "fiveHour", usedPercent: 30 }],
            },
          },
        },
      }),
      identityTheme,
    );
    expect(result).toBeNull();
  });

  it("returns null when usageState is undefined", () => {
    const result = formatSegment("weekly-limit", segmentInput(), identityTheme);
    expect(result).toBeNull();
  });
});

describe("buildFooterLine — extension statuses", () => {
  it("appends extension statuses after segment parts", () => {
    const line = buildFooterLine(
      {
        ...segmentInput({
          segments: ["run-state"],
          extensionStatuses: new Map([
            ["alpha", "running"],
            ["beta", "paused"],
          ]),
          filter: { mode: "all", hidden: [] },
        }),
      },
      identityTheme,
      200,
    );
    expect(line).toContain("idle");
    expect(line).toContain("running");
    expect(line).toContain("paused");
  });

  it("respects the hidden filter", () => {
    const line = buildFooterLine(
      {
        ...segmentInput({
          segments: ["run-state"],
          extensionStatuses: new Map([
            ["alpha", "running"],
            ["beta", "paused"],
          ]),
          filter: { mode: "all", hidden: ["alpha"] },
        }),
      },
      identityTheme,
      200,
    );
    expect(line).not.toContain("running");
    expect(line).toContain("paused");
  });

  it("respects the only filter", () => {
    const line = buildFooterLine(
      {
        ...segmentInput({
          segments: ["run-state"],
          extensionStatuses: new Map([
            ["alpha", "running"],
            ["beta", "paused"],
          ]),
          filter: { mode: "only", shown: ["alpha"] },
        }),
      },
      identityTheme,
      200,
    );
    expect(line).toContain("running");
    expect(line).not.toContain("paused");
  });

  it("omits extension statuses when none exist", () => {
    const line = buildFooterLine(
      {
        ...segmentInput({
          segments: ["run-state"],
          extensionStatuses: new Map(),
        }),
      },
      identityTheme,
      200,
    );
    expect(line).toBe("idle");
  });

  it("omits extension statuses when all are hidden", () => {
    const line = buildFooterLine(
      {
        ...segmentInput({
          segments: ["run-state"],
          extensionStatuses: new Map([["alpha", "running"]]),
          filter: { mode: "all", hidden: ["alpha"] },
        }),
      },
      identityTheme,
      200,
    );
    expect(line).toBe("idle");
  });

  it("strips key prefix from status values", () => {
    const line = buildFooterLine(
      {
        ...segmentInput({
          segments: [],
          extensionStatuses: new Map([["alpha", "alpha: running"]]),
          filter: { mode: "all", hidden: [] },
        }),
      },
      identityTheme,
      200,
    );
    expect(line).toBe("running");
  });
});
