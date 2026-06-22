import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import createExtension from "../src/index.ts";
import {
  buildPiWithHandlers,
  buildSetFooterSpy,
  createBus,
  createContext,
  renderWithFactory,
} from "./helpers.ts";

describe("extension wiring", () => {
  it("installs footer and registers /statusline", () => {
    const handlers = new Map<
      string,
      Array<(event: unknown, ctx: ExtensionContext) => void>
    >();
    let footerFactory:
      | ((...args: unknown[]) => { render: (width: number) => string[] })
      | undefined;
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

  it("re-renders the live footer when usage-core updates arrive after startup", () => {
    const handlers = new Map<
      string,
      Array<(event: unknown, ctx: ExtensionContext) => void>
    >();
    let footerFactory:
      | ((...args: unknown[]) => { render: (width: number) => string[] })
      | undefined;
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

    const ctx = createContext({
      ui: { ...createContext().ui, setFooter: (x: unknown) => (footerFactory = x as never) },
    });

    for (const h of handlers.get("session_start") ?? []) h({}, ctx);

    footerFactory?.(
      { requestRender },
      { fg: (_c: string, t: string) => t },
      {
        getGitBranch: () => "main",
        getExtensionStatuses: () => new Map(),
      },
    );

    requestRender.mockClear();
    events.emit("usage-core:update-current", {
      state: {
        compatibility: {
          currentLiveProviderSnapshot: {
            providerId: "minimax",
            windows: [{ key: "fiveHour", usedPercent: 20 }],
          },
        },
      },
    });

    expect(requestRender).toHaveBeenCalledTimes(1);
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
        statusLine: { segments: ["model"], extensionSegments: { hidden: [] } },
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
            extensionSegments: { hidden: [] },
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

  it("declares only pi-status in pi.extensions", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      pi: { extensions: string[] };
    };
    expect(pkg.pi.extensions).toEqual(["./src/index.ts"]);
  });

  it("invokes /statusline via ctx.ui.custom without overlay mode", async () => {
    const handlers = new Map<
      string,
      Array<(event: unknown, ctx: ExtensionContext) => void>
    >();
    const events = createBus();
    const registerCommand = vi.fn();
    const customMock = vi.fn(async (..._args: unknown[]) => null);

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
      ui: {
        ...createContext().ui,
        custom: customMock as unknown as ExtensionContext["ui"]["custom"],
      },
    });

    for (const h of handlers.get("session_start") ?? []) h({}, ctx);

    const commandCall = registerCommand.mock.calls.find(
      ([name]) => name === "statusline",
    );
    expect(commandCall).toBeDefined();
    const handler = (
      commandCall?.[1] as {
        handler: (args: string, ctx: ExtensionContext) => Promise<void>;
      }
    ).handler;

    await handler("", ctx);

    expect(customMock).toHaveBeenCalledTimes(1);
    const callArgs = customMock.mock.calls[0] as unknown[];
    expect(typeof callArgs[0]).toBe("function");
    expect(callArgs[1]).toBeUndefined();
  });

  it("persists /statusline result to settings when user saves", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-status-inline-"));
    const globalHome = join(dir, "home");
    const project = join(dir, "project");
    const globalSettings = join(globalHome, ".pi/agent/settings.json");

    mkdirSync(join(project, ".pi"), { recursive: true });
    mkdirSync(join(globalHome, ".pi/agent"), { recursive: true });
    writeFileSync(join(project, ".pi/settings.json"), JSON.stringify({ y: 1 }), "utf8");

    const handlers = new Map<
      string,
      Array<(event: unknown, ctx: ExtensionContext) => void>
    >();
    const events = createBus();
    const registerCommand = vi.fn();
    const customMock = vi.fn();

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
        ui: { ...createContext().ui, custom: customMock },
      });

      for (const h of handlers.get("session_start") ?? []) h({}, ctx);

      const commandCall = registerCommand.mock.calls.find(
        ([name]) => name === "statusline",
      );
      const handler = (
        commandCall?.[1] as {
          handler: (args: string, ctx: ExtensionContext) => Promise<void>;
        }
      ).handler;

      let savedResult: unknown;
      customMock.mockImplementationOnce(
        async (factory: (...args: unknown[]) => unknown) => {
          const component = (
            factory as unknown as (
              ...args: unknown[]
            ) => { handleInput: (data: string) => void }
          )(
            { requestRender: () => {} },
            { fg: (_c: string, t: string) => t },
            {},
            (result: unknown) => {
              savedResult = result;
            },
          );
          component.handleInput("\r");
          return savedResult;
        },
      );

      await handler("", ctx);

      const saved = JSON.parse(readFileSync(globalSettings, "utf8"));
      expect(saved.statusLine).toBeDefined();
      expect(saved.statusLine.segments).toEqual([
        "model-with-reasoning",
        "current-dir",
      ]);
    } finally {
      process.env.HOME = oldHome;
    }
  });

  it("does not persist /statusline result when user cancels", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-status-inline-cancel-"));
    const globalHome = join(dir, "home");
    const project = join(dir, "project");
    const projectSettings = join(project, ".pi/settings.json");

    mkdirSync(join(project, ".pi"), { recursive: true });
    mkdirSync(join(globalHome, ".pi/agent"), { recursive: true });
    const beforeContent = JSON.stringify({ y: 1 });
    writeFileSync(projectSettings, beforeContent, "utf8");

    const handlers = new Map<
      string,
      Array<(event: unknown, ctx: ExtensionContext) => void>
    >();
    const events = createBus();
    const registerCommand = vi.fn();
    const customMock = vi.fn();

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
        ui: { ...createContext().ui, custom: customMock },
      });

      for (const h of handlers.get("session_start") ?? []) h({}, ctx);

      const commandCall = registerCommand.mock.calls.find(
        ([name]) => name === "statusline",
      );
      const handler = (
        commandCall?.[1] as {
          handler: (args: string, ctx: ExtensionContext) => Promise<void>;
        }
      ).handler;

      customMock.mockImplementationOnce(
        async (factory: (...args: unknown[]) => unknown) => {
          const component = (
            factory as unknown as (
              ...args: unknown[]
            ) => { handleInput: (data: string) => void }
          )(
            { requestRender: () => {} },
            { fg: (_c: string, t: string) => t },
            {},
            () => {},
          );
          component.handleInput("\x1b");
          return null;
        },
      );

      await handler("", ctx);

      const afterContent = readFileSync(projectSettings, "utf8");
      expect(afterContent).toBe(beforeContent);
    } finally {
      process.env.HOME = oldHome;
    }
  });

  it("swaps to empty footer during /statusline editor and restores live footer on save", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-status-footer-save-"));
    const globalHome = join(dir, "home");
    const project = join(dir, "project");
    const globalSettings = join(globalHome, ".pi/agent/settings.json");

    mkdirSync(join(project, ".pi"), { recursive: true });
    mkdirSync(join(globalHome, ".pi/agent"), { recursive: true });
    writeFileSync(join(project, ".pi/settings.json"), JSON.stringify({ y: 1 }), "utf8");

    const { pi, handlers, registerCommandCalls } = buildPiWithHandlers();
    const customMock = vi.fn();
    const footerSpy = buildSetFooterSpy();

    const oldHome = process.env.HOME;
    process.env.HOME = globalHome;

    try {
      createExtension(pi);

      const ctx = createContext({
        cwd: project,
        ui: {
          ...createContext().ui,
          setFooter: footerSpy.setFooter,
          custom: customMock,
        },
      });

      for (const h of handlers.get("session_start") ?? []) h({}, ctx);

      expect(footerSpy.calls).toHaveLength(1);
      expect(renderWithFactory(footerSpy.calls[0])).toContain("GPT-5 [med]");

      const commandCall = registerCommandCalls.find(([name]) => name === "statusline");
      expect(commandCall).toBeDefined();
      const handler = (
        commandCall?.[1] as {
          handler: (args: string, ctx: ExtensionContext) => Promise<void>;
        }
      ).handler;

      customMock.mockImplementationOnce(
        async (factory: (...args: unknown[]) => unknown) => {
          expect(footerSpy.calls).toHaveLength(2);
          expect(renderWithFactory(footerSpy.calls[1])).toBe("");

          let savedResult: unknown = null;
          const component = (
            factory as unknown as (
              ...args: unknown[]
            ) => { handleInput: (data: string) => void }
          )(
            { requestRender: () => {} },
            { fg: (_c: string, t: string) => t },
            {},
            (result: unknown) => {
              savedResult = result;
            },
          );
          component.handleInput("\r");
          return savedResult;
        },
      );

      await handler("", ctx);

      expect(footerSpy.calls).toHaveLength(3);
      expect(renderWithFactory(footerSpy.calls[2])).toContain("GPT-5 [med]");

      const saved = JSON.parse(readFileSync(globalSettings, "utf8"));
      expect(saved.statusLine).toBeDefined();
      expect(saved.statusLine.segments).toEqual([
        "model-with-reasoning",
        "current-dir",
      ]);
    } finally {
      process.env.HOME = oldHome;
    }
  });

  it("swaps to empty footer during /statusline editor and restores live footer on cancel", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-status-footer-cancel-"));
    const globalHome = join(dir, "home");
    const project = join(dir, "project");
    const projectSettings = join(project, ".pi/settings.json");

    mkdirSync(join(project, ".pi"), { recursive: true });
    mkdirSync(join(globalHome, ".pi/agent"), { recursive: true });
    const beforeContent = JSON.stringify({ y: 1 });
    writeFileSync(projectSettings, beforeContent, "utf8");

    const { pi, handlers, registerCommandCalls } = buildPiWithHandlers();
    const customMock = vi.fn();
    const footerSpy = buildSetFooterSpy();

    const oldHome = process.env.HOME;
    process.env.HOME = globalHome;

    try {
      createExtension(pi);

      const ctx = createContext({
        cwd: project,
        ui: {
          ...createContext().ui,
          setFooter: footerSpy.setFooter,
          custom: customMock,
        },
      });

      for (const h of handlers.get("session_start") ?? []) h({}, ctx);

      expect(footerSpy.calls).toHaveLength(1);
      expect(renderWithFactory(footerSpy.calls[0])).toContain("GPT-5 [med]");

      const commandCall = registerCommandCalls.find(([name]) => name === "statusline");
      expect(commandCall).toBeDefined();
      const handler = (
        commandCall?.[1] as {
          handler: (args: string, ctx: ExtensionContext) => Promise<void>;
        }
      ).handler;

      customMock.mockImplementationOnce(
        async (factory: (...args: unknown[]) => unknown) => {
          expect(footerSpy.calls).toHaveLength(2);
          expect(renderWithFactory(footerSpy.calls[1])).toBe("");

          const component = (
            factory as unknown as (
              ...args: unknown[]
            ) => { handleInput: (data: string) => void }
          )(
            { requestRender: () => {} },
            { fg: (_c: string, t: string) => t },
            {},
            () => {},
          );
          component.handleInput("\x1b");
          return null;
        },
      );

      await handler("", ctx);

      expect(footerSpy.calls).toHaveLength(3);
      expect(renderWithFactory(footerSpy.calls[2])).toContain("GPT-5 [med]");
      expect(readFileSync(projectSettings, "utf8")).toBe(beforeContent);
    } finally {
      process.env.HOME = oldHome;
    }
  });

  it("restores live footer when ctx.ui.custom throws during /statusline", async () => {
    const handlers = new Map<
      string,
      Array<(event: unknown, ctx: ExtensionContext) => void>
    >();
    const events = createBus();
    const registerCommand = vi.fn();
    const customMock = vi.fn();
    const footerSpy = buildSetFooterSpy();

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
      ui: {
        ...createContext().ui,
        setFooter: footerSpy.setFooter,
        custom: customMock as unknown as ExtensionContext["ui"]["custom"],
      },
    });

    for (const h of handlers.get("session_start") ?? []) h({}, ctx);

    expect(footerSpy.calls).toHaveLength(1);
    expect(renderWithFactory(footerSpy.calls[0])).toContain("GPT-5 [med]");

    const commandCall = registerCommand.mock.calls.find(([name]) => name === "statusline");
    expect(commandCall).toBeDefined();
    const handler = (
      commandCall?.[1] as {
        handler: (args: string, ctx: ExtensionContext) => Promise<void>;
      }
    ).handler;

    let customObservedFooterState = -1;
    customMock.mockImplementationOnce(async () => {
      customObservedFooterState = footerSpy.calls.length;
      expect(renderWithFactory(footerSpy.calls[footerSpy.calls.length - 1])).toBe("");
      throw new Error("custom UI failed");
    });

    await expect(handler("", ctx)).rejects.toThrow("custom UI failed");

    expect(customObservedFooterState).toBe(2);
    expect(footerSpy.calls).toHaveLength(3);
    expect(renderWithFactory(footerSpy.calls[0])).toContain("GPT-5 [med]");
    expect(renderWithFactory(footerSpy.calls[1])).toBe("");
    expect(renderWithFactory(footerSpy.calls[2])).toContain("GPT-5 [med]");
  });
});

