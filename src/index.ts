import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { buildFooterLine } from "./render.ts";

type FooterComponent = {
  render: (width: number) => string[];
  invalidate: () => void;
  dispose?: () => void;
};

type FooterFactory = (
  tui: { requestRender?: () => void },
  theme: { fg: (color: string, text: string) => string },
  footerData: unknown,
) => FooterComponent;

export default function createExtension(pi: ExtensionAPI): void {
  let currentCtx: ExtensionContext | undefined;
  let requestRender: (() => void) | undefined;

  function installFooter(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;

    const factory: FooterFactory = (tui, theme) => {
      requestRender = () => tui.requestRender?.();

      return {
        dispose() {
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
    if (ctx.hasUI) ctx.ui.setFooter(undefined);
  });
}
