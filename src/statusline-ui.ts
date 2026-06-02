import {
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  type Component,
} from "@earendil-works/pi-tui";
import type { PiStatusConfig } from "./config.ts";
import {
  buildFooterLine,
  type FooterRenderInput,
  type StatusLineSegmentId,
  type ThemeLike,
} from "./render.ts";

const SEGMENT_METADATA: Record<
  StatusLineSegmentId,
  { label: string; description: string }
> = {
  model: {
    label: "Model",
    description:
      "Show the current model name. Hidden when no model is available.",
  },
  "model-with-reasoning": {
    label: "Model + Reasoning",
    description:
      "Show the current model name and reasoning level. Hidden when no model is available.",
  },
  "project-root": {
    label: "Project Root",
    description:
      "Show the nearest project root folder name. Hidden when no project root is detected.",
  },
  "current-dir": {
    label: "Current Dir",
    description: "Show the current working directory.",
  },
  "git-branch": {
    label: "Git Branch",
    description: "Show the current Git branch. Hidden when unavailable.",
  },
  "run-state": {
    label: "Run State",
    description: "Show whether Pi is idle, queued, or busy.",
  },
  "context-remaining": {
    label: "Context Remaining",
    description:
      "Show remaining context tokens. Hidden when context usage is unavailable.",
  },
  "context-used": {
    label: "Context Used",
    description:
      "Show percent of context already used. Hidden when context usage is unavailable.",
  },
  "context-window-size": {
    label: "Context Window",
    description:
      "Show the total context window size. Hidden when context usage is unavailable.",
  },
  "used-tokens": {
    label: "Used Tokens",
    description:
      "Show total assistant tokens used in this branch. Hidden when unavailable.",
  },
  "total-input-tokens": {
    label: "Input Tokens",
    description:
      "Show total assistant input tokens in this branch. Hidden when unavailable.",
  },
  "total-output-tokens": {
    label: "Output Tokens",
    description:
      "Show total assistant output tokens in this branch. Hidden when unavailable.",
  },
  "session-id": {
    label: "Session ID",
    description: "Show the short session ID. Hidden when unavailable.",
  },
  "five-hour-limit": {
    label: "5h Limit",
    description: "Show remaining 5-hour Codex quota. Hidden when unavailable.",
  },
  "weekly-limit": {
    label: "Weekly Limit",
    description: "Show remaining weekly Codex quota. Hidden when unavailable.",
  },
  "extension-statuses": {
    label: "Extension Statuses",
    description:
      "Show visible extension status values. Hidden when none are visible.",
  },
};

const STATUS_ROW_DESCRIPTION =
  "Show or hide this extension status when extension-statuses is enabled.";
const POLICY_ROW_LABEL = "New extension statuses";
const POLICY_ROW_DESCRIPTION =
  "Whether newly discovered extension statuses are shown by default.";

const LABEL_COLUMN_WIDTH = 24;
const LAYOUT_GAP = "  ";
const MIN_DESCRIPTION_WIDTH = 12;

const SHELL_TITLE = "Configure Status Line";
const SHELL_SUBTITLE = "Select which items to display in the status line.";
const SHELL_PLACEHOLDER = "Type to search";
const HELP_BASE =
  "Toggle: Space  •  Reorder: ← / →  •  Save: Enter  •  Cancel: Esc";
const HELP_SEARCHING =
  "Toggle: Space  •  Reorder: disabled while search is active  •  Save: Enter  •  Cancel: Esc";

type SegmentRow = { type: "segment"; id: StatusLineSegmentId };
type StatusRow = { type: "status"; key: string; label: string };
type NewRow = { type: "new"; label: string };
type Row = SegmentRow | StatusRow | NewRow;

export function mapStatusDraftToFilter(input: {
  discoveredKeys: string[];
  shownKeys: Iterable<string>;
  newStatusesShown: boolean;
}): PiStatusConfig["filter"] {
  const discovered = [...input.discoveredKeys].sort((a, b) =>
    a.localeCompare(b),
  );
  const shown = new Set(input.shownKeys);

  if (input.newStatusesShown) {
    return { mode: "all", hidden: discovered.filter((k) => !shown.has(k)) };
  }

  return { mode: "only", shown: discovered.filter((k) => shown.has(k)) };
}

function includesFuzzy(haystack: string, needle: string): boolean {
  if (!needle) return true;
  let j = 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  for (let i = 0; i < h.length && j < n.length; i++) if (h[i] === n[j]) j++;
  return j === n.length;
}

