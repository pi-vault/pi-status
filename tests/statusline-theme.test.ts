import { describe, expect, it } from "vitest";
import { fromPiTheme, noTheme } from "../src/ui/statusline-theme.ts";

function makeSpyTheme() {
  return {
    fg: vi_fn((color: string, text: string) => `[fg:${color}:${text}]`),
    bold: vi_fn((text: string) => `[bold:${text}]`),
  };
}

function vi_fn<T extends (...args: never[]) => unknown>(impl: T) {
  const calls: Array<Parameters<T>> = [];
  const fn = ((...args: Parameters<T>) => {
    calls.push(args);
    return impl(...args);
  }) as T & { calls: Array<Parameters<T>> };
  fn.calls = calls;
  return fn;
}

describe("noTheme", () => {
  it("returns the original text from fg", () => {
    expect(noTheme.fg("accent", "hello")).toBe("hello");
    expect(noTheme.fg("dim", "world")).toBe("world");
  });

  it("returns the original text from bold", () => {
    expect(noTheme.bold("strong")).toBe("strong");
  });

  it("returns the original text from dim", () => {
    expect(noTheme.dim("faint")).toBe("faint");
  });
});

describe("fromPiTheme", () => {
  it("delegates fg calls to the live Pi theme", () => {
    const theme = makeSpyTheme();
    const adapted = fromPiTheme(theme);

    const result = adapted.fg("accent", "title");

    expect(result).toBe("[fg:accent:title]");
    expect(theme.fg.calls).toEqual([["accent", "title"]]);
  });

  it("delegates bold calls to the live Pi theme", () => {
    const theme = makeSpyTheme();
    const adapted = fromPiTheme(theme);

    const result = adapted.bold("title");

    expect(result).toBe("[bold:title]");
    expect(theme.bold.calls).toEqual([["title"]]);
  });

  it("implements dim as fg('dim', text) because Pi's dim is a color role", () => {
    const theme = makeSpyTheme();
    const adapted = fromPiTheme(theme);

    const result = adapted.dim("faint");

    expect(result).toBe("[fg:dim:faint]");
    expect(theme.fg.calls).toEqual([["dim", "faint"]]);
  });

  it("forwards unknown color roles to the live Pi theme fg", () => {
    const theme = makeSpyTheme();
    const adapted = fromPiTheme(theme);

    adapted.fg("borderMuted", "rule");
    adapted.fg("success", "ok");
    adapted.fg("warning", "warn");
    adapted.fg("error", "fail");

    expect(theme.fg.calls.map(([color]) => color)).toEqual([
      "borderMuted",
      "success",
      "warning",
      "error",
    ]);
  });

  it("returns noTheme when fg is not a function", () => {
    const adapted = fromPiTheme({ bold: (text: string) => text });
    expect(adapted).toBe(noTheme);
  });

  it("returns noTheme when bold is not a function", () => {
    const adapted = fromPiTheme({ fg: (_color: string, text: string) => text });
    expect(adapted).toBe(noTheme);
  });

  it("returns noTheme for null or non-object input", () => {
    expect(fromPiTheme(null)).toBe(noTheme);
    expect(fromPiTheme(undefined)).toBe(noTheme);
    expect(fromPiTheme("theme")).toBe(noTheme);
    expect(fromPiTheme(42)).toBe(noTheme);
  });

  it("captures the live theme by reference so the next render sees updates", () => {
    const theme = makeSpyTheme();
    const adapted = fromPiTheme(theme);

    adapted.fg("accent", "first");
    theme.fg = vi_fn((_color: string, text: string) => `[NEW:${text}]`);
    const second = adapted.fg("accent", "second");

    expect(second).toBe("[NEW:second]");
  });
});
