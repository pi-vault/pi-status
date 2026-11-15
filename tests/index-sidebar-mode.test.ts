import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_COLOR_SETTINGS } from "../src/core/colors.ts";
import {
  DEFAULT_SIDEBAR_PANEL_LAYOUT,
  DEFAULT_ZONES,
  type PiStatusConfig,
} from "../src/shared/types.ts";
import { buildPiWithHandlers, createContext, getRegisteredCommand } from "./helpers.ts";

/** Untrusted keeps Workspace Pulse from running real Git against the fake cwd. */
const ctxFor = (overrides: Parameters<typeof createContext>[0] = {}) =>
  createContext({ isProjectTrusted: () => false, ...overrides });

function config(overrides: Partial<PiStatusConfig> = {}): PiStatusConfig {
  return {
    statusbarEnabled: true,
    sidebarEnabled: true,
    sidebarMode: "manual",
    sidebarWidth: 44,
    zones: structuredClone(DEFAULT_ZONES),
    extensionSegments: { hidden: [] },
    extensionStatusZone: "bottomRight",
    completionNotifications: false,
    sidebarPanelLayout: DEFAULT_SIDEBAR_PANEL_LAYOUT.map((panel) => ({
      ...panel,
      segments: [...panel.segments],
    })),
    sidebarHiddenSegments: [],
    colors: structuredClone(DEFAULT_COLOR_SETTINGS),
    ...overrides,
  };
}

type ControllerOptions = {
  sidebarMode?: string;
  sidebarWidth?: number;
  onResizeCommit?(width: number): void;
};

async function setup(initial: PiStatusConfig) {
  let current = initial;
  const loadConfig = vi.fn(() => structuredClone(current));
  const saveConfig = vi.fn();
  vi.doMock("../src/core/config.ts", () => ({
    loadConfig,
    saveConfig,
    normalizeSidebarPanelLayout: vi.fn((value) => value),
  }));
  const controllers: Array<{ options: ControllerOptions; controller: Record<string, unknown> }> =
    [];
  vi.doMock("../src/tui/sidebar.ts", () => ({
    createSidebarController: vi.fn((options: ControllerOptions) => {
      const controller = {
        show: vi.fn(),
        setShown: vi.fn(),
        setMode: vi.fn(),
        beginResize: vi.fn(() => true),
        requestRender: vi.fn(),
        syncLayout: vi.fn(),
        dispose: vi.fn(),
        getEffectiveWidth: vi.fn(() => 0),
        isShown: vi.fn(() => true),
        isSupported: vi.fn(() => true),
        isEffectivelyVisible: vi.fn(() => true),
      };
      controllers.push({ options, controller });
      return controller;
    }),
  }));
  const dashboards: Array<{
    config: PiStatusConfig;
    sidebarLayout: unknown;
    save(config: PiStatusConfig, layout: unknown): void;
  }> = [];
  vi.doMock("../src/tui/dashboard.ts", () => ({
    openStatusLineDashboard: vi.fn(async (options) => {
      dashboards.push(options);
    }),
  }));
  const { default: createExtension } = await import("../src/index.ts");
  const built = buildPiWithHandlers();
  const shortcuts: Array<{ key: string; handler: (ctx: ExtensionContext) => void }> = [];
  (built.pi as unknown as { registerShortcut: unknown }).registerShortcut = vi.fn(
    (key: string, options: { handler: (ctx: ExtensionContext) => void }) => {
      shortcuts.push({ key, handler: options.handler });
    },
  );
  createExtension(built.pi);
  const start = (ctx: ExtensionContext) => {
    for (const handler of built.handlers.get("session_start") ?? []) handler({}, ctx);
  };
  return {
    ...built,
    shortcuts,
    controllers,
    dashboards,
    loadConfig,
    saveConfig,
    start,
    setFile: (next: PiStatusConfig) => {
      current = next;
    },
  };
}

afterEach(() => {
  vi.doUnmock("../src/core/config.ts");
  vi.doUnmock("../src/tui/sidebar.ts");
  vi.doUnmock("../src/tui/dashboard.ts");
  vi.resetModules();
});

