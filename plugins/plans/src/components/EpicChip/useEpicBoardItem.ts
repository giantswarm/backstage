import { EpicRef } from '../../apis';
import { useRoadmapFetch } from '../../hooks/useRoadmapFetch';

/** The slice of a roadmap board item the epic chip and assignees need. */
export interface EpicBoardItem {
  id: string;
  title: string;
  assignees: string[];
  fields: Record<string, string>;
}

/**
 * Fetch the roadmap board item for an epic. Builds on `useRoadmapFetch` (see
 * there for why the roadmap backend is queried directly and how failure
 * degrades gracefully); this hook only adds the `items/by-issue` path and
 * unwraps the `{ item }` envelope. The query key is shared so the chip and the
 * assignees line resolve from a single request.
 */
export function useEpicBoardItem(epic: EpicRef) {
  return useRoadmapFetch<{ item: EpicBoardItem }, EpicBoardItem>({
    path: ['items', 'by-issue', epic.owner, epic.repo, epic.number],
    queryKey: ['plans', 'epic-item', epic.owner, epic.repo, epic.number],
    select: body => body.item,
  });
}
