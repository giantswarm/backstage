/**
 * Hive's front page: one page read top to bottom for a moment in time. Now
 * reads the magazine's `now.json`; 3 days, 3 weeks and 3 months read the
 * history windows. Either way the page shows the same sections in the same
 * order, so sliding the time keeps the reader's place. This module turns
 * the magazine's data contract into those sections; the page renders them.
 */

import { relativeTime } from './dates';
import {
  matchesSearch,
  StatusIntent,
  statusIntent,
  statusText,
  teamName,
} from './hive';
import {
  Entry,
  Group,
  History,
  HISTORY_WINDOWS,
  HistoryWindow,
  isPortalPath,
  MagazineCard,
  MagazineClass,
  MagazineLink,
  Now,
  PLAN_STATE_LABELS,
  PlanCard,
  progressLabel,
  progressMoveLabel,
  progressPercent,
} from './magazine';

/** The moment the page reads: now, or one of the history windows. */
export type HiveWhen = 'now' | HistoryWindow;

export const HIVE_WHEN_OPTIONS: { id: HiveWhen; label: string }[] = [
  { id: 'now', label: 'Now' },
  ...HISTORY_WINDOWS,
];

/** `?when=` to a moment; anything unknown is now. */
export function whenFromParam(value: string | null): HiveWhen {
  return value === 'days' || value === 'weeks' || value === 'months'
    ? value
    : 'now';
}

/** Where an item opens: in place (an epic's pane, a plan's review) or out. */
export type ItemTarget =
  | { kind: 'item'; id: string }
  | { kind: 'pr'; number: number; repo: string }
  | { kind: 'url'; url: string };

/** One item of a section, whatever source and moment it came from. */
export interface FrontItem {
  key: string;
  title: string;
  teaser: string;
  target: ItemTarget;
  /**
   * A board status with its intent, or a plain label (a plan's state, a
   * window's story count, a team) without one.
   */
  status?: { label: string; intent?: StatusIntent };
  /** What blocks it, since when and who owns it, in one line. */
  blocker?: string;
  customers: string[];
  people: string[];
  /** "4 of 7 done" or "2 → 4 of 7 done", and the share done. */
  progress?: { label: string; percent: number };
  /** When it last moved. */
  at?: string;
  tryIt?: MagazineLink;
  /** Knowledge documents the item links to, opened in a pane. */
  background: { label: string; path: string }[];
  /** A team other than the reader's, for the other teams' section. */
  team?: string;
}

export type SectionId =
  'customers' | 'top-epics' | 'setup' | 'plans' | 'other-teams';

export interface FrontSection {
  id: SectionId;
  title: string;
  description: string;
  /** Ranked; the first is the section's lead. */
  items: FrontItem[];
  /** Work blocked now, shown above the section's items. */
  blocked: FrontItem[];
  /** A closing line: the chores the window merged, say. */
  footnote?: string;
  /** What an empty section says, in one line. */
  empty: string;
}

const SECTION_TITLES: Record<SectionId, string> = {
  customers: 'For customers',
  'top-epics': 'Top epics',
  setup: 'Setup and chores',
  plans: 'Plans',
  'other-teams': 'Other teams',
};

// --- Links ------------------------------------------------------------------

/**
 * The board item an epic's links name (`…/items/<id>`): the id the pane
 * opens by, the same id an old `/roadmap/items/:id` link carries.
 */
