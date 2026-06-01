import { homedir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import createExtension from "../src/index.ts";
import {
  abbreviateHomeDir,
  buildFooterLine,
  formatModelWithReasoning,
  type ThemeLike,
} from "../src/render.ts";

type FooterFactory = (
  tui: { requestRender: () => void },
  theme: ThemeLike,
  footerData: unknown,
) => {
  render: (width: number) => string[];
  invalidate: () => void;
  dispose?: () => void;
};

type SetFooterArg = FooterFactory | undefined;

type FakePi = ExtensionAPI & {
  trigger: (event: string, ctx: ExtensionContext) => void;
  setFooterCalls: SetFooterArg[];
  requestRender: ReturnType<typeof vi.fn>;
};

function createTheme(): ThemeLike {
  return {
    fg: (color, text) => `<${color}>${text}</${color}>`,
  };
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
    cwd: `${homedir()}/Developer/pi-vault/pi-status`,
    sessionManager: {} as ExtensionContext["sessionManager"],
    modelRegistry: {} as ExtensionContext["modelRegistry"],
    model: undefined,
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

function createPi(): FakePi {
  const handlers = new Map<string, Array<(event: unknown, ctx: ExtensionContext) => void>>();
  const setFooterCalls: SetFooterArg[] = [];
  const requestRender = vi.fn();

  const pi = {
    events: {
      emit: () => {},
      on: () => () => {},
    },
    on(event: string, handler: (event: unknown, ctx: ExtensionContext) => void) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    trigger(event: string, ctx: ExtensionContext) {
      for (const handler of handlers.get(event) ?? []) {
        handler({ type: event }, ctx);
      }
    },
    registerCommand: () => {},
    registerTool: () => {},
    registerShortcut: () => {},
    registerFlag: () => {},
    getFlag: () => undefined,
    registerMessageRenderer: () => {},
    sendMessage: () => {},
    sendUserMessage: () => {},
    appendEntry: () => {},
    setSessionName: () => {},
    getSessionName: () => undefined,
    setLabel: () => {},
    exec: async () => ({ code: 0, stdout: "", stderr: "" }),
    getActiveTools: () => [],
    getAllTools: () => [],
    setActiveTools: () => {},
    setModel: async () => true,
    getThinkingLevel: () => "medium",
    setThinkingLevel: () => {},
    registerProvider: () => {},
    setFooterCalls,
    requestRender,
  } as unknown as FakePi;

  return pi;
}

function attachFooterSpy(ctx: ExtensionContext, pi: FakePi): ExtensionContext {
  const next = {
    ...ctx,
    ui: {
      ...ctx.ui,
      setFooter: (arg: SetFooterArg) => {
        pi.setFooterCalls.push(arg);
      },
    },
  } as ExtensionContext;

  return next;
}

function renderFromFactory(factory: SetFooterArg, width = 120): string {
  if (!factory) return "";
  const component = factory({ requestRender: () => {} }, createTheme(), {});
  return component.render(width).join("\n");
}

function stripAnsi(value: string): string {
  let out = "";

  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code !== 27) {
      out += value[i] ?? "";
      continue;
    }

    i += 1;
    if (value[i] !== "[") continue;

    i += 1;
    while (i < value.length) {
      const next = value.charCodeAt(i);
      if (next >= 64 && next <= 126) break;
      i += 1;
    }
  }

  return out;
}

describe("render helpers", () => {
  it("formats reasoning-capable models with normalized thinking labels", () => {
    expect(
      formatModelWithReasoning(
        { id: "gpt-5-mini", name: "GPT-5 Mini", reasoning: true },
        "minimal",
      ),
    ).toBe("GPT-5 Mini [min]");
    expect(
      formatModelWithReasoning({ id: "gpt-5-mini", name: "GPT-5 Mini", reasoning: true }, "medium"),
    ).toBe("GPT-5 Mini [med]");
  });

  it("renders non-reasoning models without a thinking suffix", () => {
    expect(
      formatModelWithReasoning(
        { id: "claude-sonnet", name: "Claude Sonnet", reasoning: false },
        "high",
      ),
    ).toBe("Claude Sonnet");
  });

  it("omits missing models", () => {
    expect(formatModelWithReasoning(undefined, "high")).toBeNull();
  });

  it("abbreviates the home directory", () => {
    expect(abbreviateHomeDir("/Users/lanh/Developer/pi-vault/pi-status", "/Users/lanh")).toBe(
      "~/Developer/pi-vault/pi-status",
    );
  });

  it("truncates narrow output after styling", () => {
    const line = buildFooterLine(
      {
        model: { id: "gpt-5-mini", name: "GPT-5 Mini", reasoning: true },
        cwd: "/Users/lanh/Developer/pi-vault/pi-status",
        thinkingLevel: "medium",
      },
      {
        fg: (_color, text) => text,
      },
      12,
    );

    expect(stripAnsi(line).length).toBeLessThanOrEqual(12);
  });
});

