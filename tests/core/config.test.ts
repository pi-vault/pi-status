import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadConfig,
  normalizeExtensionSegments,
  normalizeSegments,
  saveConfigToSettings,
} from "../../src/core/config.ts";
import { DEFAULT_SEGMENTS } from "../../src/shared/types.ts";

describe("config", () => {
  it("normalizes segments and extension segments", () => {
    expect(
      normalizeSegments([
        "model",
        "model",
        "unknown",
        1,
        "current-dir",
        "git-branch",
        "project-name",
      ]),
    ).toEqual(["model", "current-dir", "git-branch", "project-name"]);

    expect(normalizeExtensionSegments(undefined)).toEqual({
      hidden: [],
    });
    expect(
      normalizeExtensionSegments({ hidden: ["a", "a", "", 1] }),
    ).toEqual({
      hidden: ["a"],
    });
  });

  it("loads precedence: settings > default", () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-status-"));
    const globalHome = join(dir, "home");
    const project = join(dir, "project");
    const globalSettings = join(globalHome, ".pi/agent/settings.json");
    const projectSettings = join(project, ".pi/settings.json");

    mkdirSync(join(project, ".pi"), { recursive: true });
    mkdirSync(join(globalHome, ".pi/agent"), { recursive: true });
    writeFileSync(
      globalSettings,
      JSON.stringify({ statusLine: { segments: ["git-branch"] } }),
      "utf8",
    );
    writeFileSync(
      projectSettings,
      JSON.stringify({
        statusLine: { extensionSegments: { hidden: ["x"] } },
      }),
      "utf8",
    );

    const oldHome = process.env.HOME;
    process.env.HOME = globalHome;
    try {
      const viaSettings = loadConfig({ cwd: project });
      expect(viaSettings.source).toBe("settings");
      expect(viaSettings.config.segments).toEqual(["git-branch"]);
      expect(viaSettings.config.extensionSegments).toEqual({
        hidden: ["x"],
      });

      writeFileSync(projectSettings, "{ bad", "utf8");
      writeFileSync(globalSettings, "{ bad", "utf8");
      const viaDefault = loadConfig({ cwd: project });
      expect(viaDefault.source).toBe("default");
      expect(viaDefault.config.segments).toEqual(DEFAULT_SEGMENTS);
    } finally {
      process.env.HOME = oldHome;
    }
  });

  it("saves into project when project has statusLine, else global", () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-status-"));
    const globalHome = join(dir, "home");
    const project = join(dir, "project");
    const globalSettings = join(globalHome, ".pi/agent/settings.json");
    const projectSettings = join(project, ".pi/settings.json");

    mkdirSync(join(project, ".pi"), { recursive: true });
    mkdirSync(join(globalHome, ".pi/agent"), { recursive: true });
    writeFileSync(
      projectSettings,
      JSON.stringify({ statusLine: { segments: ["model"] }, x: 1 }),
      "utf8",
    );

    const oldHome = process.env.HOME;
    process.env.HOME = globalHome;
    try {
      const first = saveConfigToSettings(
        {
          segments: ["current-dir"],
          extensionSegments: { hidden: [] },
        },
        { cwd: project },
      );
      expect(first.target).toBe("project");
      const projectParsed = JSON.parse(readFileSync(projectSettings, "utf8"));
      expect(projectParsed.x).toBe(1);
      expect(projectParsed.statusLine.segments).toEqual(["current-dir"]);
      expect(projectParsed.statusLine.extensionSegments).toEqual({
        hidden: [],
      });

      writeFileSync(projectSettings, JSON.stringify({ y: 2 }), "utf8");
      const second = saveConfigToSettings(
        {
          segments: ["model"],
          extensionSegments: { hidden: ["a"] },
        },
        { cwd: project },
      );
      expect(second.target).toBe("global");
      const globalParsed = JSON.parse(readFileSync(globalSettings, "utf8"));
      expect(globalParsed.statusLine.extensionSegments).toEqual({
        hidden: ["a"],
      });
    } finally {
      process.env.HOME = oldHome;
    }
  });

  it("refuses to fall through to global when project settings are malformed", () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-status-"));
    const globalHome = join(dir, "home");
    const project = join(dir, "project");
    const projectSettings = join(project, ".pi/settings.json");

    mkdirSync(join(project, ".pi"), { recursive: true });
    mkdirSync(join(globalHome, ".pi/agent"), { recursive: true });
    writeFileSync(projectSettings, "{ bad", "utf8");

    const oldHome = process.env.HOME;
    process.env.HOME = globalHome;
    try {
      expect(() =>
        saveConfigToSettings(
          {
            segments: ["model"],
            extensionSegments: { hidden: [] },
          },
          { cwd: project },
        ),
      ).toThrow(/project settings are malformed/i);
    } finally {
      process.env.HOME = oldHome;
    }
  });
});
