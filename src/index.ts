import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  USAGE_CORE_READY_EVENT,
  USAGE_CORE_REQUEST_EVENT,
  USAGE_CORE_UPDATE_CURRENT_EVENT,
} from "@pi-vault/pi-usage/events";
import type { UsageCoreState } from "@pi-vault/pi-usage/types";
import { loadConfig, type PiStatusConfig } from "./config.ts";
import { buildFooterLine } from "./render.ts";

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

function aggregateBranchTotals(ctx: ExtensionContext): { input: number; output: number; totalTokens: number } {
  const totals = { input: 0, output: 0, totalTokens: 0 };
  const branch = ctx.sessionManager.getBranch() as unknown[];

  for (const entry of branch ?? []) {
    if (!entry || typeof entry !== "object") continue;
    const type = (entry as { type?: unknown }).type;
    if (type !== "message") continue;
    const message = (entry as {
      message?: { role?: unknown; usage?: { input?: number; output?: number; totalTokens?: number } };
    }).message;
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
  const config: PiStatusConfig = loadConfig();
  let currentCtx: ExtensionContext | undefined;
  let requestRender: (() => void) | undefined;
  let usageState: UsageCoreState | undefined;

  function acceptUsageState(payload: unknown): void {
    if (!payload || typeof payload !== "object") return;
    const maybe = payload as { state?: unknown };
    const next = maybe.state && typeof maybe.state === "object" ? maybe.state : payload;
    usageState = next as UsageCoreState;
    requestRender?.();
  }

  function installFooter(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;

    const factory: FooterFactory = (tui, theme, footerData) => {
      requestRender = () => tui.requestRender?.();
      const unsubscribe = footerData.onBranchChange?.(() => tui.requestRender?.());

      return {
        dispose() {
          unsubscribe?.();
          if (requestRender === tui.requestRender) {
            requestRender = undefined;
          }
        },
        invalidate() {
          requestRender?.();
        },
        render(width: number) {
          const activeCtx = currentCtx ?? ctx;
          const line = buildFooterLine(
            {
              model: activeCtx.model,
              cwd: activeCtx.cwd,
              thinkingLevel: String(pi.getThinkingLevel()),
              gitBranch: footerData.getGitBranch(),
              runState: !activeCtx.isIdle() ? "busy" : activeCtx.hasPendingMessages() ? "queued" : "idle",
              contextUsage: activeCtx.getContextUsage(),
              branchTotals: aggregateBranchTotals(activeCtx),
              sessionId: activeCtx.sessionManager.getSessionId(),
              usageState,
              extensionStatuses: footerData.getExtensionStatuses(),
              statusFilter: config.statusFilter,
              segments: config.segments,
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

  function refresh(ctx: ExtensionContext): void {
    currentCtx = ctx;
    requestRender?.();
  }

  const unsubscribeUsageReady = pi.events.on(USAGE_CORE_READY_EVENT, (payload: unknown) => {
    acceptUsageState(payload);
  });

  const unsubscribeUsageUpdate = pi.events.on(USAGE_CORE_UPDATE_CURRENT_EVENT, (payload: unknown) => {
    acceptUsageState(payload);
  });

  pi.events.emit(USAGE_CORE_REQUEST_EVENT, {
    type: "current",
    reply(payload: unknown) {
      acceptUsageState(payload);
    },
  });

  pi.on("session_start", (_event, ctx) => {
    currentCtx = ctx;
    installFooter(ctx);
  });

  pi.on("session_tree", (_event, ctx) => {
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
    unsubscribeUsageReady();
    unsubscribeUsageUpdate();
    if (ctx.hasUI) ctx.ui.setFooter(undefined);
  });
}
