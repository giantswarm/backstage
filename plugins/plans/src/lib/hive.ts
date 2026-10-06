/**
 * Hive: the one place for the team's work, merging the magazine's Now and
 * History, the roadmap board and the plans. The views read the magazine's
 * data contract (`lib/magazine.ts`); this module scopes it to a team and
 * derives the figures the views show.
 */

import {
  History,
  isPortalPath,
  Lane,
  MagazineCard,
  Now,
  PlanCard,
  statusTone,
} from './magazine';

/** `?team=` value, and the localStorage key's value, for every team at once. */
export const ALL_TEAMS = 'all';

/** The team a portal's Hive opens on when nothing else is chosen. */
export const DEFAULT_TEAM = 'Bumblebee🐝';

/** The teams the header's scope offers, the default first. */
export const HIVE_TEAMS = [
  DEFAULT_TEAM,
  'Atlas 🗺️',
  'Cabbage 🥬',
  'Honey Badger 🦡',
  'Phoenix 🔥',
  'Planeteers 🪐',
  'Shield 🛡️',
  'Up 🎈',
] as const;

/** "Bumblebee🐝" → "Bumblebee", for prose and column labels. */
export function teamName(team: string): string {
  return team.replace(/[^\p{L}\p{N}\s-]/gu, '').trim();
}

function cardInTeam(card: MagazineCard, team: string): boolean {
  return team === ALL_TEAMS || !card.team || card.team === team;
}

/**
 * Now, scoped to one team: its lanes and blockers. "Other teams, coming up"
 * keeps only the other teams' work, and is empty across all teams.
 */
export function nowForTeam(now: Now, team: string): Now {
  const lanes: Lane[] = now.lanes.map(lane => {
    const cards = lane.cards.filter(card => cardInTeam(card, team));
    return { ...lane, cards, total: cards.length };
  });
  return {
    ...now,
    lanes,
    blocked: now.blocked.filter(card => cardInTeam(card, team)),
    upcoming:
      team === ALL_TEAMS
        ? []
        : now.upcoming.filter(card => card.team && card.team !== team),
  };
}

/** History, scoped to one team: groups whose team is that team or unset. */
export function historyForTeam(history: History, team: string): History {
  if (team === ALL_TEAMS) {
    return history;
  }
  const groups = history.groups.filter(
    group =>
      group.entries.length === 0 ||
      group.entries.some(entry => !entry.team || entry.team === team),
  );
  return { ...history, groups };
}

export interface NowFigures {
  customers: number;
  inProgress: number;
  blocked: number;
  plansWaiting: number;
}

/** The four figures over Now's lanes. */
export function nowFigures(now: Now): NowFigures {
  const cards = now.lanes.flatMap(lane => lane.cards);
  return {
    customers: now.lanes.find(lane => lane.id === 'customer')?.total ?? 0,
    inProgress: cards.filter(card => statusTone(card.status) === 'info').length,
    blocked: now.blocked.length,
    plansWaiting: now.reviews.filter(plan => plan.state !== 'merged').length,
  };
}

/** Plans in the order they need someone: review first, then draft, grilling. */
const PLAN_STATE_ORDER: PlanCard['state'][] = [
  'review',
  'draft',
  'grilling',
  'merged',
];

export function sortPlansByNeed(plans: PlanCard[]): PlanCard[] {
  return [...plans].sort(
    (a, b) =>
      PLAN_STATE_ORDER.indexOf(a.state) - PLAN_STATE_ORDER.indexOf(b.state) ||
      b.updatedAt.localeCompare(a.updatedAt),
  );
}

/** A board status without its emoji: "In Progress ⛏️" → "In Progress". */
export function statusText(status: string | undefined): string {
  return (status ?? '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim();
}

export type StatusIntent = 'positive' | 'warning' | 'info' | 'neutral';

/**
 * The intent a board status reads with: work in progress is informational,
 * validation and done are positive, everything waiting is neutral. Blockers
 * get the warning, from the card's blocker rather than its status.
 */
export function statusIntent(
  status: string | undefined,
  blocked = false,
): StatusIntent {
  if (blocked) {
    return 'warning';
  }
  const value = statusText(status).toLowerCase();
  if (value.includes('progress')) {
    return 'info';
  }
  if (value.includes('validation') || value.includes('done')) {
    return 'positive';
  }
  return 'neutral';
}

/** Rows a Now lane shows before "Show all". */
export const HIVE_LANE_PREVIEW = 5;

/** Case-insensitive match of a search over a title, teaser and customers. */
export function matchesSearch(
  text: string,
  fields: (string | undefined)[],
): boolean {
  const needle = text.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return fields.some(field => field?.toLowerCase().includes(needle));
}

/** Where a card's title leads: its page in the portal when it has one. */
export function cardHref(card: MagazineCard): string {
  return card.links.find(link => isPortalPath(link.url))?.url ?? card.url;
}

/** Anchor props for a link: a new tab for anything outside the portal. */
export function linkTarget(url: string): {
  target?: string;
  rel?: string;
} {
  return isPortalPath(url)
    ? {}
    : { target: '_blank', rel: 'noopener noreferrer' };
}
