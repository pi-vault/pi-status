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

type SegmentMetadata = {
  id: StatusLineSegmentId;
  label: string;
  description: string;
};

const SEGMENT_ORDER: readonly SegmentMetadata[] = [
  {
    id: "model",
    label: "Model",
    description:
      "Show the current model name. Hidden when no model is available.",
  },
  {
    id: "model-with-reasoning",
    label: "Model + Reasoning",
    description:
      "Show the current model name and reasoning level. Hidden when no model is available.",
  },
  {
    id: "project-root",
    label: "Project Root",
    description:
      "Show the nearest project root folder name. Hidden when no project root is detected.",
  },
  {
    id: "current-dir",
    label: "Current Dir",
    description: "Show the current working directory.",
  },
  {
    id: "git-branch",
    label: "Git Branch",
    description: "Show the current Git branch. Hidden when unavailable.",
  },
  {
    id: "run-state",
    label: "Run State",
    description: "Show whether Pi is idle, queued, or busy.",
  },
  {
    id: "context-remaining",
    label: "Context Remaining",
    description:
      "Show remaining context tokens. Hidden when context usage is unavailable.",
  },
  {
    id: "context-used",
    label: "Context Used",
    description:
      "Show percent of context already used. Hidden when context usage is unavailable.",
  },
  {
    id: "context-window-size",
    label: "Context Window",
    description:
      "Show the total context window size. Hidden when context usage is unavailable.",
  },
  {
    id: "used-tokens",
    label: "Used Tokens",
    description:
      "Show total assistant tokens used in this branch. Hidden when unavailable.",
  },
  {
    id: "total-input-tokens",
    label: "Input Tokens",
    description:
      "Show total assistant input tokens in this branch. Hidden when unavailable.",
  },
  {
    id: "total-output-tokens",
    label: "Output Tokens",
    description:
      "Show total assistant output tokens in this branch. Hidden when unavailable.",
  },
  {
    id: "session-id",
    label: "Session ID",
    description: "Show the short session ID. Hidden when unavailable.",
  },
  {
    id: "five-hour-limit",
    label: "5h Limit",
    description: "Show remaining 5-hour Codex quota. Hidden when unavailable.",
  },
  {
    id: "weekly-limit",
    label: "Weekly Limit",
    description: "Show remaining weekly Codex quota. Hidden when unavailable.",
  },
  {
    id: "extension-statuses",
    label: "Extension Statuses",
    description:
      "Show visible extension status values. Hidden when none are visible.",
  },
] as const;

const SEGMENT_METADATA = new Map(
  SEGMENT_ORDER.map((segment) => [segment.id, segment]),
);

const STATUS_ROW_DESCRIPTION =
  "Show or hide this extension status when extension-statuses is enabled.";
const POLICY_ROW_LABEL = "New extension statuses";
const POLICY_ROW_DESCRIPTION =
  "Whether newly discovered extension statuses are shown by default.";
const EMPTY_EXTENSION_STATUSES_HINT = "No extension statuses discovered yet.";
const SEGMENT_SECTION_TITLE = "Status line items";
const STATUS_SECTION_TITLE = "Extension statuses";

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

type SegmentInteractiveRow = { type: "segment"; id: StatusLineSegmentId };
type StatusInteractiveRow = { type: "status"; key: string };
type PolicyInteractiveRow = { type: "policy" };
type InteractiveRow =
  | SegmentInteractiveRow
  | StatusInteractiveRow
  | PolicyInteractiveRow;

type RenderRow =
  | { type: "header"; text: string }
  | { type: "divider" }
  | { type: "hint"; text: string }
  | { type: "interactive"; row: InteractiveRow; interactiveIndex: number };

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

function renderSectionHeader(text: string, width: number, theme: ThemeLike): string {
  return truncateToWidth(theme.fg("dim", text), width);
}

function renderDivider(width: number, theme: ThemeLike): string {
  return truncateToWidth(theme.fg("dim", "─".repeat(Math.max(1, width))), width);
}

