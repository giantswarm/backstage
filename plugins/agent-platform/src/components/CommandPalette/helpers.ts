import type { AgentRow } from '../AgentsDataProvider';

/** What the palette's filter chips narrow the results to. */
export type PaletteFilter =
  'all' | 'sessions' | 'agents' | 'skills' | 'connectors';

export type PaletteGroupId = Exclude<PaletteFilter, 'all'>;

/** The chip row, in display order. */
export const PALETTE_FILTERS: { id: PaletteFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'agents', label: 'Agents' },
  { id: 'skills', label: 'Skills' },
  { id: 'connectors', label: 'Connectors' },
];

/** The groups in display order, with the label each is headed by. */
export const PALETTE_GROUPS: { id: PaletteGroupId; label: string }[] = [
  { id: 'sessions', label: 'Sessions' },
  { id: 'agents', label: 'Agents' },
  { id: 'skills', label: 'Skills' },
  { id: 'connectors', label: 'Connectors' },
];

/** One row the palette can open. */
export type PaletteEntry = {
  /** Stable unique id, also the listbox option's DOM id suffix. */
  id: string;
  title: string;
  /** One line under the title (an agent's description, a session's agent). */
  description?: string;
  /** Right-aligned metadata (installation, source repo, date). */
  meta?: string;
  /** Where Enter (or a click) goes. */
  href: string;
  /**
   * Set on agent entries: ⌘↵ / Ctrl+Enter starts a new session with this
   * agent instead of opening its page.
   */
  agent?: AgentRow;
};

/** A {@link PaletteEntry} plus the text the query is matched against. */
export type PaletteCandidate = PaletteEntry & {
  haystack: (string | undefined)[];
};

export type PaletteGroup = {
  id: PaletteGroupId;
  label: string;
  entries: PaletteEntry[];
  /** Matches beyond the cap, said as "+N more" rather than listed. */
  moreCount: number;
};

/** Most rows one group lists; the rest becomes the group's "+N more". */
export const PALETTE_GROUP_CAP = 5;

/**
 * Most rows a group lists while its own chip is on: narrowing to one kind is
 * asking to see more of it, but still a bounded list — past this, "+N more"
 * opens the kind's own list with the query.
 */
export const PALETTE_SINGLE_GROUP_CAP = 50;

/** The row cap for a chip: a few per group under All, more for one group. */
export function paletteGroupCap(filter: PaletteFilter): number {
  return filter === 'all' ? PALETTE_GROUP_CAP : PALETTE_SINGLE_GROUP_CAP;
}

/**
 * The chips worth offering: one per group that has anything in it at all
 * (whatever the query), led by All — and none when at most one group does,
 * since a chip row over a single kind narrows nothing. The active chip stays
 * even if its group emptied, so it can be switched off.
 */
export function visiblePaletteFilters(
  candidates: Partial<Record<PaletteGroupId, unknown[]>>,
  active: PaletteFilter,
): typeof PALETTE_FILTERS {
  const filled = PALETTE_GROUPS.filter(
    group => (candidates[group.id]?.length ?? 0) > 0,
  ).map(group => group.id);
  if (filled.length < 2 && active === 'all') {
    return [];
  }
  return PALETTE_FILTERS.filter(
    chip =>
      chip.id === 'all' ||
      chip.id === active ||
      filled.includes(chip.id as PaletteGroupId),
  );
}

/** Case-insensitive substring match over the candidate's text fields. */
export function matchesQuery(
  query: string,
  haystack: (string | undefined)[],
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return haystack.some(text => (text ?? '').toLowerCase().includes(needle));
}

/**
 * The groups the palette shows for a query and a chip: fixed group order,
 * matches capped per group with the overflow counted, empty groups dropped.
 */
export function buildPaletteGroups(
  candidates: Partial<Record<PaletteGroupId, PaletteCandidate[]>>,
  query: string,
  filter: PaletteFilter,
  cap: number = paletteGroupCap(filter),
): PaletteGroup[] {
  return PALETTE_GROUPS.filter(
    group => filter === 'all' || group.id === filter,
  ).flatMap(group => {
    const matches = (candidates[group.id] ?? []).filter(candidate =>
      matchesQuery(query, candidate.haystack),
    );
    if (matches.length === 0) {
      return [];
    }
    return [
      {
        id: group.id,
        label: group.label,
        entries: matches.slice(0, cap).map(({ haystack, ...entry }) => entry),
        moreCount: Math.max(0, matches.length - cap),
      },
    ];
  });
}

/**
 * The classic search page, queried — the palette's way out to everything the
 * portal indexes (catalog, TechDocs) beyond the agent area's own data.
 */
export function portalSearchHref(query: string): string {
  return `/search?query=${encodeURIComponent(query.trim())}`;
}

/** ⌘K / Ctrl+K and nothing else — no Shift/Alt chords, no plain K. */
export function isPaletteHotkey(event: KeyboardEvent): boolean {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.shiftKey &&
    !event.altKey &&
    event.key.toLowerCase() === 'k'
  );
}

/**
 * Whether the key event originates in something that takes typing — an
 * input, a textarea, a select or a contenteditable region. The palette's
 * global hotkey must never fire there.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
