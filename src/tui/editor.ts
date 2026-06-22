import {
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  type Component,
} from "@earendil-works/pi-tui";
import type { FooterRenderInput } from "./render.ts";
import { buildFooterLine } from "./render.ts";
import type { StatusLineTheme } from "./theme.ts";
import type { PiStatusConfig, StatusLineSegmentId } from "../shared/types.ts";
import { isUsageSegment } from "../shared/types.ts";

type SegmentMetadata = {
  id: StatusLineSegmentId;
  label: string;
  description: string;
};

const SEGMENT_ORDER: readonly SegmentMetadata[] = [
  { id: "model", label: "Model", description: "Current model name" },
  {
    id: "model-with-reasoning",
    label: "Model + Reasoning",
    description: "Current model name with reasoning level",
  },
  {
    id: "project-name",
    label: "Project Name",
    description: "Project name (omitted when unavailable)",
  },
  {
    id: "current-dir",
    label: "Current Dir",
    description: "Current working directory",
  },
  {
    id: "git-branch",
    label: "Git Branch",
    description: "Current Git branch (omitted when unavailable)",
  },
  {
    id: "run-state",
    label: "Run State",
    description: "Pi status (idle, queued, busy)",
  },
  {
    id: "context-remaining",
    label: "Context Remaining",
    description:
      "Context tokens remaining vs window size (omitted when unknown)",
  },
  {
    id: "context-used",
    label: "Context Used",
    description: "Context tokens used vs window size (omitted when unknown)",
  },
  {
    id: "used-tokens",
    label: "Used Tokens",
    description: "Total tokens used in session (omitted when zero)",
  },
  {
    id: "total-input-tokens",
    label: "Input Tokens",
    description: "Total input tokens used in session",
  },
  {
    id: "total-output-tokens",
    label: "Output Tokens",
    description: "Total output tokens used in session",
  },
  {
    id: "session-id",
    label: "Session ID",
    description: "Current session ID (omitted when unavailable)",
  },
  {
    id: "five-hour-limit",
    label: "5h Limit",
    description:
      "Remaining usage on the primary usage limit (omitted when unavailable)",
  },
  {
    id: "weekly-limit",
    label: "Weekly Limit",
    description:
      "Remaining usage on the secondary usage limit (omitted when unavailable)",
  },
] as const;

const SEGMENT_METADATA = new Map(
  SEGMENT_ORDER.map((segment) => [segment.id, segment]),
);

const STATUS_ROW_DESCRIPTION = "Toggle visibility in the status line";
const EMPTY_EXTENSION_STATUSES_HINT = "No extension statuses yet.";
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
type InteractiveRow = SegmentInteractiveRow | StatusInteractiveRow;

type RenderRow =
  | { type: "header"; text: string }
  | { type: "divider" }
  | { type: "hint"; text: string }
  | { type: "interactive"; row: InteractiveRow; interactiveIndex: number };

export function collectHiddenStatuses(input: {
  discoveredKeys: string[];
  shownKeys: Iterable<string>;
}): string[] {
  const discovered = [...input.discoveredKeys].sort((a, b) =>
    a.localeCompare(b),
  );
  const shown = new Set(input.shownKeys);
  return discovered.filter((k) => !shown.has(k));
}

function includesFuzzy(haystack: string, needle: string): boolean {
  if (!needle) return true;
  let j = 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  for (let i = 0; i < h.length && j < n.length; i++) if (h[i] === n[j]) j++;
  return j === n.length;
}

function styleSelected(
  text: string,
  theme: StatusLineTheme,
  selected: boolean,
): string {
  return selected ? theme.fg("accent", theme.bold(text)) : text;
}

