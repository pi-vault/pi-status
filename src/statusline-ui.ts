import {
  Key,
  matchesKey,
  truncateToWidth,
  type Component,
} from "@earendil-works/pi-tui";
import type { PiStatusConfig } from "./config.ts";
import {
  buildFooterLine,
  type FooterRenderInput,
  type StatusLineSegmentId,
  type ThemeLike,
} from "./render.ts";

const SEGMENT_LABELS: Record<StatusLineSegmentId, string> = {
  model: "Model",
  "model-with-reasoning": "Model + Reasoning",
  "project-root": "Project Root",
  "current-dir": "Current Dir",
  "git-branch": "Git Branch",
  "run-state": "Run State",
  "context-remaining": "Context Remaining",
  "context-used": "Context Used",
  "context-window-size": "Context Window",
  "used-tokens": "Used Tokens",
  "total-input-tokens": "Input Tokens",
  "total-output-tokens": "Output Tokens",
  "session-id": "Session ID",
  "five-hour-limit": "5h Limit",
  "weekly-limit": "Weekly Limit",
  "extension-statuses": "Extension Statuses",
};

type SegmentRow = { type: "segment"; id: StatusLineSegmentId; label: string };
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
  const allSegments = Object.entries(SEGMENT_LABELS).map(([id, label]) => ({
    type: "segment",
    id: id as StatusLineSegmentId,
    label,
  })) as SegmentRow[];

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
    const segRows = allSegments.filter((s) => includesFuzzy(s.label, query));
    const statusRows = orderedStatuses
      .filter((key) => includesFuzzy(key, query))
      .map((key) => ({ type: "status", key, label: key }) as StatusRow);
    const newRow = [{ type: "new", label: "New extension statuses" } as NewRow];
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
        truncateToWidth(options.theme.fg("accent", "Statusline editor"), width),
      );
      lines.push(
        truncateToWidth(
          `Search: ${query || "(none)"}  •  Toggle: Space  •  Save: Enter  •  Cancel: Esc`,
          width,
        ),
      );
      lines.push(
        truncateToWidth(
          query
            ? "Reorder disabled while search is active"
            : "Reorder segment rows with ← / →",
          width,
        ),
      );
      lines.push(truncateToWidth("", width));

      for (let i = 0; i < list.length; i++) {
        const row = list[i];
        const cursor = i === selected ? ">" : " ";
        if (row.type === "segment") {
          const enabled = isEnabledSegment(row.id) ? "[x]" : "[ ]";
          const order = isEnabledSegment(row.id)
            ? ` (${enabledSegments.indexOf(row.id) + 1})`
            : "";
          lines.push(
            truncateToWidth(`${cursor} ${enabled} ${row.label}${order}`, width),
          );
          continue;
        }
        if (row.type === "status") {
          const enabled = shown.has(row.key) ? "[x]" : "[ ]";
          lines.push(
            truncateToWidth(`${cursor} ${enabled} ${row.label}`, width),
          );
          continue;
        }
        lines.push(
          truncateToWidth(
            `${cursor} [${newPolicyShown ? "shown" : "hidden"}] ${row.label}`,
            width,
          ),
        );
      }

      lines.push(truncateToWidth("", width));
      lines.push(truncateToWidth("Preview:", width));
      lines.push(truncateToWidth(preview, width));
      return lines;
    },
  };
}
