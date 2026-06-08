import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  loadConfig,
  saveConfigToSettings,
} from "./core/config.ts";
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
  return typeof candidate.fg === "function" && typeof candidate.bold === "function";
}

function aggregateBranchTotals(ctx: ExtensionContext): {
  input: number;
  output: number;
  totalTokens: number;
} {
  const totals = { input: 0, output: 0, totalTokens: 0 };
  const branch = ctx.sessionManager.getBranch() as unknown[];

  for (const entry of branch ?? []) {
    if (!entry || typeof entry !== "object") continue;
    if ((entry as { type?: unknown }).type !== "message") continue;
    const message = (
      entry as {
        message?: {
          role?: unknown;
          usage?: { input?: number; output?: number; totalTokens?: number };
        };
      }
    ).message;
    if (message?.role !== "assistant") continue;
    const usage = message.usage;
    if (!usage) continue;
    if (typeof usage.input === "number") totals.input += usage.input;
    if (typeof usage.output === "number") totals.output += usage.output;
    if (typeof usage.totalTokens === "number") totals.totalTokens += usage.totalTokens;
  }

  return totals;
}

export default function createExtension(pi: ExtensionAPI): void {
  let runtimeConfig: PiStatusConfig = loadConfig().config;
  let currentCtx: ExtensionContext | undefined;
  let requestRender: (() => void) | undefined;
  let lastGitBranch: string | null = null;
  let lastExtensionStatuses = new Map<string, string>();

  const usageRuntime = createUsageRuntime(pi);

  function refreshRuntimeConfig(cwd?: string): void {
    runtimeConfig = loadConfig(cwd ? { cwd } : undefined).config;
  }

  function installFooter(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;

    const factory: FooterFactory = (tui, theme, footerData) => {
      requestRender = () => tui.requestRender?.();
      usageRuntime.setOnChange(requestRender);
      const unsubscribe = footerData.onBranchChange?.(() => tui.requestRender?.());

      return {
        dispose() {
          unsubscribe?.();
          if (requestRender === tui.requestRender) requestRender = undefined;
          usageRuntime.setOnChange(requestRender);
        },
        invalidate() {
          requestRender?.();
        },
        render(width: number) {
          const activeCtx = currentCtx ?? ctx;
          lastGitBranch = footerData.getGitBranch();
          lastExtensionStatuses = new Map(footerData.getExtensionStatuses().entries());
          const line = buildFooterLine(
            {
              model: activeCtx.model,
              cwd: activeCtx.cwd,
              thinkingLevel: String(pi.getThinkingLevel()),
              gitBranch: lastGitBranch,
              runState: !activeCtx.isIdle()
                ? "busy"
                : activeCtx.hasPendingMessages()
                  ? "queued"
                  : "idle",
              contextUsage: activeCtx.getContextUsage(),
              branchTotals: aggregateBranchTotals(activeCtx),
              sessionId: activeCtx.sessionManager.getSessionId(),
              usageState: usageRuntime.getState(),
              extensionStatuses: lastExtensionStatuses,
              filter: runtimeConfig.filter,
              segments: runtimeConfig.segments,
            },
            theme,
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
    currentCtx = ctx;
    refreshRuntimeConfig(ctx.cwd);
    requestRender?.();
  }

  pi.registerCommand("statusline", {
    description: "Configure statusline segments and extension-status filters",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("/statusline requires interactive UI", "warning");
        return;
      }

      const discovered = [...lastExtensionStatuses.keys()].sort((a, b) => a.localeCompare(b));

      let result: PiStatusConfig | null = null;
      try {
        installEmptyFooter(ctx);
        result = await ctx.ui.custom<PiStatusConfig | null>((tui, theme, _keys, done) => {
          const activeCtx = currentCtx ?? ctx;
          const menuTheme: StatusLineTheme = isLiveTheme(theme) ? fromPiTheme(theme) : noTheme;
          return createStatusLineEditor({
            config: runtimeConfig,
            discoveredStatuses: discovered,
            previewInput: {
              model: activeCtx.model,
              cwd: activeCtx.cwd,
              thinkingLevel: String(pi.getThinkingLevel()),
              gitBranch: lastGitBranch,
              runState: !activeCtx.isIdle()
                ? "busy"
                : activeCtx.hasPendingMessages()
                  ? "queued"
                  : "idle",
              contextUsage: activeCtx.getContextUsage(),
              branchTotals: aggregateBranchTotals(activeCtx),
              sessionId: activeCtx.sessionManager.getSessionId(),
              usageState: usageRuntime.getState(),
              extensionStatuses: lastExtensionStatuses,
            },
            theme: menuTheme,
            done,
            requestRender: () => tui.requestRender?.(),
            usageAvailable: usageRuntime.getAvailable(),
          });
        });
      } finally {
        installFooter(ctx);
      }

      if (!result) return;

      try {
        saveConfigToSettings(result, { cwd: ctx.cwd });
        runtimeConfig = result;
        requestRender?.();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to save statusline settings";
        ctx.ui.notify(message, "warning");
      }
    },
  });

  pi.on("session_start", (_event, ctx) => {
    usageRuntime.requestCurrent();
    refreshRuntimeConfig(ctx.cwd);
    currentCtx = ctx;
    installFooter(ctx);
  });

  pi.on("session_tree", (_event, ctx) => {
    refreshRuntimeConfig(ctx.cwd);
    currentCtx = ctx;
    installFooter(ctx);
  });

  pi.on("model_select", (_event, ctx) => {
    refresh(ctx);
  });

  pi.on("thinking_level_select", (_event, ctx) => {
    refresh(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    currentCtx = undefined;
    requestRender = undefined;
    usageRuntime.setOnChange(undefined);
    if (ctx.hasUI) ctx.ui.setFooter(undefined);
  });
}
