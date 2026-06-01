import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getConfigPath, loadConfig, normalizeSegments, normalizeStatusFilter } from "../src/config.ts";
import createExtension from "../src/index.ts";
import {
  DEFAULT_SEGMENTS,
  buildFooterLine,
  formatCompactNumber,
  formatModelWithReasoning,
  type FooterRenderInput,
  type ThemeLike,
} from "../src/render.ts";

function createTheme(): ThemeLike {
  return { fg: (color, text) => `<${color}>${text}</${color}>` };
}

function withDefaults(input: Omit<FooterRenderInput, "statusFilter">): FooterRenderInput {
  return { ...input, statusFilter: { mode: "all", hidden: [] } };
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

  it("normalizes statusFilter and preserves segments when filter invalid", () => {
    expect(normalizeStatusFilter(undefined)).toEqual({ mode: "all", hidden: [] });
    expect(normalizeStatusFilter({ mode: "all", hidden: ["a", "a", "", 1] })).toEqual({
      mode: "all",
      hidden: ["a"],
    });

    const dir = mkdtempSync(join(tmpdir(), "pi-status-"));
    const file = join(dir, "cfg.json");
    writeFileSync(file, JSON.stringify({ segments: ["model"], statusFilter: { mode: "bad" } }), "utf8");
    expect(loadConfig(file)).toEqual({
      segments: ["model"],
      statusFilter: { mode: "all", hidden: [] },
    });
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
      withDefaults({
        model: { id: "gpt-5", name: "GPT-5", reasoning: true },
        cwd: "/Users/test/project",
        thinkingLevel: "medium",
        runState: "idle",
        segments: DEFAULT_SEGMENTS,
      }),
      { fg: (_c, t) => t },
      200,
    );
    expect(line).toContain("GPT-5 [med]");
    expect(line).toContain("/Users/test/project");
  });

  it("renders codex rate windows and colors", () => {
    const line = buildFooterLine(
      withDefaults({
        cwd: "/x",
        thinkingLevel: "high",
        runState: "idle",
        usageState: {
          compatibility: {
            currentLiveProviderSnapshot: {
              providerId: "openai-codex",
              windows: [
                { key: "fiveHour", label: "5h", usedPercent: 69 },
                { key: "weekly", label: "wk", usedPercent: 90 },
              ],
            },
          },
        },
        segments: ["five-hour-limit", "weekly-limit"],
      }),
      createTheme(),
      200,
    );
    expect(line).toContain("5h 31% left");
    expect(line).toContain("wk 10% left");
    expect(line).toContain("<success>");
    expect(line).toContain("<error>");
  });

  it("omits non-codex and unavailable rate windows", () => {
    const nonCodex = buildFooterLine(
      withDefaults({
        cwd: "/x",
        thinkingLevel: "high",
        runState: "idle",
        usageState: {
          compatibility: {
            currentLiveProviderSnapshot: { providerId: "x", windows: [{ key: "fiveHour", label: "5h", usedPercent: 50 }] },
          },
        },
        segments: ["five-hour-limit"],
      }),
      createTheme(),
      200,
    );
    expect(nonCodex).toBe("");

    const unavailable = buildFooterLine(
      withDefaults({
        cwd: "/x",
        thinkingLevel: "high",
        runState: "idle",
        usageState: {
          compatibility: {
            currentLiveProviderSnapshot: {
              providerId: "openai-codex",
              windows: [{ key: "fiveHour", label: "5h", usedPercent: 50, unavailableReason: "down" }],
            },
          },
        },
        segments: ["five-hour-limit"],
      }),
      createTheme(),
      200,
    );
    expect(unavailable).toBe("");
  });

  it("renders extension statuses with ordering/filter/prefix stripping", () => {
    const line = buildFooterLine(
      {
        cwd: "/x",
        thinkingLevel: "high",
        runState: "idle",
        extensionStatuses: new Map([
          ["b", "b: two"],
          ["a", "a - one"],
          ["c", "\u001b[31mc: keep\u001b[0m"],
        ]),
        statusFilter: { mode: "all", hidden: ["b"] },
        segments: ["extension-statuses"],
      },
      createTheme(),
      200,
    );
    expect(line).toContain("one");
    expect(line).not.toContain("two");
    expect(line).toContain("\u001b[31mc: keep\u001b[0m");
  });

  it("respects only-mode and five-status cap", () => {
    const statuses = new Map<string, string>();
    for (const key of ["a", "b", "c", "d", "e", "f"]) statuses.set(key, `${key}: ${key.repeat(20)}`);

    const line = buildFooterLine(
      {
        cwd: "/x",
        thinkingLevel: "high",
        runState: "idle",
        extensionStatuses: statuses,
        statusFilter: { mode: "only", shown: ["a", "b", "c", "d", "e", "f"] },
        segments: ["extension-statuses"],
      },
      { fg: (_c, t) => t },
      200,
    );

    expect((line.match(/\|/g) ?? []).length).toBe(4);
    expect(line).not.toContain("f");
    expect(line).toContain("...");
  });

  it("applies final-line truncation", () => {
    const line = buildFooterLine(
      {
        cwd: "/x",
        thinkingLevel: "high",
        runState: "idle",
        extensionStatuses: new Map([["a", "a: verylongverylongverylong"]]),
        statusFilter: { mode: "all", hidden: [] },
        segments: ["extension-statuses", "current-dir"],
      },
      { fg: (_c, t) => t },
      10,
    );
    expect(line).toContain("...");
  });
});