describe("sidebar mode wiring", () => {
  it("passes sidebarMode and sidebarWidth to the controller", async () => {
    const t = await setup(config({ sidebarMode: "auto", sidebarWidth: 52 }));
    t.start(ctxFor());
    expect(t.controllers[0]?.options).toMatchObject({ sidebarMode: "auto", sidebarWidth: 52 });
  });

  it("registers no shortcut besides ctrl+shift+r", async () => {
    const t = await setup(config());
    t.start(ctxFor());
    expect(t.shortcuts.map(({ key }) => key)).toEqual(["ctrl+shift+r"]);
  });

  it("shows an info notice and does not begin a resize in auto mode", async () => {
    const t = await setup(config({ sidebarMode: "auto" }));
    const ctx = ctxFor();
    t.start(ctx);
    t.shortcuts[0]?.handler(ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("auto"), "info");
    expect(t.controllers[0]?.controller.beginResize).not.toHaveBeenCalled();
  });

  it("still begins a resize in manual mode", async () => {
    const t = await setup(config());
    const ctx = ctxFor();
    t.start(ctx);
    t.shortcuts[0]?.handler(ctx);
    expect(t.controllers[0]?.controller.beginResize).toHaveBeenCalledOnce();
  });

  it("applies a saved sidebarMode change without reload", async () => {
    const t = await setup(config());
    const ctx = ctxFor();
    t.start(ctx);
    await getRegisteredCommand(t.registerCommandCalls, "statusline").handler("", ctx);
    const dashboard = t.dashboards[0];
    if (!dashboard) throw new Error("expected dashboard");
    dashboard.save({ ...dashboard.config, sidebarMode: "auto" }, dashboard.sidebarLayout);
    expect(t.controllers[0]?.controller.setMode).toHaveBeenLastCalledWith("auto");
  });

  it("re-syncs the sidebar layout after a /statusline save", async () => {
    const t = await setup(config());
    const ctx = ctxFor();
    t.start(ctx);
    await getRegisteredCommand(t.registerCommandCalls, "statusline").handler("", ctx);
    const dashboard = t.dashboards[0];
    if (!dashboard) throw new Error("expected dashboard");
    expect(t.controllers[0]?.controller.syncLayout).not.toHaveBeenCalled();
    dashboard.save({ ...dashboard.config }, dashboard.sidebarLayout);
    expect(t.controllers[0]?.controller.syncLayout).toHaveBeenCalledOnce();
  });
});

describe("sidebar width persistence", () => {
  it("writes a one-key patch of the current file and updates the runtime width", async () => {
    const t = await setup(config());
    t.start(ctxFor());
    t.setFile(config({ completionNotifications: true }));
    t.controllers[0]?.options.onResizeCommit?.(50);
    expect(t.saveConfig).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ sidebarWidth: 50, completionNotifications: true }),
    );
    t.controllers[0]?.options.onResizeCommit?.(50);
    expect(t.saveConfig).toHaveBeenCalledOnce();
  });

  it("does not write when the width equals the saved width", async () => {
    const t = await setup(config({ sidebarWidth: 50 }));
    t.start(ctxFor());
    t.controllers[0]?.options.onResizeCommit?.(50);
    expect(t.saveConfig).not.toHaveBeenCalled();
  });

  it("warns when persisting the width fails", async () => {
    const t = await setup(config());
    const ctx = ctxFor();
    t.start(ctx);
    t.saveConfig.mockImplementation(() => {
      throw new Error("disk full");
    });
    t.controllers[0]?.options.onResizeCommit?.(50);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Could not save sidebar width: disk full"),
      "warning",
    );
  });

  it("ignores a commit from a stale session", async () => {
    const t = await setup(config());
    t.start(ctxFor());
    t.start(ctxFor({ sessionManager: { ...ctxFor().sessionManager } as never }));
    t.controllers[0]?.options.onResizeCommit?.(50);
    expect(t.saveConfig.mock.calls.length).toBe(0);
    t.controllers[1]?.options.onResizeCommit?.(50);
    expect(t.saveConfig.mock.calls.length).toBe(1);
  });
});
