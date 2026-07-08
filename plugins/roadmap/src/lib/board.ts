import { BoardFieldSchema, BoardItem } from '../apis';

/** Board field names this plugin knows about (single-select unless noted). */
export const STATUS_FIELD = 'Status';
export const KIND_FIELD = 'Kind';
export const TEAM_FIELD = 'Team';
export const AVAILABILITY_FIELD = 'Availability';
/** Iteration field. */
export const QUARTER_FIELD = 'Quarter';

/** Statuses that mean "someone is actively on it" for the team view. */
export const ACTIVE_STATUSES = ['In Progress ⛏️', 'Validation ☑️'];

export function getFieldSchema(
  fields: BoardFieldSchema[] | undefined,
  name: string,
): BoardFieldSchema | undefined {
  return fields?.find(field => field.name.toLowerCase() === name.toLowerCase());
}

export function fieldOptions(
  fields: BoardFieldSchema[] | undefined,
  name: string,
): string[] {
  const field = getFieldSchema(fields, name);
  return field?.options ?? field?.iterations ?? [];
}

/** Group items by a single-select field value, in schema option order. */
export function groupByField(
  items: BoardItem[],
  optionOrder: string[],
  fieldName: string,
): Array<{ value: string; items: BoardItem[] }> {
  const groups = new Map<string, BoardItem[]>();
  for (const option of optionOrder) {
    groups.set(option, []);
  }
  const unset: BoardItem[] = [];
  for (const item of items) {
    const value = item.fields[fieldName];
    if (value && groups.has(value)) {
      groups.get(value)!.push(item);
    } else if (value) {
      groups.set(value, [...(groups.get(value) ?? []), item]);
    } else {
      unset.push(item);
    }
  }
  const result = [...groups.entries()].map(([value, groupItems]) => ({
    value,
    items: groupItems,
  }));
  if (unset.length > 0) {
    result.push({ value: `No ${fieldName.toLowerCase()}`, items: unset });
  }
  return result;
}

/**
 * Group items by assignee. Items with multiple assignees appear under each;
 * unassigned items are collected under the empty-string key (rendered
 * prominently -- active work nobody owns is a smell).
 */
export function groupByAssignee(
  items: BoardItem[],
): Array<{ assignee: string; items: BoardItem[] }> {
  const groups = new Map<string, BoardItem[]>();
  for (const item of items) {
    const assignees = item.assignees?.length ? item.assignees : [''];
    for (const assignee of assignees) {
      groups.set(assignee, [...(groups.get(assignee) ?? []), item]);
    }
  }
  return [...groups.entries()]
    .map(([assignee, groupItems]) => ({ assignee, items: groupItems }))
    .sort((a, b) => {
      if (a.assignee === '') return -1;
      if (b.assignee === '') return 1;
      return a.assignee.localeCompare(b.assignee);
    });
}

/** Parse `owner/repo` out of a board item's repo slug. */
export function parseRepoSlug(
  slug: string | null | undefined,
): { owner: string; repo: string } | undefined {
  if (!slug) return undefined;
  const [owner, repo] = slug.split('/');
  if (!owner || !repo) return undefined;
  return { owner, repo };
}
