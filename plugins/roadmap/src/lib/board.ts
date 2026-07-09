import { RoadmapField, RoadmapItem } from '../apis';

/** Board field names this plugin gives special treatment. */
export const STATUS_FIELD = 'Status';
export const KIND_FIELD = 'Kind';

/** Bucket for items without a status, shown as the last board column. */
export const NO_STATUS = 'No status';

/**
 * Status column order comes from the board schema (the single source of
 * truth for the lifecycle); an empty result means the schema has no Status
 * field at all.
 */
export function statusColumns(fields: RoadmapField[]): string[] {
  const statusField = fields.find(field => field.name === STATUS_FIELD);
  return statusField?.options ?? [];
}

/**
 * Find the board's actual status value for a plain keyword: option names
 * carry emoji suffixes (e.g. "In Progress ⛏️"), so "in progress" resolves
 * to the full name. Undefined when no option starts with the keyword.
 */
export function findStatusOption(
  options: string[] | undefined,
  keyword: string,
): string | undefined {
  const needle = keyword.trim().toLowerCase();
  if (!needle) {
    return undefined;
  }
  return options?.find(option => option.toLowerCase().startsWith(needle));
}

export function groupByStatus(
  items: RoadmapItem[],
  columns: string[],
): Map<string, RoadmapItem[]> {
  const groups = new Map<string, RoadmapItem[]>();
  for (const column of columns) {
    groups.set(column, []);
  }
  for (const item of items) {
    const status = item.fields[STATUS_FIELD] ?? NO_STATUS;
    const bucket = groups.get(status);
    if (bucket) {
      bucket.push(item);
    } else {
      groups.set(status, [item]);
    }
  }
  return groups;
}

/**
 * Group items per assignee (an item with two assignees appears under
 * both), with unassigned items collected separately -- in-flight work
 * without an owner is a signal the activity view calls out explicitly.
 * Groups are sorted alphabetically by assignee.
 */
export function groupByAssignee(items: RoadmapItem[]): {
  groups: Array<{ assignee: string; items: RoadmapItem[] }>;
  unassigned: RoadmapItem[];
} {
  const byAssignee = new Map<string, RoadmapItem[]>();
  const unassigned: RoadmapItem[] = [];
  for (const item of items) {
    if (!item.assignees?.length) {
      unassigned.push(item);
      continue;
    }
    for (const assignee of item.assignees) {
      byAssignee.set(assignee, [...(byAssignee.get(assignee) ?? []), item]);
    }
  }
  const groups = [...byAssignee.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([assignee, assigneeItems]) => ({ assignee, items: assigneeItems }));
  return { groups, unassigned };
}

/**
 * The issue reference (owner, repo, number) behind a board item, for the
 * sub-issue endpoints. Undefined for draft items, which have no issue.
 */
export function issueRefOf(item: {
  repo?: string | null;
  number?: number | '' | null;
}): { owner: string; repo: string; number: number } | undefined {
  if (typeof item.number !== 'number' || !item.repo) {
    return undefined;
  }
  const [owner, repo] = item.repo.split('/');
  if (!owner || !repo) {
    return undefined;
  }
  return { owner, repo, number: item.number };
}
