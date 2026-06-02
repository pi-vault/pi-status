import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, normalizeSegments, normalizeStatusFilter, saveConfigToSettings } from "../src/config.ts";
import createExtension from "../src/index.ts";
import {
  DEFAULT_SEGMENTS,
  buildFooterLine,
  findProjectRootLabel,
  formatCompactNumber,
  formatModelWithReasoning,
  type FooterRenderInput,
} from "../src/render.ts";
import { mapStatusDraftToFilter } from "../src/statusline-ui.ts";

function withDefaults(input: Omit<FooterRenderInput, "filter">): FooterRenderInput {
  return { ...input, filter: { mode: "all", hidden: [] } };
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
      setWorkingVisible: () => {},
      setWorkingIndicator: () => {},
      setHiddenThinkingLabel: () => {},
      setWidget: () => {},
      setFooter: () => {},
      setHeader: () => {},
      setTitle: () => {},
      custom: async () => null,
      pasteToEditor: () => {},
      setEditorText: () => {},
      getEditorText: () => "",
      editor: async () => undefined,
      addAutocompleteProvider: () => {},
      setEditorComponent: () => {},
      getEditorComponent: () => undefined,
      theme: {} as never,
      getAllThemes: () => [],
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
  it("normalizes segments and filter", () => {
    expect(normalizeSegments(["model", "model", "unknown", 1, "current-dir", "git-branch", "project-name"]))
      .toEqual(["model", "current-dir", "git-branch", "project-name"]);

    expect(normalizeStatusFilter(undefined)).toEqual({ mode: "all", hidden: [] });
    expect(normalizeStatusFilter({ mode: "all", hidden: ["a", "a", "", 1] })).toEqual({
      mode: "all",
      hidden: ["a"],
    });
  });

  it("loads precedence: settings > default", () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-status-"));
    const globalHome = join(dir, "home");
    const project = join(dir, "project");
    const globalSettings = join(globalHome, ".pi/agent/settings.json");
    const projectSettings = join(project, ".pi/settings.json");

    mkdirSync(join(project, ".pi"), { recursive: true });
    mkdirSync(join(globalHome, ".pi/agent"), { recursive: true });
    writeFileSync(globalSettings, JSON.stringify({ statusLine: { segments: ["git-branch"] } }), "utf8");
    writeFileSync(projectSettings, JSON.stringify({ statusLine: { filter: { mode: "only", shown: ["x"] } } }), "utf8");

    const oldHome = process.env.HOME;
    process.env.HOME = globalHome;
    try {
      const viaSettings = loadConfig({ cwd: project });
      expect(viaSettings.source).toBe("settings");
      expect(viaSettings.config.segments).toEqual(["git-branch"]);
      expect(viaSettings.config.filter).toEqual({ mode: "only", shown: ["x"] });

      writeFileSync(projectSettings, "{ bad", "utf8");
      writeFileSync(globalSettings, "{ bad", "utf8");
      const viaDefault = loadConfig({ cwd: project });
      expect(viaDefault.source).toBe("default");
      expect(viaDefault.config.segments).toEqual(DEFAULT_SEGMENTS);
    } finally {
      process.env.HOME = oldHome;
    }
  });

  it("saves into project when project has statusLine, else global", () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-status-"));
    const globalHome = join(dir, "home");
    const project = join(dir, "project");
    const globalSettings = join(globalHome, ".pi/agent/settings.json");
    const projectSettings = join(project, ".pi/settings.json");

    mkdirSync(join(project, ".pi"), { recursive: true });
    mkdirSync(join(globalHome, ".pi/agent"), { recursive: true });
    writeFileSync(projectSettings, JSON.stringify({ statusLine: { segments: ["model"] }, x: 1 }), "utf8");

    const oldHome = process.env.HOME;
    process.env.HOME = globalHome;
    try {
      const first = saveConfigToSettings(
        { segments: ["current-dir"], filter: { mode: "all", hidden: [] } },
        { cwd: project },
      );
      expect(first.target).toBe("project");
      const projectParsed = JSON.parse(readFileSync(projectSettings, "utf8"));
      expect(projectParsed.x).toBe(1);
      expect(projectParsed.statusLine.segments).toEqual(["current-dir"]);

      writeFileSync(projectSettings, JSON.stringify({ y: 2 }), "utf8");
      const second = saveConfigToSettings(
        { segments: ["model"], filter: { mode: "only", shown: ["a"] } },
        { cwd: project },
      );
      expect(second.target).toBe("global");
      const globalParsed = JSON.parse(readFileSync(globalSettings, "utf8"));
      expect(globalParsed.statusLine.filter).toEqual({ mode: "only", shown: ["a"] });
    } finally {
      process.env.HOME = oldHome;
    }
  });

  it("refuses to fall through to global when project settings are malformed", () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-status-"));
    const globalHome = join(dir, "home");
    const project = join(dir, "project");
    const projectSettings = join(project, ".pi/settings.json");

    mkdirSync(join(project, ".pi"), { recursive: true });
    mkdirSync(join(globalHome, ".pi/agent"), { recursive: true });
    writeFileSync(projectSettings, "{ bad", "utf8");

    const oldHome = process.env.HOME;
    process.env.HOME = globalHome;
    try {
      expect(() =>
        saveConfigToSettings(
          { segments: ["model"], filter: { mode: "all", hidden: [] } },
          { cwd: project },
        ),
      ).toThrow(/project settings are malformed/i);
    } finally {
      process.env.HOME = oldHome;
    }
  });
});

