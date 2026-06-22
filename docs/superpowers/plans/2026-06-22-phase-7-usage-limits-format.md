# Phase 7: Usage Limits Mixed-Color Format

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change `five-hour-limit` and `weekly-limit` from single-color `"5h 70% left"` to mixed-color format: prefix and suffix dim, percentage colored by threshold.

**Architecture:** Rewrite both segment cases to use the pre-styled mixed-color pattern (`[text, null]` return). Reuses existing `rateColor()` threshold function and existing `"dim"` color in `FooterRenderColor`.

**Tech Stack:** TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-06-22-segment-color-refactor-design.md` (Section 3)

**Verification:** Run `pnpm check` (lint + typecheck + tests) at the end.

**Prerequisite:** Phase 6 committed (context-remaining format).

---

### Task 7.1: Write failing tests for new usage limit format

**Files:**
- Modify: `tests/render.test.ts`

- [ ] **Step 1: Replace the `five-hour-limit` test suite**

Remove the entire `describe("formatSegment — five-hour-limit", ...)` block and replace with:

```ts
describe("formatSegment — five-hour-limit", () => {
  it("formats as mixed-color with dim prefix/suffix and colored percent", () => {
    const result = formatSegment(
      "five-hour-limit",
      segmentInput({
        usageState: {
          compatibility: {
            currentLiveProviderSnapshot: {
              providerId: "anthropic",
              windows: [{ key: "fiveHour", usedPercent: 30 }],
            },
          },
        },
      }),
      identityTheme,
    );
    expect(result).toEqual(["5h 70% left", null]);
  });

  it("applies success color to percent when usage < 70%", () => {
    const result = formatSegment(
      "five-hour-limit",
      segmentInput({
        usageState: {
          compatibility: {
            currentLiveProviderSnapshot: {
              providerId: "anthropic",
              windows: [{ key: "fiveHour", usedPercent: 30 }],
            },
          },
        },
      }),
      markerTheme,
    );
    expect(result?.[0]).toContain("[success:70%]");
    expect(result?.[0]).toContain("[dim:5h ]");
    expect(result?.[0]).toContain("[dim: left]");
    expect(result?.[1]).toBeNull();
  });

  it("applies warning color when usage is 70-89%", () => {
    const result = formatSegment(
      "five-hour-limit",
      segmentInput({
        usageState: {
          compatibility: {
            currentLiveProviderSnapshot: {
              providerId: "anthropic",
              windows: [{ key: "fiveHour", usedPercent: 75 }],
            },
          },
        },
      }),
      markerTheme,
    );
    expect(result?.[0]).toContain("[warning:25%]");
    expect(result?.[1]).toBeNull();
  });

  it("applies error color when usage is 90%+", () => {
    const result = formatSegment(
      "five-hour-limit",
      segmentInput({
        usageState: {
          compatibility: {
            currentLiveProviderSnapshot: {
              providerId: "anthropic",
              windows: [{ key: "fiveHour", usedPercent: 95 }],
            },
          },
        },
      }),
      markerTheme,
    );
    expect(result?.[0]).toContain("[error:5%]");
    expect(result?.[1]).toBeNull();
  });

  it("returns null when no fiveHour window exists", () => {
    const result = formatSegment(
      "five-hour-limit",
      segmentInput({
        usageState: {
          compatibility: {
            currentLiveProviderSnapshot: {
              providerId: "anthropic",
              windows: [{ key: "weekly", usedPercent: 30 }],
            },
          },
        },
      }),
      identityTheme,
    );
    expect(result).toBeNull();
  });

  it("returns null when window has unavailableReason", () => {
    const result = formatSegment(
      "five-hour-limit",
      segmentInput({
        usageState: {
          compatibility: {
            currentLiveProviderSnapshot: {
              providerId: "anthropic",
              windows: [
                {
                  key: "fiveHour",
                  usedPercent: 30,
                  unavailableReason: "disabled",
                },
              ],
            },
          },
        },
      }),
      identityTheme,
    );
    expect(result).toBeNull();
  });

  it("returns null when usageState is undefined", () => {
    const result = formatSegment(
      "five-hour-limit",
      segmentInput(),
      identityTheme,
    );
    expect(result).toBeNull();
  });

  it("returns null when snapshot is null", () => {
    const result = formatSegment(
      "five-hour-limit",
      segmentInput({
        usageState: { compatibility: { currentLiveProviderSnapshot: null } },
      }),
      identityTheme,
    );
    expect(result).toBeNull();
  });

  it("clamps remaining to 0-100 range", () => {
    const result = formatSegment(
      "five-hour-limit",
      segmentInput({
        usageState: {
          compatibility: {
            currentLiveProviderSnapshot: {
              providerId: "anthropic",
              windows: [{ key: "fiveHour", usedPercent: 105 }],
            },
          },
        },
      }),
      identityTheme,
    );
    expect(result).toEqual(["5h 0% left", null]);
  });
});
```

- [ ] **Step 2: Replace the `weekly-limit` test suite**

Remove the entire `describe("formatSegment — weekly-limit", ...)` block and replace with:

```ts
describe("formatSegment — weekly-limit", () => {
  it("formats as mixed-color with dim prefix/suffix and colored percent", () => {
    const result = formatSegment(
      "weekly-limit",
      segmentInput({
        usageState: {
          compatibility: {
            currentLiveProviderSnapshot: {
              providerId: "anthropic",
              windows: [{ key: "weekly", usedPercent: 20 }],
            },
          },
        },
      }),
      identityTheme,
    );
    expect(result).toEqual(["wk 80% left", null]);
  });

  it("applies success color to percent when usage < 70%", () => {
    const result = formatSegment(
      "weekly-limit",
      segmentInput({
        usageState: {
          compatibility: {
            currentLiveProviderSnapshot: {
              providerId: "anthropic",
              windows: [{ key: "weekly", usedPercent: 20 }],
            },
          },
        },
      }),
      markerTheme,
    );
    expect(result?.[0]).toContain("[success:80%]");
    expect(result?.[0]).toContain("[dim:wk ]");
    expect(result?.[0]).toContain("[dim: left]");
    expect(result?.[1]).toBeNull();
  });

  it("returns null when no weekly window exists", () => {
    const result = formatSegment(
      "weekly-limit",
      segmentInput({
        usageState: {
          compatibility: {
            currentLiveProviderSnapshot: {
              providerId: "anthropic",
              windows: [{ key: "fiveHour", usedPercent: 30 }],
            },
          },
        },
      }),
      identityTheme,
    );
    expect(result).toBeNull();
  });

  it("returns null when usageState is undefined", () => {
    const result = formatSegment("weekly-limit", segmentInput(), identityTheme);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test`

Expected: Tests fail because current implementation returns `["5h 70% left", "success"]` not `["5h 70% left", null]`.

---

### Task 7.2: Implement mixed-color format for usage limits

**Files:**
- Modify: `src/tui/render.ts`

- [ ] **Step 1: Rewrite the `five-hour-limit` case**

In `src/tui/render.ts`, replace the `case "five-hour-limit"` block:

```ts
    case "five-hour-limit": {
      const window = getRateWindow(input, "fiveHour");
      if (!window) return null;
      const remaining = Math.min(100, Math.max(0, 100 - Math.round(window.usedPercent)));
      const dim = (s: string) => theme.fg("dim", s);
      return [
        `${dim("5h ")}${theme.fg(rateColor(window.usedPercent), `${remaining}%`)}${dim(" left")}`,
        null,
      ];
    }
```

- [ ] **Step 2: Rewrite the `weekly-limit` case**

Replace the `case "weekly-limit"` block:

```ts
    case "weekly-limit": {
      const window = getRateWindow(input, "weekly");
      if (!window) return null;
      const remaining = Math.min(100, Math.max(0, 100 - Math.round(window.usedPercent)));
      const dim = (s: string) => theme.fg("dim", s);
      return [
        `${dim("wk ")}${theme.fg(rateColor(window.usedPercent), `${remaining}%`)}${dim(" left")}`,
        null,
      ];
    }
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `pnpm test`

Expected: All tests pass.

- [ ] **Step 4: Run full verification**

Run: `pnpm check`

Expected: Lint, typecheck, and tests all pass.

- [ ] **Step 5: Commit**

```bash
git add src/tui/render.ts tests/render.test.ts
git commit -m "feat: mixed-color format for usage limit segments"
```
