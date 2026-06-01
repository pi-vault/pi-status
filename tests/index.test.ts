import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getConfigPath, loadConfig, normalizeSegments } from "../src/config.ts";
import createExtension from "../src/index.ts";
import {
  DEFAULT_SEGMENTS,
  buildFooterLine,
  formatCompactNumber,
  formatModelWithReasoning,
  type ThemeLike,
} from "../src/render.ts";

function createTheme(): ThemeLike {
  return { fg: (color, text) => `<${color}>${text}</${color}>` };
}

function createContext(overrides?: Partial<ExtensionContext>): ExtensionContext {
  return {
    ui: {
      select: async () => undefined,
      confirm: async () => false,
      input: async () => undefined,
      notify: () => {},
      setStatus: () => {},
      setWorkingMessage: () => {},
      setWidget: () => {},
      setFooter: () => {},
      setHeader: () => {},
      setTitle: () => {},
      custom: async () => undefined,
      setEditorText: () => {},
    },
    hasUI: true,
    cwd: "/Users/test/project",
    sessionManager: {
      getSessionId: () => "abcdef123456",
      getBranch: () => [],
    } as unknown as ExtensionContext["sessionManager"],
    modelRegistry: {} as ExtensionContext["modelRegistry"],
    model: { id: "gpt-5", name: "GPT-5", reasoning: true } as never,
    isIdle: () => true,
    abort: () => {},
    hasPendingMessages: () => false,
    shutdown: () => {},
    getContextUsage: () => undefined,
    compact: () => {},
    getSystemPrompt: () => "",
    ...overrides,
  } as ExtensionContext;
}

describe("config", () => {
  it("falls back for missing/malformed/wrong-shape", () => {
    expect(loadConfig("/missing/file").segments).toEqual(DEFAULT_SEGMENTS);

    const dir = mkdtempSync(join(tmpdir(), "pi-status-"));
    const malformed = join(dir, "bad.json");
    writeFileSync(malformed, "{x", "utf8");
    expect(loadConfig(malformed).segments).toEqual(DEFAULT_SEGMENTS);

    const wrong = join(dir, "wrong.json");
    writeFileSync(wrong, "[]", "utf8");
    expect(loadConfig(wrong).segments).toEqual(DEFAULT_SEGMENTS);
  });

  it("normalizes unknown/duplicate/non-string entries", () => {
    expect(
      normalizeSegments(["model", "model", "unknown", 1, "current-dir", "git-branch"]),
    ).toEqual(["model", "current-dir", "git-branch"]);
  });

  it("supports PI_STATUS_CONFIG relative override", () => {
    const rel = "foo/bar.json";
    expect(getConfigPath({ PI_STATUS_CONFIG: rel } as NodeJS.ProcessEnv)).toContain(rel);
  });
});

describe("render", () => {
  it("formats compact numbers", () => {
    expect(formatCompactNumber(999)).toBe("999");
    expect(formatCompactNumber(1200)).toBe("1.2k");
    expect(formatCompactNumber(1000)).toBe("1k");
    expect(formatCompactNumber(1500000)).toBe("1.5M");
  });

  it("formats model with reasoning", () => {
    expect(formatModelWithReasoning({ id: "x", name: "X", reasoning: true }, "medium")).toBe("X [med]");
  });

  it("keeps default unchanged", () => {
    const line = buildFooterLine(
      {
        model: { id: "gpt-5", name: "GPT-5", reasoning: true },
        cwd: "/Users/test/project",
        thinkingLevel: "medium",
        runState: "idle",
        segments: DEFAULT_SEGMENTS,
      },
      { fg: (_c, t) => t },
      200,
    );
    expect(line).toContain("GPT-5 [med]");
    expect(line).toContain("/Users/test/project");
  });

  it("renders configured order and omits unavailable", () => {
    const line = buildFooterLine(
      {
        model: { id: "gpt-5", name: "GPT-5", reasoning: true },
        cwd: "/Users/test/project",
        thinkingLevel: "medium",
        runState: "busy",
        gitBranch: "main",
        contextUsage: { tokens: 800, contextWindow: 2000, percent: 40 },
        branchTotals: { input: 2000, output: 3000, totalTokens: 5000 },
        sessionId: "1234567890",
        segments: [
          "run-state",
          "git-branch",
          "total-input-tokens",
          "used-tokens",
          "session-id",
          "context-remaining",
        ],
      },
      createTheme(),
      200,
    );

    expect(line).toContain("busy");
    expect(line).toContain("main");
    expect(line).toContain("↑2k");
    expect(line).toContain("5k tok");
    expect(line).toContain("sid 12345678");
    expect(line).toContain("1.2k left");
  });

  it("applies context threshold colors", () => {
    const mk = (percent: number) =>
      buildFooterLine(
        {
          model: undefined,
          cwd: "/x",
          thinkingLevel: "high",
          runState: "idle",
          contextUsage: { tokens: 10, contextWindow: 100, percent },
          segments: ["context-used"],
        },
        createTheme(),
        80,
      );

    expect(mk(69)).toContain("<success>");
    expect(mk(70)).toContain("<warning>");
    expect(mk(90)).toContain("<error>");
  });
});