function renderRowLine(
  row: {
    selected: boolean;
    checkbox: string;
    labelWithOrder: string;
    description: string;
  },
  width: number,
  theme: StatusLineTheme,
): string {
  if (width < 1) return "";

  const markerRaw = row.selected ? "\u25B8" : " ";
  const marker = row.selected ? theme.fg("accent", markerRaw) : markerRaw;
  const prefixRaw = `${markerRaw} ${row.checkbox} `;
  const prefixWidth = visibleWidth(prefixRaw);
  const alignedMinWidth =
    prefixWidth +
    LABEL_COLUMN_WIDTH +
    LAYOUT_GAP.length +
    MIN_DESCRIPTION_WIDTH;

  const checkbox = styleSelected(row.checkbox, theme, row.selected);

  if (width < prefixWidth) return truncateToWidth(marker, width);

  if (width >= alignedMinWidth) {
    const labelFitted = truncateToWidth(row.labelWithOrder, LABEL_COLUMN_WIDTH);
    const labelPadded = labelFitted.padEnd(LABEL_COLUMN_WIDTH);
    const descWidth = Math.max(
      1,
      width - prefixWidth - LABEL_COLUMN_WIDTH - LAYOUT_GAP.length,
    );
    const desc = truncateToWidth(row.description, descWidth);
    const label = styleSelected(labelPadded, theme, row.selected);
    return `${marker} ${checkbox} ${label}${LAYOUT_GAP}${theme.dim(desc)}`;
  }

  const separator = " - ";
  const remainingWidth = width - prefixWidth;
  if (remainingWidth <= separator.length + 1) {
    const label = truncateToWidth(
      row.labelWithOrder,
      Math.max(0, width - prefixWidth),
    );
    return truncateToWidth(`${markerRaw} ${row.checkbox} ${label}`, width);
  }

  const labelWidth = Math.max(1, remainingWidth - separator.length - 1);
  const labelRaw = truncateToWidth(row.labelWithOrder, labelWidth);
  const fallbackBaseRaw = `${prefixRaw}${labelRaw}${separator}`;
  const fallbackDescWidth = Math.max(0, width - visibleWidth(fallbackBaseRaw));
  const desc = truncateToWidth(row.description, fallbackDescWidth);
  const label = styleSelected(labelRaw, theme, row.selected);
  return `${marker} ${checkbox} ${label}${separator}${theme.dim(desc)}`;
}

function renderSectionHeader(
  text: string,
  width: number,
  theme: StatusLineTheme,
): string {
  return truncateToWidth(theme.dim(text), width);
}

function renderDivider(width: number, theme: StatusLineTheme): string {
  return truncateToWidth(
    theme.fg("borderMuted", "─".repeat(Math.max(1, width))),
    width,
  );
}

function renderHint(
  text: string,
  width: number,
  theme: StatusLineTheme,
): string {
  return truncateToWidth(theme.dim(text), width);
}