describe("filter mapping", () => {
  it('maps "new shown" to all+hidden', () => {
    expect(
      mapStatusDraftToFilter({
        discoveredKeys: ["c", "a", "b"],
        shownKeys: ["a", "c"],
        newStatusesShown: true,
      }),
    ).toEqual({ mode: "all", hidden: ["b"] });
  });

  it('maps "new hidden" to only+shown', () => {
    expect(
      mapStatusDraftToFilter({
        discoveredKeys: ["c", "a", "b"],
        shownKeys: ["a", "c"],
        newStatusesShown: false,
      }),
    ).toEqual({ mode: "only", shown: ["a", "c"] });
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
        segments: DEFAULT_SEGMENTS,
      }),
      { fg: (_c, t) => t },
      200,
    );
    expect(line).toContain("GPT-5 [med]");
    expect(line).toContain("/Users/test/project");
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

  it("installs footer and registers /statusline", () => {
    const handlers = new Map<string, Array<(event: unknown, ctx: ExtensionContext) => void>>();
    let footerFactory: ((...args: unknown[]) => { render: (width: number) => string[] }) | undefined;
    const requestRender = vi.fn();
    const events = createBus();
    const registerCommand = vi.fn();

    const pi = {
      events,
      on(event: string, handler: (event: unknown, ctx: ExtensionContext) => void) {
        handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      },
      registerCommand,
      getThinkingLevel: () => "medium",
    } as unknown as ExtensionAPI;

    createExtension(pi);
    expect(registerCommand).toHaveBeenCalledWith(
      "statusline",
      expect.objectContaining({ handler: expect.any(Function) }),
    );

    const ctx = createContext({
      ui: { ...createContext().ui, setFooter: (x: unknown) => (footerFactory = x as never) },
    });

    for (const h of handlers.get("session_start") ?? []) h({}, ctx);

    const footer = footerFactory?.(
      { requestRender },
      { fg: (_c: string, t: string) => t },
      {
        getGitBranch: () => "main",
        getExtensionStatuses: () => new Map(),
        onBranchChange: (cb: () => void) => {
          cb();
          return () => {};
        },
      },
    );

    expect(footer?.render(200).join("\n")).toContain("GPT-5 [med]");
    expect(requestRender).toHaveBeenCalled();
  });

  it("reloads persisted settings on session events", () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-status-runtime-"));
    const globalHome = join(dir, "home");
    const project = join(dir, "project");
    const projectSettings = join(project, ".pi/settings.json");

    mkdirSync(join(project, ".pi"), { recursive: true });
    mkdirSync(join(globalHome, ".pi/agent"), { recursive: true });
    writeFileSync(
      projectSettings,
      JSON.stringify({
        statusLine: { segments: ["model"], filter: { mode: "all", hidden: [] } },
      }),
      "utf8",
    );

    const handlers = new Map<
      string,
      Array<(event: unknown, ctx: ExtensionContext) => void>
    >();
    let footerFactory:
      | ((...args: unknown[]) => { render: (width: number) => string[] })
      | undefined;
    const events = createBus();
    const registerCommand = vi.fn();
    const oldHome = process.env.HOME;
    process.env.HOME = globalHome;

    try {
      const pi = {
        events,
        on(event: string, handler: (event: unknown, ctx: ExtensionContext) => void) {
          handlers.set(event, [...(handlers.get(event) ?? []), handler]);
        },
        registerCommand,
        getThinkingLevel: () => "medium",
      } as unknown as ExtensionAPI;

      createExtension(pi);

      const ctx = createContext({
        cwd: project,
        ui: {
          ...createContext().ui,
          setFooter: (x: unknown) => (footerFactory = x as never),
        },
      });

      for (const h of handlers.get("session_start") ?? []) h({}, ctx);

      const footer = footerFactory?.(
        {},
        { fg: (_c: string, t: string) => t },
        {
          getGitBranch: () => "main",
          getExtensionStatuses: () => new Map(),
        },
      );

      expect(footer?.render(200).join("\n")).toBe("GPT-5");

      writeFileSync(
        projectSettings,
        JSON.stringify({
          statusLine: {
            segments: ["project-name"],
            filter: { mode: "all", hidden: [] },
          },
        }),
        "utf8",
      );
      mkdirSync(join(project, ".git"), { recursive: true });

      for (const h of handlers.get("session_tree") ?? []) h({}, ctx);

      expect(footer?.render(200).join("\n")).toBe("project");
    } finally {
      process.env.HOME = oldHome;
    }
  });

  it("declares pi-status before pi-usage in pi.extensions", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { pi: { extensions: string[] } };
    expect(pkg.pi.extensions).toEqual(["./src/index.ts", "node_modules/@pi-vault/pi-usage/src/index.ts"]);
  });
});
