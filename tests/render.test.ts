import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFooterLine,
  findProjectRootLabel,
  formatCompactNumber,
  formatModelWithReasoning,
} from "../src/tui/render.ts";
import { withDefaults } from "./test-helpers.ts";

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
