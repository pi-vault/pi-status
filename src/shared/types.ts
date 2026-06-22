export type StatusLineSegmentId =
  | "model"
  | "model-with-reasoning"
  | "project-name"
  | "current-dir"
  | "git-branch"
  | "run-state"
  | "context-remaining"
  | "context-used"
  | "used-tokens"
  | "total-input-tokens"
  | "total-output-tokens"
  | "session-id"
  | "five-hour-limit"
  | "weekly-limit"
  | "extension-statuses";

export type StatusFilter =
  | { mode: "all"; hidden: string[] }
  | { mode: "only"; shown: string[] };

export type PiStatusConfig = {
  segments: StatusLineSegmentId[];
  filter: StatusFilter;
};

export const KNOWN_SEGMENTS: readonly StatusLineSegmentId[] = [
  "model",
  "model-with-reasoning",
  "project-name",
  "current-dir",
  "git-branch",
  "run-state",
  "context-remaining",
  "context-used",
  "used-tokens",
  "total-input-tokens",
  "total-output-tokens",
  "session-id",
  "five-hour-limit",
  "weekly-limit",
  "extension-statuses",
] as const;

export const DEFAULT_SEGMENTS: readonly StatusLineSegmentId[] = [
  "model-with-reasoning",
  "current-dir",
] as const;

export const USAGE_SEGMENTS = new Set<StatusLineSegmentId>([
  "five-hour-limit",
  "weekly-limit",
]);

export function isKnownSegment(value: string): value is StatusLineSegmentId {
  return (KNOWN_SEGMENTS as readonly string[]).includes(value);
}

export function isUsageSegment(id: StatusLineSegmentId): boolean {
  return USAGE_SEGMENTS.has(id);
}
