import type { AgentRow } from '../AgentsDataProvider';
import { matchRank } from './matching';

/** What the palette's filter chips narrow the results to. */
export type PaletteFilter =
  | 'all'
  | 'sessions'
  | 'agents'
  | 'skills'
  | 'connectors'
  | 'models'
  | 'workflows';

export type PaletteGroupId = Exclude<PaletteFilter, 'all'>;

/** The chip row, in display order. */
export const PALETTE_FILTERS: { id: PaletteFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'agents', label: 'Agents' },
  { id: 'skills', label: 'Skills' },
  { id: 'connectors', label: 'Connectors' },
  { id: 'models', label: 'Models' },
  { id: 'workflows', label: 'Workflows' },
];

/** The groups in display order, with the label each is headed by. */
export const PALETTE_GROUPS: { id: PaletteGroupId; label: string }[] = [
  { id: 'sessions', label: 'Sessions' },
  { id: 'agents', label: 'Agents' },
  { id: 'skills', label: 'Skills' },
  { id: 'connectors', label: 'Connectors' },
  { id: 'models', label: 'Models' },
  { id: 'workflows', label: 'Workflows' },
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
  /**
   * What the entry is called (its title, a technical name): ranked first, and
   * matched with one typo too (`matchRank`).
   */
  names: (string | undefined)[];
  /** Other text it is found by (a description), matched as written. */
  details?: (string | undefined)[];
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

/** One chip of the row. */
export type PaletteChip = {
  id: PaletteFilter;
  label: string;
  /**
   * Shown but not yet usable: its kind is still being read, or turned out
   * empty while others are still being read.
   */
  isDisabled: boolean;
};

/** What the chip row needs to know of one kind. */
export type PaletteKindStatus = {
  /** Entries of the kind, whatever the query. */
  count: number;
  /** Whether the kind is still being read. */
  isLoading: boolean;
};

/**
 * The chip row (T11, T39). A kind missing from `kinds` cannot be searched at
 * all (its page is not routed) and never gets a chip.
 *
 * While any kind is still being read with nothing in it yet, the row holds
 * every kind's place: the chips do not appear one by one, and nothing moves
 * as kinds arrive. A kind with nothing (yet) is disabled.
 *
 * Once every kind is read, the row offers the kinds that have anything at
 * all, led by All, and none when at most one kind does: a chip that filters
 * down to nothing is noise, and so is a row over a single kind. The active
 * chip stays even if its kind emptied, so it can be switched off.
 */
export function visiblePaletteFilters(
  kinds: Partial<Record<PaletteGroupId, PaletteKindStatus>>,
  active: PaletteFilter,
): PaletteChip[] {
  const available = PALETTE_GROUPS.flatMap(group => {
    const status = kinds[group.id];
    return status ? [{ id: group.id, ...status }] : [];
  });
  const isReading = available.some(kind => kind.count === 0 && kind.isLoading);

  if (isReading) {
    if (available.length < 2) {
      return [];
    }
    return PALETTE_FILTERS.filter(
      chip => chip.id === 'all' || available.some(kind => kind.id === chip.id),
    ).map(chip => ({
      ...chip,
      isDisabled:
        chip.id !== 'all' &&
        chip.id !== active &&
        available.find(kind => kind.id === chip.id)?.count === 0,
    }));
  }

  const filled = available.filter(kind => kind.count > 0).map(kind => kind.id);
  if (filled.length < 2 && active === 'all') {
    return [];
  }
  return PALETTE_FILTERS.filter(
    chip =>
      chip.id === 'all' ||
      chip.id === active ||
      filled.includes(chip.id as PaletteGroupId),
  ).map(chip => ({ ...chip, isDisabled: false }));
}

/**
 * The groups the palette shows for a query and a chip: fixed group order,
 * matches ranked within each group (`matchRank`: exact and prefix matches
 * first, the list's own order among equals), capped per group with the
 * overflow counted, empty groups dropped.
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
    const matches = rankMatches(candidates[group.id] ?? [], query);
    if (matches.length === 0) {
      return [];
    }
    return [
      {
        id: group.id,
        label: group.label,
        entries: matches
          .slice(0, cap)
          .map(({ names, details, ...entry }) => entry),
        moreCount: Math.max(0, matches.length - cap),
      },
    ];
  });
}

/**
 * The candidates that match `query`, best match first. A blank query matches
 * all of them, in the list's own order.
 */
function rankMatches(
  candidates: PaletteCandidate[],
  query: string,
): PaletteCandidate[] {
  if (!query.trim()) {
    return candidates;
  }
  return (
    candidates
      .flatMap(candidate => {
        const rank = matchRank(query, candidate.names, candidate.details);
        return rank === undefined ? [] : [{ candidate, rank }];
      })
      // Array.prototype.sort is stable, so equals keep the list's order.
      .sort((a, b) => a.rank - b.rank)
      .map(({ candidate }) => candidate)
  );
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
