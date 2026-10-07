/**
 * Hive: the one place for the team's work, merging the magazine's Now and
 * History, the roadmap board and the plans. The views read the magazine's
 * data contract (`lib/magazine.ts`); this module scopes it to a team and
 * derives the figures the views show.
 */

import {
  Entry,
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

/**
 * Whether two names are the same team, emoji and case aside: the magazine
 * writes "Phoenix" where the board's option is "Phoenix 🔥".
 */
export function sameTeam(a: string, b: string): boolean {
  return teamName(a).toLowerCase() === teamName(b).toLowerCase();
}

/**
 * Whether the magazine follows this scope: its own team (`meta.json`'s
 * `sources.team`) or all teams. Only then are its summary, its figures and
 * its plans the scope's.
 */
export function followsTeam(team: string, magazineTeam: string): boolean {
  return team === ALL_TEAMS || sameTeam(team, magazineTeam);
}

/** An item without a `team` is the magazine's own team's. */
function inTeam(
  item: MagazineCard | Entry,
  team: string,
  magazineTeam: string,
): boolean {
  return team === ALL_TEAMS || sameTeam(item.team ?? magazineTeam, team);
}

/**
 * Now, scoped to one team: its lanes and blockers, and its plans and summary
 * when the magazine follows it. "Other teams, coming up" keeps only the
 * other teams' work, and is empty across all teams.
 */
export function nowForTeam(now: Now, team: string, magazineTeam: string): Now {
  if (team === ALL_TEAMS) {
    return { ...now, upcoming: [] };
  }
  const follows = followsTeam(team, magazineTeam);
  // A lane keeps its ranked `total` until the scope drops one of its cards.
  const lanes: Lane[] = now.lanes.map(lane => {
    const cards = lane.cards.filter(card => inTeam(card, team, magazineTeam));
    return cards.length === lane.cards.length
      ? lane
      : { ...lane, cards, total: cards.length };
  });
  return {
    ...now,
    summary: follows ? now.summary : [],
    lanes,
    reviews: follows ? now.reviews : [],
    blocked: now.blocked.filter(card => inTeam(card, team, magazineTeam)),
    upcoming: now.upcoming.filter(card => !inTeam(card, team, magazineTeam)),
  };
}

/**
 * History, scoped to one team: each group keeps the team's entries and drops
 * out without any; a group without entries is the magazine's own team's. The
 * summary and the chores are the magazine's team's.
 */
export function historyForTeam(
  history: History,
  team: string,
  magazineTeam: string,
): History {
  if (team === ALL_TEAMS) {
    return history;
  }
  const follows = followsTeam(team, magazineTeam);
  const groups = history.groups
    .map(group => ({
      group,
      entries: group.entries.filter(entry => inTeam(entry, team, magazineTeam)),
    }))
    .filter(({ group, entries }) =>
      group.entries.length === 0 ? follows : entries.length > 0,
    )
    .map(({ group, entries }) => ({ ...group, entries }));
  return {
    ...history,
    summary: follows ? history.summary : [],
    groups,
    chores: follows ? history.chores : { count: 0, repos: 0, sample: [] },
  };
}

/**
 * A team's plans repositories: each team keeps its plans in `<team>-plans`,
 * its name in lower case without spaces ("Honey Badger 🦡" →
 * `honeybadger-plans`). All teams: every repository.
 */
export function plansRepositoriesForTeam(
  repositories: string[],
  team: string,
): string[] {
  if (team === ALL_TEAMS) {
    return repositories;
  }
  const name = `${teamName(team).toLowerCase().replace(/\s+/g, '')}-plans`;
  return repositories.filter(
    repository => repository.split('/')[1]?.toLowerCase() === name,
  );
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
