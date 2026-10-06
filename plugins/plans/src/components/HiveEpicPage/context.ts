import { createContext, useContext } from 'react';
import type { RoadmapItemDetail } from '@giantswarm/backstage-plugin-roadmap';
import { EpicPlans, IssueRef } from '../../lib/epic';
import { Lane, MagazineCard } from '../../lib/magazine';

/** One epic as its page knows it: the board item and what joins it. */
export interface EpicData {
  /** The board item id, `/hive/epics/:id`. */
  id: string;
  /** The epic page's path; its tabs are below it. */
  base: string;
  item: RoadmapItemDetail;
  issue?: IssueRef;
  /** The magazine's key for the epic's issue. */
  key?: string;
  /** The epic's card on Now, when the magazine lists it. */
  card?: MagazineCard;
  lane?: Lane;
  plans: EpicPlans;
  /** The board fields by name. */
  fields: Map<string, string>;
}

export const EpicContext = createContext<EpicData | undefined>(undefined);

/** The epic of the page a tab renders in. */
export function useEpic(): EpicData {
  const epic = useContext(EpicContext);
  if (!epic) {
    throw new Error('useEpic outside of an epic page');
  }
  return epic;
}