describe("/statusline theme adaptation", () => {
  it("wraps a Pi-like theme before creating the editor", async () => {
    const { pi, handlers, registerCommandCalls } = buildPiWithHandlers();
    const customMock = vi.fn();
    const fgCalls: Array<[string, string]> = [];
    const boldCalls: string[] = [];
    const piLikeTheme = {
      fg: (color: string, text: string) => {
        fgCalls.push([color, text]);
        return `<fg:${color}:${text}>`;
      },
      bold: (text: string) => {
        boldCalls.push(text);
        return `<bold:${text}>`;
      },
    };

    createExtension(pi);

    const ctx = createContext({
      ui: { ...createContext().ui, custom: customMock },
    });
    for (const h of handlers.get("session_start") ?? []) h({}, ctx);

    const commandCall = registerCommandCalls.find(([name]) => name === "statusline");
    expect(commandCall).toBeDefined();
    const handler = (
      commandCall?.[1] as {
        handler: (args: string, ctx: ExtensionContext) => Promise<void>;
      }
    ).handler;

    let receivedTheme: unknown;
    customMock.mockImplementationOnce(
      async (factory: (...args: unknown[]) => unknown) => {
        const component = (
          factory as unknown as (...args: unknown[]) => {
            handleInput: (data: string) => void;
            render: (width: number) => string[];
          }
        )(
          { requestRender: () => {} },
          piLikeTheme,
          {},
          (result: unknown) => {
            receivedTheme = result;
          },
        );
        component.render(200);
        component.handleInput("\x1b");
        return null;
      },
    );

    await handler("", ctx);

    expect(fgCalls.length).toBeGreaterThan(0);
    expect(fgCalls.some(([color]) => color === "accent")).toBe(true);
    expect(fgCalls.some(([color]) => color === "borderMuted")).toBe(true);
    expect(boldCalls).toContain("Configure Status Line");
    expect(receivedTheme).toBeNull();
  });

  it("falls back to noTheme when the runtime theme is missing fg", async () => {
    const { pi, handlers, registerCommandCalls } = buildPiWithHandlers();
    const customMock = vi.fn();
    const incompleteTheme = {
      bold: (_text: string) => "should-not-be-called",
    };

    createExtension(pi);

    const ctx = createContext({
      ui: { ...createContext().ui, custom: customMock },
    });
    for (const h of handlers.get("session_start") ?? []) h({}, ctx);

    const commandCall = registerCommandCalls.find(([name]) => name === "statusline");
    expect(commandCall).toBeDefined();
    const handler = (
      commandCall?.[1] as {
        handler: (args: string, ctx: ExtensionContext) => Promise<void>;
      }
    ).handler;

    let renderOutput: string[] = [];
    let didThrow = false;
    customMock.mockImplementationOnce(
      async (factory: (...args: unknown[]) => unknown) => {
        const component = (
          factory as unknown as (...args: unknown[]) => {
            handleInput: (data: string) => void;
            render: (width: number) => string[];
          }
        )(
          { requestRender: () => {} },
          incompleteTheme,
          {},
          () => {},
        );
        try {
          renderOutput = component.render(200);
        } catch (error) {
          didThrow = true;
          throw error;
        }
        component.handleInput("\x1b");
        return null;
      },
    );

    await expect(handler("", ctx)).resolves.toBeUndefined();
    expect(didThrow).toBe(false);
    expect(renderOutput[0]).toBe("Configure Status Line");
  });

  it("falls back to noTheme when the runtime theme is missing bold", async () => {
    const { pi, handlers, registerCommandCalls } = buildPiWithHandlers();
    const customMock = vi.fn();
    const incompleteTheme = {
      fg: (_color: string, text: string) => text,
    };

    createExtension(pi);

    const ctx = createContext({
      ui: { ...createContext().ui, custom: customMock },
    });
    for (const h of handlers.get("session_start") ?? []) h({}, ctx);

    const commandCall = registerCommandCalls.find(([name]) => name === "statusline");
    expect(commandCall).toBeDefined();
    const handler = (
      commandCall?.[1] as {
        handler: (args: string, ctx: ExtensionContext) => Promise<void>;
      }
    ).handler;

    let didThrow = false;
    customMock.mockImplementationOnce(
      async (factory: (...args: unknown[]) => unknown) => {
        const component = (
          factory as unknown as (...args: unknown[]) => {
            handleInput: (data: string) => void;
            render: (width: number) => string[];
          }
        )(
          { requestRender: () => {} },
          incompleteTheme,
          {},
          () => {},
        );
        try {
          component.render(200);
        } catch (error) {
          didThrow = true;
          throw error;
        }
        component.handleInput("\x1b");
        return null;
      },
    );

    await expect(handler("", ctx)).resolves.toBeUndefined();
    expect(didThrow).toBe(false);
  });

  it("falls back to noTheme when ctx.ui.custom passes null as the theme", async () => {
    const { pi, handlers, registerCommandCalls } = buildPiWithHandlers();
    const customMock = vi.fn();

    createExtension(pi);

    const ctx = createContext({
      ui: { ...createContext().ui, custom: customMock },
    });
    for (const h of handlers.get("session_start") ?? []) h({}, ctx);

    const commandCall = registerCommandCalls.find(([name]) => name === "statusline");
    expect(commandCall).toBeDefined();
    const handler = (
      commandCall?.[1] as {
        handler: (args: string, ctx: ExtensionContext) => Promise<void>;
      }
    ).handler;

    let didThrow = false;
    customMock.mockImplementationOnce(
      async (factory: (...args: unknown[]) => unknown) => {
        const component = (
          factory as unknown as (...args: unknown[]) => {
            handleInput: (data: string) => void;
            render: (width: number) => string[];
          }
        )(
          { requestRender: () => {} },
          null,
          {},
          () => {},
        );
        try {
          component.render(200);
        } catch (error) {
          didThrow = true;
          throw error;
        }
        component.handleInput("\x1b");
        return null;
      },
    );

    await expect(handler("", ctx)).resolves.toBeUndefined();
    expect(didThrow).toBe(false);
  });
});