describe("extension wiring", () => {
  function createBus() {
    const listeners = new Map<string, Array<(payload: unknown) => void>>();
    return {
      emit(event: string, payload: unknown) {
        for (const handler of listeners.get(event) ?? []) handler(payload);
      },
      on(event: string, handler: (payload: unknown) => void) {
        listeners.set(event, [...(listeners.get(event) ?? []), handler]);
        return () => {
          listeners.set(
            event,
            (listeners.get(event) ?? []).filter((current) => current !== handler),
          );
        };
      },
    };
  }

  it("installs footer and repaints on branch change", () => {
    const handlers = new Map<string, Array<(event: unknown, ctx: ExtensionContext) => void>>();
    let footerFactory: ((...args: unknown[]) => { render: (width: number) => string[] }) | undefined;
    const requestRender = vi.fn();
    const events = createBus();

    const pi = {
      events,
      on(event: string, handler: (event: unknown, ctx: ExtensionContext) => void) {
        handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      },
      getThinkingLevel: () => "medium",
    } as unknown as ExtensionAPI;

    createExtension(pi);

    const ctx = createContext({
      ui: { ...createContext().ui, setFooter: (x: unknown) => (footerFactory = x as never) },
    });

    for (const h of handlers.get("session_start") ?? []) h({}, ctx);

    const listeners: Array<() => void> = [];
    const footer = footerFactory?.(
      { requestRender },
      { fg: (_c: string, t: string) => t },
      {
        getGitBranch: () => "main",
        getExtensionStatuses: () => new Map(),
        onBranchChange: (cb: () => void) => void listeners.push(cb),
      },
    );

    expect(footer?.render(200).join("\n")).toContain("GPT-5 [med]");
    expect(listeners).toHaveLength(1);
    listeners[0]();
    expect(requestRender).toHaveBeenCalled();
  });

  it("requests usage snapshot and rerenders on usage events", () => {
    const handlers = new Map<string, Array<(event: unknown, ctx: ExtensionContext) => void>>();
    const requestRender = vi.fn();
    let footerFactory: ((...args: unknown[]) => { render: (width: number) => string[] }) | undefined;
    const events = createBus();
    const emitSpy = vi.spyOn(events, "emit");

    const pi = {
      events,
      on(event: string, handler: (event: unknown, ctx: ExtensionContext) => void) {
        handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      },
      getThinkingLevel: () => "medium",
    } as unknown as ExtensionAPI;

    createExtension(pi);
    expect(emitSpy).toHaveBeenCalledWith(
      "usage-core:request",
      expect.objectContaining({ type: "current", reply: expect.any(Function) }),
    );

    const ctx = createContext({
      ui: { ...createContext().ui, setFooter: (x: unknown) => (footerFactory = x as never) },
    });
    for (const h of handlers.get("session_start") ?? []) h({}, ctx);

    footerFactory?.(
      { requestRender },
      { fg: (_c: string, t: string) => t },
      { getGitBranch: () => "main", getExtensionStatuses: () => new Map(), onBranchChange: () => () => {} },
    );

    events.emit("usage-core:ready", {
      state: { compatibility: { currentLiveProviderSnapshot: { providerId: "openai-codex" } } },
    });
    events.emit("usage-core:update-current", { state: {} });

    expect(requestRender).toHaveBeenCalledTimes(2);
  });

  it("declares pi-status before pi-usage in pi.extensions", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { pi: { extensions: string[] } };
    expect(pkg.pi.extensions).toEqual(["./src/index.ts", "node_modules/@pi-vault/pi-usage/src/index.ts"]);
  });
});