export function boardItemId(urls: (string | undefined)[]): string | undefined {
  for (const url of urls) {
    const match = url?.match(/\/items\/([^/?#]+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
  }
  return undefined;
}

/** A plan's pull request from its GitHub URL, for the review overlay. */
export function planPull(
  url: string,
): { repo: string; number: number } | undefined {
  const match = url.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
  return match ? { repo: match[1], number: Number(match[2]) } : undefined;
}

/** A knowledge document a portal link names (`…/knowledge?doc=<path>`). */
export function knowledgeDocPath(url: string): string | undefined {
  if (!isPortalPath(url)) {
    return undefined;
  }
  const [path, search = ''] = url.split('?');
  if (!path.endsWith('/knowledge')) {
    return undefined;
  }
  return new URLSearchParams(search).get('doc') ?? undefined;
}

function background(links: MagazineLink[]): FrontItem['background'] {
  return links.flatMap(link => {
    const path = knowledgeDocPath(link.url);
    return path ? [{ label: link.label, path }] : [];
  });
}

/** An epic opens in its pane when the board knows it, on GitHub otherwise. */
function epicTarget(urls: (string | undefined)[], url: string): ItemTarget {
  const id = boardItemId(urls);
  return id ? { kind: 'item', id } : { kind: 'url', url };
}

// --- Items ------------------------------------------------------------------

function cardItem(card: MagazineCard): FrontItem {
  const links = card.links.map(link => link.url);
  return {
    key: card.key,
    title: card.title,
    teaser: card.teaser,
    target: epicTarget(links, card.url),
    status: {
      label: card.blocker ? 'Blocked' : statusText(card.status),
      intent: statusIntent(card.status, Boolean(card.blocker)),
    },
    blocker: card.blocker
      ? [
          card.blocker.reason,
          card.blocker.since && `since ${relativeTime(card.blocker.since)}`,
          card.blocker.owner,
        ]
          .filter(Boolean)
          .join(' · ')
      : undefined,
    customers: card.customers,
    people: card.assignees,
    progress:
      card.progress && card.progress.total > 0
        ? {
            label: progressLabel(card.progress),
            percent: progressPercent(card.progress),
          }
        : undefined,
    at: card.updatedAt,
    tryIt: card.tryIt,
    background: background(card.links),
    team: card.team,
  };
}

function groupItem(group: Group): FrontItem {
  const latest = group.entries
    .map(entry => entry.at)
    .sort()
    .pop();
  const people = [
    ...new Set(group.entries.flatMap(entry => entry.author ?? [])),
  ];
  const stories = group.entries.length;
  return {
    key: group.key,
    title: group.title,
    teaser: group.teaser,
    target: epicTarget([group.url], group.url ?? ''),
    status:
      stories > 0
        ? { label: `${stories} ${stories === 1 ? 'story' : 'stories'}` }
        : undefined,
    customers: group.customers,
    people,
    progress:
      group.progress && group.progress.to.total > 0
        ? {
            label: progressMoveLabel(group.progress),
            percent: progressPercent(group.progress.to),
          }
        : undefined,
    at: latest,
    tryIt: group.tryIt,
    background: background(group.entries.flatMap(entry => entry.links)),
  };
}

function planItem(plan: PlanCard): FrontItem {
  // An open plan is reviewed in place; a merged one is read where it lives.
  const pull = plan.state === 'merged' ? undefined : planPull(plan.url);
  return {
    key: plan.key,
    title: plan.title,
    teaser: plan.openQuestion ?? plan.epic?.title ?? '',
    target: pull ? { kind: 'pr', ...pull } : { kind: 'url', url: plan.url },
    status: { label: PLAN_STATE_LABELS[plan.state] },
    customers: [],
    people: [],
    at: plan.updatedAt,
    background: [],
  };
}

function entryItem(entry: Entry): FrontItem {
  return {
    key: entry.key,
    title: entry.title,
    teaser: entry.teaser ?? entry.repo,
    target: { kind: 'url', url: entry.url },
    status: { label: teamName(entry.team ?? '') },
    customers: entry.customers,
    people: entry.author ? [entry.author] : [],
    at: entry.at,
    background: [],
    team: entry.team,
  };
}

// --- Sections ---------------------------------------------------------------

/** Plans in the order they need someone: review first, then draft, grilling. */
const PLAN_NEED: PlanCard['state'][] = ['review', 'draft', 'grilling'];

function plansWaiting(plans: PlanCard[]): FrontItem[] {
  return plans
    .filter(plan => plan.state !== 'merged')
    .sort(
      (a, b) =>
        PLAN_NEED.indexOf(a.state) - PLAN_NEED.indexOf(b.state) ||
        b.updatedAt.localeCompare(a.updatedAt),
    )
    .map(planItem);
}

function plansMergedSince(plans: PlanCard[], from: string): FrontItem[] {
  return plans
    .filter(plan => plan.state === 'merged' && plan.updatedAt >= from)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(planItem);
}

function section(
  id: SectionId,
  description: string,
  items: FrontItem[],
  empty: string,
  extra: Partial<FrontSection> = {},
): FrontSection {
  return {
    id,
    title: SECTION_TITLES[id],
    description,
    items,
    blocked: [],
    empty,
    ...extra,
  };
}

/** Now: what is open, ranked, with what blocks it and what waits on review. */
export function nowSections(now: Now): FrontSection[] {
  const lane = (id: MagazineClass) =>
    now.lanes.find(candidate => candidate.id === id);
  const cards = (id: MagazineClass) => (lane(id)?.cards ?? []).map(cardItem);
  const blockedIn = (ids: MagazineClass[]) =>
    now.blocked.filter(card => ids.includes(card.class)).map(cardItem);

  return [
    section(
      'customers',
      lane('customer')?.summary ?? 'What customers asked for.',
      cards('customer'),
      'Nothing open for customers.',
      { blocked: blockedIn(['customer']) },
    ),
    section(
      'top-epics',
      lane('top-epic')?.summary ?? 'The epics the team leads with.',
      cards('top-epic'),
      'No top epic is open.',
      { blocked: blockedIn(['top-epic']) },
    ),
    section(
      'setup',
      'Installations, the lab and the small fixes that keep things tidy.',
      [...cards('setup'), ...cards('chore')],
      'No setup work or chores are open.',
      { blocked: blockedIn(['setup', 'chore']) },
    ),
    section(
      'plans',
      'Plans being grilled, drafted or waiting for review.',
      plansWaiting(now.reviews),
      'No plan waits on the team.',
    ),
    section(
      'other-teams',
      'What other teams start next.',
      now.upcoming.map(cardItem),
      'Nothing announced by other teams.',
    ),
  ];
}

/** A window: what moved, epic by epic, and the plans it merged. */
export function windowSections(
  history: History,
  plans: PlanCard[],
): FrontSection[] {
  const groups = (ids: MagazineClass[]) =>
    history.groups.filter(group => ids.includes(group.class)).map(groupItem);
  const entries = history.groups.flatMap(group => group.entries);
  const outside = history.highlights.outsideTeam.flatMap(highlight =>
    highlight.keys.flatMap(key => {
      const entry = entries.find(candidate => candidate.key === key);
      return entry ? [entryItem({ ...entry, team: highlight.team })] : [];
    }),
  );
  const { count, repos } = history.chores;

  return [
    section(
      'customers',
      'What customers got.',
      groups(['customer']),
      'Nothing moved for customers.',
    ),
    section(
      'top-epics',
      'How far the top epics moved.',
      groups(['top-epic']),
      'No top epic moved.',
    ),
    section(
      'setup',
      'Installations, the lab and the chores.',
      groups(['setup', 'chore']),
      'No setup work moved.',
      {
        footnote:
          count > 0
            ? `Plus ${count} chores across ${repos} repositories.`
            : undefined,
      },
    ),
    section(
      'plans',
      'Plans merged in the window.',
      plansMergedSince(plans, history.from),
      'No plan was merged in the window.',
    ),
    section(
      'other-teams',
      'Work by other teams that touched ours.',
      outside,
      'Nothing from other teams.',
    ),
  ];
}

/** The sections narrowed to the items a search matches; blockers too. */
export function searchSections(
  sections: FrontSection[],
  query: string,
): FrontSection[] {
  if (!query.trim()) {
    return sections;
  }
  const matches = (item: FrontItem) =>
    matchesSearch(query, [item.title, item.teaser, ...item.customers]);
  return sections.map(current => ({
    ...current,
    items: current.items.filter(matches),
    blocked: current.blocked.filter(matches),
    footnote: undefined,
    empty: 'Nothing here matches the search.',
  }));
}

// --- The epic pane ------------------------------------------------------------

/** Everything the page knows about one board item, from both sources. */
export interface EpicDetail {
  card?: MagazineCard;
  group?: Group;
}

/** The card and the history group of the board item `?item=` names. */
export function findEpic(
  id: string,
  now: Now | undefined,
  history: History | undefined,
): EpicDetail {
  const cards = now
    ? [...now.lanes.flatMap(lane => lane.cards), ...now.upcoming]
    : [];
  const card = cards.find(
    candidate => boardItemId(candidate.links.map(link => link.url)) === id,
  );
  const group = history?.groups.find(
    candidate =>
      boardItemId([candidate.url]) === id ||
      (card !== undefined && candidate.key === card.key),
  );
  return { card, group };
}