function renderHint(text: string, width: number, theme: ThemeLike): string {
  return truncateToWidth(theme.fg("dim", text), width);
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

  function isEnabledSegment(id: StatusLineSegmentId): boolean {
    return enabledSegments.includes(id);
  }

  function getInteractiveRows(): InteractiveRow[] {
    const enabled = enabledSegments.map((id) => ({
      type: "segment",
      id,
    })) as SegmentInteractiveRow[];

    const disabled = SEGMENT_ORDER.filter((segment) => !isEnabledSegment(segment.id))
      .map((segment) => ({
        type: "segment",
        id: segment.id,
      })) as SegmentInteractiveRow[];

    const policy: PolicyInteractiveRow = { type: "policy" };
    const statuses = orderedStatuses.map((key) => ({
      type: "status",
      key,
    })) as StatusInteractiveRow[];

    return [...enabled, ...disabled, policy, ...statuses];
  }

  function rowMatchesQuery(row: InteractiveRow): boolean {
    if (!query) return true;

    if (row.type === "segment") {
      const meta = SEGMENT_METADATA.get(row.id);
      if (!meta) return false;
      return includesFuzzy(`${meta.label} ${meta.description}`, query);
    }

    if (row.type === "policy") {
      return includesFuzzy(`${POLICY_ROW_LABEL} ${POLICY_ROW_DESCRIPTION}`, query);
    }

    return includesFuzzy(`${row.key} ${STATUS_ROW_DESCRIPTION}`, query);
  }

  function getFilteredInteractiveRows(): InteractiveRow[] {
    return getInteractiveRows().filter((row) => rowMatchesQuery(row));
  }

  function getRenderRows(): RenderRow[] {
    const filtered = getFilteredInteractiveRows();

    if (query) {
      return filtered.map((row, interactiveIndex) => ({
        type: "interactive",
        row,
        interactiveIndex,
      }));
    }

    const segmentRows = filtered.filter(
      (row): row is SegmentInteractiveRow => row.type === "segment",
    );
    const extensionRows = filtered.filter(
      (row): row is StatusInteractiveRow | PolicyInteractiveRow =>
        row.type === "status" || row.type === "policy",
    );

    const renderRows: RenderRow[] = [];
    let interactiveIndex = 0;

    renderRows.push({ type: "header", text: SEGMENT_SECTION_TITLE });
    for (const row of segmentRows) {
      renderRows.push({ type: "interactive", row, interactiveIndex });
      interactiveIndex++;
    }

    renderRows.push({ type: "divider" });
    renderRows.push({ type: "header", text: STATUS_SECTION_TITLE });

    for (const row of extensionRows) {
      renderRows.push({ type: "interactive", row, interactiveIndex });
      interactiveIndex++;
    }

    if (orderedStatuses.length === 0) {
      renderRows.push({ type: "hint", text: EMPTY_EXTENSION_STATUSES_HINT });
    }

    return renderRows;
  }

  function clampSelection(): void {
    const list = getFilteredInteractiveRows();
    if (list.length === 0) {
      selected = 0;
      return;
    }
    if (selected < 0) selected = 0;
    if (selected >= list.length) selected = list.length - 1;
  }

  function toggleRow(row: InteractiveRow): void {
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

  function moveSegment(delta: -1 | 1, row: InteractiveRow): void {
    if (query) return;
    if (row.type !== "segment") return;
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
      clampSelection();
      const list = getFilteredInteractiveRows();
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
        clampSelection();
        options.requestRender();
        return;
      }
      if (matchesKey(data, Key.left) && current) {
        moveSegment(-1, current);
        clampSelection();
        options.requestRender();
        return;
      }
      if (matchesKey(data, Key.right) && current) {
        moveSegment(1, current);
        clampSelection();
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

      if (/^[\x21-\x7E]$/.test(data)) {
        query += data;
        clampSelection();
        options.requestRender();
      }
    },

    render(width: number): string[] {
      clampSelection();
      const renderRows = getRenderRows();
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

      for (const renderRow of renderRows) {
        if (renderRow.type === "header") {
          lines.push(renderSectionHeader(renderRow.text, width, options.theme));
          continue;
        }
        if (renderRow.type === "divider") {
          lines.push(renderDivider(width, options.theme));
          continue;
        }
        if (renderRow.type === "hint") {
          lines.push(renderHint(renderRow.text, width, options.theme));
          continue;
        }

        const row = renderRow.row;
        const cursor = renderRow.interactiveIndex === selected ? ">" : " ";
        if (row.type === "segment") {
          const enabled = isEnabledSegment(row.id) ? "[x]" : "[ ]";
          const order = isEnabledSegment(row.id)
            ? ` (${enabledSegments.indexOf(row.id) + 1})`
            : "";
          const meta = SEGMENT_METADATA.get(row.id);
          if (!meta) continue;
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
                labelWithOrder: row.key,
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