function renderRowLine(
  row: {
    cursor: string;
    checkbox: string;
    labelWithOrder: string;
    description: string;
  },
  width: number,
  theme: ThemeLike,
): string {
  const prefix = `${row.cursor} ${row.checkbox} `;
  const prefixWidth = visibleWidth(prefix);
  const alignedMinWidth =
    prefixWidth +
    LABEL_COLUMN_WIDTH +
    LAYOUT_GAP.length +
    MIN_DESCRIPTION_WIDTH;

  if (width >= alignedMinWidth) {
    const labelFitted = truncateToWidth(row.labelWithOrder, LABEL_COLUMN_WIDTH);
    const labelPadded = labelFitted.padEnd(LABEL_COLUMN_WIDTH);
    const descWidth = Math.max(
      1,
      width - prefixWidth - LABEL_COLUMN_WIDTH - LAYOUT_GAP.length,
    );
    const desc = truncateToWidth(row.description, descWidth);
    return `${prefix}${labelPadded}${LAYOUT_GAP}${theme.fg("dim", desc)}`;
  }

  const separator = " - ";
  const remainingWidth = width - prefixWidth;
  if (remainingWidth < 1) {
    return truncateToWidth(prefix, width);
  }

  if (remainingWidth <= separator.length + 1) {
    return truncateToWidth(`${prefix}${row.labelWithOrder}`, width);
  }

  const labelWidth = Math.max(1, remainingWidth - separator.length - 1);
  const label = truncateToWidth(row.labelWithOrder, labelWidth);
  const fallbackBase = `${prefix}${label}${separator}`;
  const fallbackDescWidth = Math.max(0, width - visibleWidth(fallbackBase));
  const desc = truncateToWidth(row.description, fallbackDescWidth);
  return `${fallbackBase}${theme.fg("dim", desc)}`;
}

