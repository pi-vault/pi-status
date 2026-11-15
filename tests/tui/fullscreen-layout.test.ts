import { stripTerminalSequences } from "@earendil-works/pi-tui";
import type { Component, TUI, ViewportTUI } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import { createFullscreenSidebarLayout, isFullscreenTui } from "../../src/tui/fullscreen-layout.ts";

const VIEWPORT = Symbol.for("@earendil-works/pi-tui/viewport");

const label = (name: string): Component => ({
  render: (w: number) => [`${name}:${w}`],
  invalidate() {},
});

function fullscreenStub(root: Component | undefined = label("main")) {
  const tui = {
    mode: "fullscreen",
    [VIEWPORT]: true,
    layoutRoot: root,
    setLayoutRoot: vi.fn(function (this: { layoutRoot?: Component }, c: Component | undefined) {
      this.layoutRoot = c;
    }),
    terminal: { columns: 160, rows: 40, write: vi.fn() },
    requestRender: vi.fn(),
  };
  return tui as typeof tui & ViewportTUI;
}

function setup(tui = fullscreenStub(), visible = true) {
  const state = { width: 44, visible };
  const make = (target: ViewportTUI = tui) =>
    createFullscreenSidebarLayout({
      tui: target,
      sidebar: label("side"),
      getSidebarWidth: () => state.width,
      isSidebarVisible: () => state.visible,
      minMainWidth: 64,
      minSidebarWidth: 28,
      maxSidebarWidth: 72,
    });
  return { tui, state, make, layout: make() };
}

const rootOf = (tui: object) => (tui as { layoutRoot?: Component }).layoutRoot as Component;

describe("fullscreen layout adapter", () => {
  it("detects fullscreen only for viewport TUIs in fullscreen mode", () => {
    expect(isFullscreenTui(undefined)).toBe(false);
    expect(isFullscreenTui({ mode: "regular" } as unknown as TUI)).toBe(false);
    expect(isFullscreenTui({ mode: "regular", [VIEWPORT]: true } as unknown as TUI)).toBe(false);
    expect(isFullscreenTui({ mode: "fullscreen" } as unknown as TUI)).toBe(false);
    expect(isFullscreenTui(fullscreenStub())).toBe(true);
  });

  it("wraps the current root in an HStack", () => {
    const { tui, layout } = setup();
    const main = rootOf(tui);
    expect(layout.install()).toBe(true);
    expect(rootOf(tui)).not.toBe(main);
    expect(layout.isInstalled()).toBe(true);
    expect(tui.requestRender).toHaveBeenCalled();
    const line = rootOf(tui).render(160)[0];
    expect(line).toContain("main:116");
    expect(line).toContain("side:44");
  });

  it("restores the original root", () => {
    const { tui, layout } = setup();
    const main = rootOf(tui);
    layout.install();
    layout.restore();
    expect(rootOf(tui)).toBe(main);
    expect(layout.isInstalled()).toBe(false);
  });

  it("does not restore when someone else replaced the root", () => {
    const { tui, layout } = setup();
    layout.install();
    const other = label("other");
    tui.layoutRoot = other;
    layout.restore();
    expect(rootOf(tui)).toBe(other);
  });

  it("does not stack on a second install with the same width", () => {
    const { tui, layout } = setup();
    layout.install();
    const first = rootOf(tui);
    expect(layout.install()).toBe(true);
    expect(rootOf(tui)).toBe(first);
  });

  it("refresh rebuilds with the new width but keeps the original root", () => {
    const { tui, state, layout } = setup();
    const main = rootOf(tui);
    layout.install();
    state.width = 50;
    layout.refresh();
    expect(rootOf(tui).render(160)[0]).toContain("side:50");
    layout.restore();
    expect(rootOf(tui)).toBe(main);
  });

  it("refresh is a no-op when the width is unchanged", () => {
    const { tui, layout } = setup();
    layout.install();
    const first = rootOf(tui);
    layout.refresh();
    expect(rootOf(tui)).toBe(first);
  });

  it("refresh never wraps a replaced root", () => {
    const { tui, state, layout } = setup();
    layout.install();
    const other = label("other");
    tui.layoutRoot = other;
    state.width = 50;
    layout.refresh();
    expect(rootOf(tui)).toBe(other);
  });

  it("install wraps a replaced root", () => {
    const { tui, layout } = setup();
    layout.install();
    const other = label("other");
    tui.layoutRoot = other;
    expect(layout.install()).toBe(true);
    expect(rootOf(tui).render(160)[0]).toContain("other:116");
    layout.restore();
    expect(rootOf(tui)).toBe(other);
  });

  it("refuses to wrap a root owned by another live instance", () => {
    const { tui, make, layout: a } = setup();
    a.install();
    const owned = rootOf(tui);
    const b = make();
    expect(b.install()).toBe(false);
    expect(rootOf(tui)).toBe(owned);
    b.restore();
    expect(rootOf(tui)).toBe(owned);
  });

  it("lets a new instance wrap after the previous one restored", () => {
    const { tui, make, layout: a } = setup();
    const main = rootOf(tui);
    a.install();
    a.restore();
    const b = make();
    expect(b.install()).toBe(true);
    expect(rootOf(tui).render(160)[0]).toContain("main:116");
    b.restore();
    expect(rootOf(tui)).toBe(main);
  });

  it("returns false without a root", () => {
    const tui = fullscreenStub();
    tui.layoutRoot = undefined as never;
    const { layout } = setup(tui);
    expect(layout.install()).toBe(false);
    expect(tui.setLayoutRoot).not.toHaveBeenCalled();
  });

  it("hides the sidebar entry when isSidebarVisible is false", () => {
    const { tui, layout } = setup(fullscreenStub(), false);
    layout.install();
    const lines = rootOf(tui)
      .render(160)
      .map((line) => stripTerminalSequences(line).trim());
    expect(lines).toEqual(["main:160"]);
  });
});
