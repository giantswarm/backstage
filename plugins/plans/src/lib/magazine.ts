/**
 * The product magazine's data contract (v1): the JSON the magazine
 * repository's refresh workflow writes to `magazine/*.json` on its data
 * branch, and the pure helpers the Magazine page renders it with.
 */

export type MagazineClass = 'customer' | 'top-epic' | 'setup' | 'chore';

export type ItemKind =
  'rock' | 'epic' | 'feature' | 'story' | 'task' | 'bug' | 'request' | 'other';

export interface Ref {
  key: string;
  title: string;
  url: string;
}

/** `url` is absolute, or a portal path starting with "/". */
export interface MagazineLink {
  label: string;
  url: string;
}

export interface Progress {
  done: number;
  total: number;
}

export interface PlanCard {
  key: string;
  title: string;
  url: string;
  state: 'grilling' | 'draft' | 'review' | 'merged';
  epic?: Ref;
  updatedAt: string;
  openQuestion?: string;
  portalPath?: string;
}

export interface MagazineCard {
  key: string;
  title: string;
  url: string;
  kind: ItemKind;
  status?: string;
  class: MagazineClass;
  teaser: string;
  epic?: Ref;
  rock?: Ref;
  area?: string;
  customers: string[];
  team?: string;
  progress?: Progress;
  blocker?: { reason: string; since?: string; owner?: string };
  plan?: PlanCard;
  tryIt?: MagazineLink;
  assignees: string[];
  updatedAt: string;
  links: MagazineLink[];
}

export interface Lane {
  id: MagazineClass;
  title: string;
  summary: string;
  total: number;
  cards: MagazineCard[];
}

export interface Now {
  generatedAt: string;
  summary: string[];
  lanes: Lane[];
  reviews: PlanCard[];
  blocked: MagazineCard[];
  upcoming: MagazineCard[];
}

export interface ProgressMove {
  from?: Progress;
  to: Progress;
}

export interface Entry {
  key: string;
  title: string;
  url: string;
  kind: 'pr' | 'issue' | 'release' | 'epic' | 'plan';
  at: string;
  repo: string;
  class: MagazineClass;
  customers: string[];
  team?: string;
  author?: string;
  teaser?: string;
  links: MagazineLink[];
  progress?: ProgressMove;
}

export interface Group {
  key: string;
  title: string;
  url?: string;
  kind: 'epic' | 'area' | 'other';
  teaser: string;
  class: MagazineClass;
  customers: string[];
  progress?: ProgressMove;
  tryIt?: MagazineLink;
  entries: Entry[];
}

export type HistoryWindow = 'days' | 'weeks' | 'months';

export interface History {
  window: HistoryWindow;
  from: string;
  to: string;
  generatedAt: string;
  summary: string[];
  stats: {
    merged: number;
    closed: number;
    released: number;
    epicsMoved: number;
  };
  groups: Group[];
  highlights: {
    customers: { name: string; keys: string[] }[];
    outsideTeam: { team: string; keys: string[] }[];
  };
  chores: { count: number; repos: number; sample: Entry[] };
}

/** Lanes render in this order whatever order the data has. */
export const CLASS_ORDER: MagazineClass[] = [
  'customer',
  'top-epic',
  'setup',
  'chore',
];

/**
 * The history Hive shows: the last 15 work days, epic by epic with the
 * issues that moved them. Three days is too short for an epic to move,
 * three months folds the stories into areas.
 */
export const HIVE_HISTORY_WINDOW: HistoryWindow = 'weeks';

/** Cards a lane shows before "show all n". */
export const LANE_PREVIEW = 4;

/** The data file of a magazine view on the data ref. */
export function magazineFile(view: 'now' | HistoryWindow): string {
  return view === 'now' ? 'magazine/now.json' : `magazine/history-${view}.json`;
}

/** Lanes in priority order (customer, top-epic, setup, chore). */
export function sortLanes(lanes: Lane[]): Lane[] {
  return [...lanes].sort(
    (a, b) => CLASS_ORDER.indexOf(a.id) - CLASS_ORDER.indexOf(b.id),
  );
}

/**
 * The cards a lane shows: the first few, or all of them once expanded. The
 * count for "show all n" is the lane's `total` when the data ranked more
 * cards than it shipped.
 */
export function visibleCards<T>(
  cards: T[],
  expanded: boolean,
  limit: number = LANE_PREVIEW,
): { shown: T[]; hidden: number } {
  if (expanded || cards.length <= limit) {
    return { shown: cards, hidden: 0 };
  }
  return { shown: cards.slice(0, limit), hidden: cards.length - limit };
}