export function createStatuslineEditor(options: {
  config: PiStatusConfig;
  discoveredStatuses: string[];
  previewInput: Omit<FooterRenderInput, "segments" | "filter">;
  theme: ThemeLike;
  done: (result: PiStatusConfig | null) => void;
  requestRender: () => void;
}): Component {
  const orderedStatuses = [...options.discoveredStatuses].sort((a, b) =>
    a.localeCompare(b),
  );
  let enabledSegments = [...options.config.segments];
  const allSegments = Object.entries(SEGMENT_METADATA).map(([id, meta]) => ({
    type: "segment",
    id: id as StatusLineSegmentId,
    label: meta.label,
  })) as Array<SegmentRow & { label: string }>;

  const shownNew = options.config.filter.mode === "all";
  let newPolicyShown = shownNew;

  const hiddenSet = new Set(
    options.config.filter.mode === "all" ? options.config.filter.hidden : [],
  );
  const shown =
    options.config.filter.mode === "all"
      ? new Set(orderedStatuses.filter((x) => !hiddenSet.has(x)))
      : new Set(options.config.filter.shown);

  let selected = 0;
  let query = "";

  function rows(): Row[] {
    const segRows = allSegments
      .filter((s) => includesFuzzy(s.label, query))
      .map(({ id, label }) => ({ type: "segment", id, label }) as SegmentRow);
    const statusRows = orderedStatuses
      .filter((key) => includesFuzzy(key, query))
      .map((key) => ({ type: "status", key, label: key }) as StatusRow);
    const newRow = [{ type: "new", label: POLICY_ROW_LABEL } as NewRow];
    return [...segRows, ...statusRows, ...newRow];
  }

  function clampSelection(): void {
    const list = rows();
    if (list.length === 0) {
      selected = 0;
      return;
    }
    if (selected < 0) selected = 0;
    if (selected >= list.length) selected = list.length - 1;
  }

  function isEnabledSegment(id: StatusLineSegmentId): boolean {
    return enabledSegments.includes(id);
  }

  function toggleRow(row: Row): void {
    if (row.type === "segment") {
      if (isEnabledSegment(row.id)) {
        enabledSegments = enabledSegments.filter((x) => x !== row.id);
      } else {
        enabledSegments = [...enabledSegments, row.id];
      }
      return;
    }

    if (row.type === "status") {
      if (shown.has(row.key)) shown.delete(row.key);
      else shown.add(row.key);
      return;
    }

    newPolicyShown = !newPolicyShown;
  }

  function moveSegment(delta: -1 | 1, row: SegmentRow): void {
    if (query) return;
    const idx = enabledSegments.indexOf(row.id);
    if (idx < 0) return;
    const next = idx + delta;
    if (next < 0 || next >= enabledSegments.length) return;
    const copy = [...enabledSegments];
    const [item] = copy.splice(idx, 1);
    copy.splice(next, 0, item);
    enabledSegments = copy;
  }

  function toConfig(): PiStatusConfig {
    return {
      segments: enabledSegments,
      filter: mapStatusDraftToFilter({
        discoveredKeys: orderedStatuses,
        shownKeys: shown,
        newStatusesShown: newPolicyShown,
      }),
    };
  }

  return {
    invalidate(): void {},

    handleInput(data: string): void {
      const list = rows();
      clampSelection();
      const current = list[selected];

      if (matchesKey(data, Key.escape)) {
        options.done(null);
        return;
      }
      if (matchesKey(data, Key.enter)) {
        options.done(toConfig());
        return;
      }
      if (matchesKey(data, Key.up)) {
        selected--;
        clampSelection();
        options.requestRender();
        return;
      }
      if (matchesKey(data, Key.down)) {
        selected++;
        clampSelection();
        options.requestRender();
        return;
      }
      if (matchesKey(data, Key.space) && current) {
        toggleRow(current);
        options.requestRender();
        return;
      }
      if (matchesKey(data, Key.left) && current?.type === "segment") {
        moveSegment(-1, current);
        options.requestRender();
        return;
      }
      if (matchesKey(data, Key.right) && current?.type === "segment") {
        moveSegment(1, current);
        options.requestRender();
        return;
      }
      if (matchesKey(data, Key.backspace)) {
        if (query.length > 0) {
          query = query.slice(0, -1);
          clampSelection();
          options.requestRender();
        }
        return;
      }

      if (/^[\x20-\x7E]$/.test(data)) {
        query += data;
        clampSelection();
        options.requestRender();
      }
    },

    render(width: number): string[] {
      const list = rows();
      clampSelection();
      const cfg = toConfig();
      const preview = buildFooterLine(
        {
          ...options.previewInput,
          segments: cfg.segments,
          filter: cfg.filter,
        },
        options.theme,
        Math.max(10, width - 2),
      );

      const lines: string[] = [];
      lines.push(
        truncateToWidth(options.theme.fg("accent", SHELL_TITLE), width),
      );
      lines.push(
        truncateToWidth(options.theme.fg("dim", SHELL_SUBTITLE), width),
      );
      lines.push(truncateToWidth("", width));
      lines.push(
        truncateToWidth(options.theme.fg("dim", SHELL_PLACEHOLDER), width),
      );
      lines.push(truncateToWidth(`> ${query}`, width));

      for (let i = 0; i < list.length; i++) {
        const row = list[i];
        const cursor = i === selected ? ">" : " ";
        if (row.type === "segment") {
          const enabled = isEnabledSegment(row.id) ? "[x]" : "[ ]";
          const order = isEnabledSegment(row.id)
            ? ` (${enabledSegments.indexOf(row.id) + 1})`
            : "";
          const meta = SEGMENT_METADATA[row.id];
          const labelWithOrder = `${meta.label}${order}`;
          lines.push(
            renderRowLine(
              {
                cursor,
                checkbox: enabled,
                labelWithOrder,
                description: meta.description,
              },
              width,
              options.theme,
            ),
          );
          continue;
        }
        if (row.type === "status") {
          const enabled = shown.has(row.key) ? "[x]" : "[ ]";
          lines.push(
            renderRowLine(
              {
                cursor,
                checkbox: enabled,
                labelWithOrder: row.label,
                description: STATUS_ROW_DESCRIPTION,
              },
              width,
              options.theme,
            ),
          );
          continue;
        }
        const checkbox = `[${newPolicyShown ? "shown" : "hidden"}]`;
        lines.push(
          renderRowLine(
            {
              cursor,
              checkbox,
              labelWithOrder: POLICY_ROW_LABEL,
              description: POLICY_ROW_DESCRIPTION,
            },
            width,
            options.theme,
          ),
        );
      }

      lines.push(truncateToWidth("", width));
      lines.push(truncateToWidth("Preview:", width));
      lines.push(truncateToWidth(preview, width));
      lines.push(
        truncateToWidth(
          options.theme.fg("dim", query ? HELP_SEARCHING : HELP_BASE),
          width,
        ),
      );
      return lines;
    },
  };
}