describe("extension lifecycle", () => {
  it("installs the footer on session_start", () => {
    const pi = createPi();
    createExtension(pi);
    const ctx = attachFooterSpy(
      createContext({
        model: { id: "gpt-5-mini", name: "GPT-5 Mini", reasoning: true } as never,
      }),
      pi,
    );

    pi.trigger("session_start", ctx);

    expect(pi.setFooterCalls).toHaveLength(1);
    expect(typeof pi.setFooterCalls[0]).toBe("function");
    expect(renderFromFactory(pi.setFooterCalls[0])).toContain("GPT-5 Mini [med]");
    expect(renderFromFactory(pi.setFooterCalls[0])).toContain("~/Developer/pi-vault/pi-status");
  });

  it("reinstalls the footer on session_tree with the new context", () => {
    const pi = createPi();
    createExtension(pi);
    const startCtx = attachFooterSpy(
      createContext({
        cwd: `${homedir()}/project-a`,
        model: { id: "gpt-5-mini", name: "GPT-5 Mini", reasoning: true } as never,
      }),
      pi,
    );
    const treeCtx = attachFooterSpy(
      createContext({
        cwd: `${homedir()}/project-b`,
        model: { id: "claude-sonnet", name: "Claude Sonnet", reasoning: false } as never,
      }),
      pi,
    );

    pi.trigger("session_start", startCtx);
    pi.trigger("session_tree", treeCtx);

    expect(pi.setFooterCalls).toHaveLength(2);
    expect(renderFromFactory(pi.setFooterCalls[1])).toContain("~/project-b");
    expect(renderFromFactory(pi.setFooterCalls[1])).toContain("Claude Sonnet");
  });

  it("requests repaint on model_select and thinking_level_select", () => {
    const requestRender = vi.fn();
    const setFooterCalls: SetFooterArg[] = [];
    const handlers = new Map<string, Array<(event: unknown, ctx: ExtensionContext) => void>>();

    const pi = {
      events: {
        emit: () => {},
        on: () => () => {},
      },
      on(event: string, handler: (event: unknown, ctx: ExtensionContext) => void) {
        const list = handlers.get(event) ?? [];
        list.push(handler);
        handlers.set(event, list);
      },
      registerCommand: () => {},
      registerTool: () => {},
      registerShortcut: () => {},
      registerFlag: () => {},
      getFlag: () => undefined,
      registerMessageRenderer: () => {},
      sendMessage: () => {},
      sendUserMessage: () => {},
      appendEntry: () => {},
      setSessionName: () => {},
      getSessionName: () => undefined,
      setLabel: () => {},
      exec: async () => ({ code: 0, stdout: "", stderr: "" }),
      getActiveTools: () => [],
      getAllTools: () => [],
      setActiveTools: () => {},
      setModel: async () => true,
      getThinkingLevel: () => "medium",
      setThinkingLevel: () => {},
      registerProvider: () => {},
    } as unknown as ExtensionAPI;

    createExtension(pi);
    const ctx = {
      ...createContext(),
      ui: {
        ...createContext().ui,
        setFooter: (arg: SetFooterArg) => {
          setFooterCalls.push(arg);
        },
      },
    } as ExtensionContext;

    for (const handler of handlers.get("session_start") ?? []) {
      handler({}, ctx);
    }
    const factory = setFooterCalls[0];
    factory?.({ requestRender }, createTheme(), {});

    for (const handler of handlers.get("model_select") ?? []) {
      handler({}, ctx);
    }
    for (const handler of handlers.get("thinking_level_select") ?? []) {
      handler({}, ctx);
    }

    expect(requestRender).toHaveBeenCalledTimes(2);
  });

  it("cleans up the footer on session_shutdown", () => {
    const pi = createPi();
    createExtension(pi);
    const ctx = attachFooterSpy(createContext(), pi);

    pi.trigger("session_start", ctx);
    pi.trigger("session_shutdown", ctx);

    expect(pi.setFooterCalls.at(-1)).toBeUndefined();
  });
});