/** "3 of 5 done". */
export function progressLabel(progress: Progress): string {
  return `${progress.done} of ${progress.total} done`;
}

/** "2 → 4 of 5 done", or the plain label when nothing moved or no start. */
export function progressMoveLabel(move: ProgressMove): string {
  const { from, to } = move;
  if (!from || (from.done === to.done && from.total === to.total)) {
    return progressLabel(to);
  }
  return `${from.done} → ${to.done} of ${to.total} done`;
}

/** Share done, 0..100, for a progress bar; 0 for an empty epic. */
export function progressPercent(progress: Progress): number {
  if (progress.total <= 0) {
    return 0;
  }
  return Math.round(
    (Math.min(progress.done, progress.total) / progress.total) * 100,
  );
}

/** A link into the portal itself, routed in-app rather than opened anew. */
export function isPortalPath(url: string): boolean {
  return url.startsWith('/') && !url.startsWith('//');
}

export type StatusTone = 'danger' | 'warning' | 'success' | 'info' | 'neutral';

/**
 * The colour of a board status. Only blockers and review requests get the
 * accent (warning); progress states stay neutral or informational.
 */
export function statusTone(status: string | undefined): StatusTone {
  const value = (status ?? '').toLowerCase();
  if (value.includes('block') || value.includes('waiting')) {
    return 'warning';
  }
  if (value.includes('review') || value.includes('validation')) {
    return 'warning';
  }
  if (value.includes('done') || value.includes('shipped')) {
    return 'success';
  }
  if (value.includes('progress')) {
    return 'info';
  }
  return 'neutral';
}

export const PLAN_STATE_LABELS: Record<PlanCard['state'], string> = {
  grilling: 'Grilling',
  draft: 'Draft',
  review: 'Needs review',
  merged: 'Merged',
};

export const ENTRY_KIND_LABELS: Record<Entry['kind'], string> = {
  pr: 'PR',
  issue: 'Issue',
  release: 'Release',
  epic: 'Epic',
  plan: 'Plan',
};

export const KNOWLEDGE_CATEGORIES = [
  { id: 'product', title: 'Product' },
  { id: 'architecture', title: 'Architecture' },
  { id: 'decisions', title: 'Decisions' },
] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number]['id'];

export interface KnowledgeDoc {
  path: string;
  title: string;
}

/**
 * Markdown documents under `knowledge/{product,architecture,decisions}/`, by
 * category, sorted by path (decision records sort by their date prefix, the
 * newest last within a day; listed newest first). Anything else in the tree
 * is ignored.
 */
export function knowledgeDocs(
  tree: { path?: string; type?: string }[],
): Record<KnowledgeCategory, KnowledgeDoc[]> {
  const result: Record<KnowledgeCategory, KnowledgeDoc[]> = {
    product: [],
    architecture: [],
    decisions: [],
  };
  for (const entry of tree) {
    const path = entry.path;
    if (entry.type !== 'blob' || !path || !/\.mdx?$/i.test(path)) {
      continue;
    }
    const [root, category, ...rest] = path.split('/');
    if (root !== 'knowledge' || rest.length === 0 || !(category in result)) {
      continue;
    }
    if (rest.some(segment => segment.startsWith('.'))) {
      continue;
    }
    result[category as KnowledgeCategory].push({
      path,
      title: docTitle(rest[rest.length - 1]),
    });
  }
  for (const docs of Object.values(result)) {
    docs.sort((a, b) => a.path.localeCompare(b.path));
  }
  result.decisions.reverse();
  return result;
}

/**
 * A readable title from a file name: `2026-10-01-0900-adr-data-branch.md`
 * becomes "ADR: Data branch (2026-10-01)", `team-outcomes.md` "Team outcomes".
 */
export function docTitle(fileName: string): string {
  const base = fileName.replace(/\.mdx?$/i, '');
  const record = base.match(/^(\d{4}-\d{2}-\d{2})(?:-\d{4})?-(adr|pdr)-(.+)$/i);
  if (record) {
    const [, date, type, slug] = record;
    return `${type.toUpperCase()}: ${sentence(slug)} (${date})`;
  }
  return sentence(base);
}

function sentence(slug: string): string {
  const words = slug.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "Oct 5" style day for history entries; empty for unparsable input. */
export function shortDay(value: string): string {
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