export function createStatusLineEditor(options: {
  config: PiStatusConfig;
  discoveredStatuses: string[];
  previewInput: Omit<FooterRenderInput, "segments" | "extensionSegments">;
  theme: StatusLineTheme;
  done: (result: PiStatusConfig | null) => void;
  requestRender: () => void;
  usageAvailable?: boolean;
}): Component {
  const orderedStatuses = [...options.discoveredStatuses].sort((a, b) =>
    a.localeCompare(b),
  );
  const visibleSegments = SEGMENT_ORDER.filter(
    (segment) =>
      options.usageAvailable !== false || !isUsageSegment(segment.id),
  );
  let enabledSegments = [...options.config.segments];

  const hiddenSet = new Set(options.config.extensionSegments.hidden);
  const shown = new Set(orderedStatuses.filter((x) => !hiddenSet.has(x)));

  let selected = 0;
  let query = "";

  function isEnabledSegment(id: StatusLineSegmentId): boolean {
    return enabledSegments.includes(id);
  }

  function getInteractiveRows(): InteractiveRow[] {
    const enabled = enabledSegments
      .filter((id): id is StatusLineSegmentId =>
        visibleSegments.some((segment) => segment.id === id),
      )
      .map((id) => ({ type: "segment", id })) as SegmentInteractiveRow[];

    const disabled = visibleSegments
      .filter((segment) => !isEnabledSegment(segment.id))
      .map((segment) => ({
        type: "segment",
        id: segment.id,
      })) as SegmentInteractiveRow[];

    const statuses = orderedStatuses.map((key) => ({
      type: "status",
      key,
    })) as StatusInteractiveRow[];

    return [...enabled, ...disabled, ...statuses];
  }

  function rowMatchesQuery(row: InteractiveRow): boolean {
    if (!query) return true;
    if (row.type === "segment") {
      const meta = SEGMENT_METADATA.get(row.id);
      if (!meta) return false;
      return includesFuzzy(`${meta.label} ${meta.description}`, query);
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
      (row): row is StatusInteractiveRow => row.type === "status",
    );

    const renderRows: RenderRow[] = [];
    let interactiveIndex = 0;
    renderRows.push({ type: "header", text: SEGMENT_SECTION_TITLE });
    for (const row of segmentRows)
      renderRows.push({
        type: "interactive",
        row,
        interactiveIndex: interactiveIndex++,
      });
    renderRows.push({ type: "divider" });
    renderRows.push({ type: "header", text: STATUS_SECTION_TITLE });
    for (const row of extensionRows)
      renderRows.push({
        type: "interactive",
        row,
        interactiveIndex: interactiveIndex++,
      });
    if (orderedStatuses.length === 0)
      renderRows.push({ type: "hint", text: EMPTY_EXTENSION_STATUSES_HINT });
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
      if (isEnabledSegment(row.id))
        enabledSegments = enabledSegments.filter((x) => x !== row.id);
      else enabledSegments = [...enabledSegments, row.id];
      return;
    }
    if (shown.has(row.key)) shown.delete(row.key);
    else shown.add(row.key);
  }

  function moveSegment(delta: -1 | 1, row: InteractiveRow): void {
    if (query || row.type !== "segment") return;
    const idx = enabledSegments.indexOf(row.id);
    if (idx < 0) return;
    const next = idx + delta;
    if (next < 0 || next >= enabledSegments.length) return;
    const copy = [...enabledSegments];
    const [item] = copy.splice(idx, 1);
    copy.splice(next, 0, item);
    enabledSegments = copy;
    selected += delta;
  }

  function toConfig(): PiStatusConfig {
    return {
      segments: enabledSegments,
      extensionSegments: {
        hidden: collectHiddenStatuses({
          discoveredKeys: orderedStatuses,
          shownKeys: shown,
        }),
      },
    };
  }

  return {
    invalidate(): void {},
    handleInput(data: string): void {
      clampSelection();
      const list = getFilteredInteractiveRows();
      const current = list[selected];

      if (matchesKey(data, Key.escape)) return void options.done(null);
      if (matchesKey(data, Key.enter)) return void options.done(toConfig());
      if (matchesKey(data, Key.up)) {
        selected--;
        clampSelection();
        return void options.requestRender();
      }
      if (matchesKey(data, Key.down)) {
        selected++;
        clampSelection();
        return void options.requestRender();
      }
      if (matchesKey(data, Key.space) && current) {
        toggleRow(current);
        clampSelection();
        return void options.requestRender();
      }
      if (matchesKey(data, Key.left) && current) {
        moveSegment(-1, current);
        clampSelection();
        return void options.requestRender();
      }
      if (matchesKey(data, Key.right) && current) {
        moveSegment(1, current);
        clampSelection();
        return void options.requestRender();
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
        { ...options.previewInput, segments: cfg.segments, extensionSegments: cfg.extensionSegments },
        options.theme,
        width,
      );

      const lines: string[] = [];
      lines.push(
        truncateToWidth(
          options.theme.fg("accent", options.theme.bold(SHELL_TITLE)),
          width,
        ),
      );
      lines.push(truncateToWidth(options.theme.dim(SHELL_SUBTITLE), width));
      lines.push(truncateToWidth("", width));
      lines.push(truncateToWidth(options.theme.dim(SHELL_PLACEHOLDER), width));
      lines.push(truncateToWidth(`\u25B8 ${query}`, width));

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
        const selectedRow = renderRow.interactiveIndex === selected;
        if (row.type === "segment") {
          const enabled = isEnabledSegment(row.id) ? "[\u2022]" : "[ ]";
          const order = isEnabledSegment(row.id)
            ? ` (${enabledSegments.indexOf(row.id) + 1})`
            : "";
          const meta = SEGMENT_METADATA.get(row.id);
          if (!meta) continue;
          lines.push(
            renderRowLine(
              {
                selected: selectedRow,
                checkbox: enabled,
                labelWithOrder: `${meta.label}${order}`,
                description: meta.description,
              },
              width,
              options.theme,
            ),
          );
          continue;
        }
        lines.push(
          renderRowLine(
            {
              selected: selectedRow,
              checkbox: shown.has(row.key) ? "[\u2022]" : "[ ]",
              labelWithOrder: row.key,
              description: STATUS_ROW_DESCRIPTION,
            },
            width,
            options.theme,
          ),
        );
      }

      lines.push(truncateToWidth("", width));
      lines.push(truncateToWidth(preview, width));
      lines.push(
        truncateToWidth(
          options.theme.dim(query ? HELP_SEARCHING : HELP_BASE),
          width,
        ),
      );
      return lines;
    },
  };
}
