import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DEFAULT_SEGMENTS, type FooterRenderInput } from "../src/tui/render.ts";

export function withDefaults(
  input: Omit<FooterRenderInput, "extensionSegments" | "segments"> & {
    segments?: FooterRenderInput["segments"];
  },
): FooterRenderInput {
  return {
    ...input,
    segments: input.segments ?? [...DEFAULT_SEGMENTS],
    extensionSegments: { hidden: [] },
  };
}

export function createContext(
  overrides?: Partial<ExtensionContext>,
): ExtensionContext {
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

export function createBus() {
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

export function buildPiWithHandlers() {
  const handlers = new Map<
    string,
    Array<(event: unknown, ctx: ExtensionContext) => void>
  >();
  const events = createBus();
  const registerCommand = {
    calls: [] as unknown[][],
    fn(name: string, definition: unknown) {
      this.calls.push([name, definition]);
    },
  };
  const pi = {
    events,
    on(event: string, handler: (event: unknown, ctx: ExtensionContext) => void) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerCommand: registerCommand.fn.bind(registerCommand),
    getThinkingLevel: () => "medium",
  } as unknown as ExtensionAPI;
  return { pi, handlers, registerCommandCalls: registerCommand.calls };
}

export function buildSetFooterSpy() {
  const calls: unknown[] = [];
  const setFooter = (factory: unknown) => {
    calls.push(factory);
  };
  return { calls, setFooter };
}

export function renderWithFactory(
  factory: unknown,
  options: { gitBranch?: string | null; width?: number } = {},
): string {
  if (typeof factory !== "function") return "";
  const component = (
    factory as (
      tui: unknown,
      theme: unknown,
      footerData: unknown,
    ) => { render: (width: number) => string[] }
  )(
    { requestRender: () => {} },
    { fg: (_c: string, t: string) => t },
    {
      getGitBranch: () => options.gitBranch ?? null,
      getExtensionStatuses: () => new Map(),
    },
  );
  return component.render(options.width ?? 200).join("\n");
}