describe("extension wiring", () => {
  it("installs footer and repaints on branch change", () => {
    const handlers = new Map<string, Array<(event: unknown, ctx: ExtensionContext) => void>>();
    let footerFactory: ((...args: unknown[]) => { render: (width: number) => string[] }) | undefined;
    const requestRender = vi.fn();

    const pi = {
      on(event: string, handler: (event: unknown, ctx: ExtensionContext) => void) {
        handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      },
      getThinkingLevel: () => "medium",
    } as unknown as ExtensionAPI;

    createExtension(pi);

    const ctx = createContext({
      ui: { ...createContext().ui, setFooter: (x: unknown) => (footerFactory = x as never) },
      sessionManager: {
        getSessionId: () => "abcdef123456",
        getBranch: () => [
          {
            type: "message",
            message: { role: "assistant", usage: { input: 10, output: 20, totalTokens: 30 } },
          },
          {
            type: "message",
            message: { role: "user", usage: { input: 100, output: 200, totalTokens: 300 } },
          },
        ],
      } as unknown as ExtensionContext["sessionManager"],
    });

    for (const h of handlers.get("session_start") ?? []) h({}, ctx);

    const listeners: Array<() => void> = [];
    const footer = footerFactory?.(
      { requestRender },
      { fg: (_c: string, t: string) => t },
      { getGitBranch: () => "main", onBranchChange: (cb: () => void) => void listeners.push(cb) },
    );

    expect(footer?.render(200).join("\n")).toContain("GPT-5 [med]");
    expect(listeners).toHaveLength(1);
    listeners[0]();
    expect(requestRender).toHaveBeenCalled();
  });

  it("aggregates branch token totals from assistant message entries", () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-status-"));
    const configPath = join(dir, "pi-status.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        segments: ["total-input-tokens", "total-output-tokens", "used-tokens"],
      }),
      "utf8",
    );
    vi.stubEnv("PI_STATUS_CONFIG", configPath);

    const handlers = new Map<string, Array<(event: unknown, ctx: ExtensionContext) => void>>();
    let footerFactory: ((...args: unknown[]) => { render: (width: number) => string[] }) | undefined;

    const pi = {
      on(event: string, handler: (event: unknown, ctx: ExtensionContext) => void) {
        handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      },
      getThinkingLevel: () => "medium",
    } as unknown as ExtensionAPI;

    createExtension(pi);

    const ctx = createContext({
      ui: { ...createContext().ui, setFooter: (x: unknown) => (footerFactory = x as never) },
      sessionManager: {
        getSessionId: () => "abcdef123456",
        getBranch: () => [
          {
            type: "message",
            message: { role: "assistant", usage: { input: 1200, output: 3400, totalTokens: 4600 } },
          },
          {
            type: "toolResult",
            message: { role: "toolResult", usage: { input: 9999, output: 9999, totalTokens: 9999 } },
          },
          {
            type: "message",
            message: { role: "assistant", usage: { input: 800, output: 600, totalTokens: 1400 } },
          },
        ],
      } as unknown as ExtensionContext["sessionManager"],
      getContextUsage: () => ({ tokens: 100, contextWindow: 200, percent: 50 }),
    });

    for (const h of handlers.get("session_start") ?? []) h({}, ctx);

    const footer = footerFactory?.(
      { requestRender: () => {} },
      { fg: (_c: string, t: string) => t },
      { getGitBranch: () => "main", onBranchChange: () => () => {} },
    );

    const line = footer?.render(200).join("\n") ?? "";
    expect(line).toContain("↑2k");
    expect(line).toContain("↓4k");
    expect(line).toContain("6k tok");
    vi.unstubAllEnvs();
  });
});
