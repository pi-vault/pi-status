import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { loadConfig, saveConfigToSettings } from "./core/config.ts";
import { buildSnapshot } from "./core/resolve-footer.ts";
import { createUsageRuntime } from "./core/usage-runtime.ts";
import type { PiStatusConfig } from "./shared/types.ts";
import { createStatusLineEditor } from "./tui/editor.ts";
import { buildFooterLine } from "./tui/render.ts";
import { fromPiTheme, noTheme, type StatusLineTheme } from "./tui/theme.ts";

type FooterComponent = {
  render: (width: number) => string[];
  invalidate: () => void;
  dispose?: () => void;
};

type FooterDataLike = {
  getGitBranch: () => string | null;
  getExtensionStatuses: () => ReadonlyMap<string, string>;
  onBranchChange?: (listener: () => void) => (() => void) | undefined;
};

type FooterFactory = (
  tui: { requestRender?: () => void },
  theme: { fg: (color: string, text: string) => string },
  footerData: FooterDataLike,
) => FooterComponent;

type RuntimeState = {
  config: PiStatusConfig;
  ctx: ExtensionContext | undefined;
  requestRender: (() => void) | undefined;
  gitBranch: string | null;
  extensionStatuses: Map<string, string>;
};

function createRuntimeState(): RuntimeState {
  return {
    config: loadConfig().config,
    ctx: undefined,
    requestRender: undefined,
    gitBranch: null,
    extensionStatuses: new Map(),
  };
}

const EMPTY_FOOTER_FACTORY: FooterFactory = () => ({
  render(): string[] {
    return [];
  },
  invalidate(): void {},
  dispose(): void {},
});

function isLiveTheme(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { fg?: unknown; bold?: unknown };
  return (
    typeof candidate.fg === "function" && typeof candidate.bold === "function"
  );
}

export default function createExtension(pi: ExtensionAPI): void {
  const state = createRuntimeState();

  const usageRuntime = createUsageRuntime(pi);

  function refreshRuntimeConfig(cwd?: string): void {
    state.config = loadConfig(cwd ? { cwd } : undefined).config;
  }

  function installFooter(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;

    const factory: FooterFactory = (tui, theme, footerData) => {
      state.requestRender = () => tui.requestRender?.();
      usageRuntime.setOnChange(state.requestRender);
      const unsubscribe = footerData.onBranchChange?.(() =>
        tui.requestRender?.(),
      );

      return {
        dispose() {
          unsubscribe?.();
          if (state.requestRender === tui.requestRender)
            state.requestRender = undefined;
          usageRuntime.setOnChange(state.requestRender);
        },
        invalidate() {
          state.requestRender?.();
        },
        render(width: number) {
          const activeCtx = state.ctx ?? ctx;
          state.gitBranch = footerData.getGitBranch();
          state.extensionStatuses = new Map(
            footerData.getExtensionStatuses().entries(),
          );
          const snapshot = buildSnapshot({
            model: activeCtx.model,
            cwd: activeCtx.cwd,
            thinkingLevel: String(pi.getThinkingLevel()),
            gitBranch: state.gitBranch,
            isIdle: activeCtx.isIdle(),
            hasPendingMessages: activeCtx.hasPendingMessages(),
            contextUsage: activeCtx.getContextUsage(),
            branch: activeCtx.sessionManager.getBranch() as unknown[],
            sessionId: activeCtx.sessionManager.getSessionId(),
            usageState: usageRuntime.getState(),
            extensionStatuses: state.extensionStatuses,
          });
          const line = buildFooterLine(
            {
              ...snapshot,
              extensionSegments: state.config.extensionSegments,
              segments: state.config.segments,
            },
            fromPiTheme(theme),
            width,
          );
          return [line];
        },
      };
    };

    ctx.ui.setFooter(factory as never);
  }

  function installEmptyFooter(ctx: ExtensionContext): void {
    if (ctx.hasUI) ctx.ui.setFooter(EMPTY_FOOTER_FACTORY as never);
  }

  function refresh(ctx: ExtensionContext): void {
    state.ctx = ctx;
    refreshRuntimeConfig(ctx.cwd);
    state.requestRender?.();
  }

  pi.registerCommand("statusline", {
    description: "Configure statusline segments and extension-status visibility",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("/statusline requires interactive UI", "warning");
        return;
      }

      const discovered = [...state.extensionStatuses.keys()].sort((a, b) =>
        a.localeCompare(b),
      );

      let result: PiStatusConfig | null = null;
      try {
        installEmptyFooter(ctx);
        result = await ctx.ui.custom<PiStatusConfig | null>(
          (tui, theme, _keys, done) => {
            const activeCtx = state.ctx ?? ctx;
            const menuTheme: StatusLineTheme = isLiveTheme(theme)
              ? fromPiTheme(theme)
              : noTheme;
            const snapshot = buildSnapshot({
              model: activeCtx.model,
              cwd: activeCtx.cwd,
              thinkingLevel: String(pi.getThinkingLevel()),
              gitBranch: state.gitBranch,
              isIdle: activeCtx.isIdle(),
              hasPendingMessages: activeCtx.hasPendingMessages(),
              contextUsage: activeCtx.getContextUsage(),
              branch: activeCtx.sessionManager.getBranch() as unknown[],
              sessionId: activeCtx.sessionManager.getSessionId(),
              usageState: usageRuntime.getState(),
              extensionStatuses: state.extensionStatuses,
            });
            return createStatusLineEditor({
              config: state.config,
              discoveredStatuses: discovered,
              previewInput: snapshot,
              theme: menuTheme,
              done,
              requestRender: () => tui.requestRender?.(),
              usageAvailable: usageRuntime.getAvailable(),
            });
          },
        );
      } finally {
        installFooter(ctx);
      }

      if (!result) return;

      try {
        saveConfigToSettings(result, { cwd: ctx.cwd });
        state.config = result;
        state.requestRender?.();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to save statusline settings";
        ctx.ui.notify(message, "warning");
      }
    },
  });

  pi.on("session_start", (_event, ctx) => {
    usageRuntime.requestCurrent();
    refreshRuntimeConfig(ctx.cwd);
    state.ctx = ctx;
    installFooter(ctx);
  });

  pi.on("session_tree", (_event, ctx) => {
    refreshRuntimeConfig(ctx.cwd);
    state.ctx = ctx;
    installFooter(ctx);
  });

  pi.on("model_select", (_event, ctx) => {
    refresh(ctx);
  });

  pi.on("thinking_level_select", (_event, ctx) => {
    refresh(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    state.ctx = undefined;
    state.requestRender = undefined;
    usageRuntime.setOnChange(undefined);
    if (ctx.hasUI) ctx.ui.setFooter(undefined);
  });
}
