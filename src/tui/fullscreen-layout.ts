import { HStack, isViewportTUI } from "@earendil-works/pi-tui";
import type { Component, TUI, ViewportTUI } from "@earendil-works/pi-tui";

const STATE = Symbol.for("@pi-vault/pi-status/fullscreen-layout");

interface LayoutState {
  owner: object;
  originalRoot: Component;
  splitRoot: Component;
  width: number;
}

type StatefulTui = { [STATE]?: LayoutState };

export function isFullscreenTui(tui: TUI | undefined): tui is ViewportTUI {
  return tui !== undefined && isViewportTUI(tui) && tui.mode === "fullscreen";
}

export interface FullscreenSidebarLayoutOptions {
  tui: ViewportTUI;
  sidebar: Component;
  getSidebarWidth(): number;
  isSidebarVisible(viewportWidth: number): boolean;
  minMainWidth: number;
  minSidebarWidth: number;
  maxSidebarWidth: number;
}

export interface FullscreenSidebarLayout {
  /** Wrap the current root. False when there is no root or another live owner holds it. */
  install(): boolean;
  /** Rebuild only when our root is current and the width changed. Never wraps a foreign root. */
  refresh(): void;
  /** Owner-checked. */
  restore(): void;
  isInstalled(): boolean;
}

export function createFullscreenSidebarLayout(
  options: FullscreenSidebarLayoutOptions,
): FullscreenSidebarLayout {
  const { tui } = options;
  const owner = {};
  const holder = tui as unknown as StatefulTui;

  // Non-public field; atelier relies on it too. Re-check on Pi upgrades.
  const currentRoot = (): Component | undefined =>
    (tui as unknown as { layoutRoot?: Component }).layoutRoot;

  const build = (originalRoot: Component, width: number): Component =>
    new HStack([
      { component: originalRoot, basis: 0, grow: 1, shrink: 1, minSize: options.minMainWidth },
      {
        component: options.sidebar,
        basis: width,
        grow: 0,
        shrink: 1,
        minSize: options.minSidebarWidth,
        maxSize: options.maxSidebarWidth,
        visible: ({ width: viewportWidth }) => options.isSidebarVisible(viewportWidth),
      },
    ]);

  const ownState = (): LayoutState | undefined => {
    const state = holder[STATE];
    return state?.owner === owner ? state : undefined;
  };

  const refresh = () => {
    const state = ownState();
    const width = options.getSidebarWidth();
    if (!state || currentRoot() !== state.splitRoot || width === state.width) return;
    const splitRoot = build(state.originalRoot, width);
    state.splitRoot = splitRoot;
    state.width = width;
    tui.setLayoutRoot(splitRoot);
  };

  return {
    install() {
      const existing = holder[STATE];
      const root = currentRoot();
      if (existing && existing.owner !== owner && existing.splitRoot === root) return false;
      const state = ownState();
      if (state && state.splitRoot === root) {
        refresh();
        return true;
      }
      if (!root) return false;
      const width = options.getSidebarWidth();
      const splitRoot = build(root, width);
      holder[STATE] = { owner, originalRoot: root, splitRoot, width };
      tui.setLayoutRoot(splitRoot);
      tui.requestRender();
      return true;
    },
    refresh,
    restore() {
      const state = ownState();
      if (!state) return;
      if (currentRoot() === state.splitRoot) tui.setLayoutRoot(state.originalRoot);
      holder[STATE] = undefined;
    },
    isInstalled() {
      const state = ownState();
      return state !== undefined && currentRoot() === state.splitRoot;
    },
  };
}
