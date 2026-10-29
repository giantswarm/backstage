import {
  buildPaletteGroups,
  isEditableTarget,
  isPaletteHotkey,
  matchesQuery,
  PALETTE_GROUP_CAP,
  PALETTE_SINGLE_GROUP_CAP,
  visiblePaletteFilters,
  type PaletteCandidate,
} from './helpers';

function candidate(
  id: string,
  title: string,
  ...haystack: (string | undefined)[]
): PaletteCandidate {
  return { id, title, href: `/x/${id}`, haystack: [title, ...haystack] };
}

describe('matchesQuery', () => {
  it('matches case-insensitively over every field', () => {
    expect(matchesQuery('sso', ['Which customers asked about SSO?'])).toBe(
      true,
    );
    expect(matchesQuery('SSO', ['nothing', 'the sso faq'])).toBe(true);
    expect(matchesQuery('sso', ['billing', undefined])).toBe(false);
  });

  it('matches everything on an empty or whitespace query', () => {
    expect(matchesQuery('', ['anything'])).toBe(true);
    expect(matchesQuery('   ', ['anything'])).toBe(true);
  });
});

describe('buildPaletteGroups', () => {
  const candidates = {
    sessions: [
      candidate('s1', 'SSO tickets this month'),
      candidate('s2', 'Release notes'),
    ],
    agents: [candidate('a1', 'Support Triage', 'Login and SSO topics')],
    skills: [candidate('k1', 'Ticket triage', 'route a ticket')],
    connectors: [candidate('c1', 'confluence')],
  };

  it('groups the matches in fixed order and drops empty groups', () => {
    const groups = buildPaletteGroups(candidates, 'sso', 'all');
    expect(groups.map(group => group.id)).toEqual(['sessions', 'agents']);
    expect(groups[0].entries.map(entry => entry.id)).toEqual(['s1']);
    expect(groups[1].entries.map(entry => entry.id)).toEqual(['a1']);
  });

  it('narrows to the chip’s group', () => {
    const groups = buildPaletteGroups(candidates, '', 'connectors');
    expect(groups.map(group => group.id)).toEqual(['connectors']);
  });

  it('caps each group and counts the overflow', () => {
    const many = {
      sessions: Array.from({ length: 7 }, (_, i) =>
        candidate(`s${i}`, `Session ${i}`),
      ),
    };
    const [group] = buildPaletteGroups(many, '', 'all', 5);
    expect(group.entries).toHaveLength(5);
    expect(group.moreCount).toBe(2);
  });

  it('lists more rows while one group’s chip is on', () => {
    const many = {
      sessions: Array.from({ length: 300 }, (_, i) =>
        candidate(`s${i}`, `Session ${i}`),
      ),
    };
    const [underAll] = buildPaletteGroups(many, '', 'all');
    expect(underAll.entries).toHaveLength(PALETTE_GROUP_CAP);
    expect(underAll.moreCount).toBe(300 - PALETTE_GROUP_CAP);

    const [alone] = buildPaletteGroups(many, '', 'sessions');
    expect(alone.entries).toHaveLength(PALETTE_SINGLE_GROUP_CAP);
    expect(alone.moreCount).toBe(300 - PALETTE_SINGLE_GROUP_CAP);
  });

  it('strips the haystack off the entries it returns', () => {
    const [group] = buildPaletteGroups(candidates, 'release', 'all');
    expect(group.entries[0]).not.toHaveProperty('haystack');
  });
});

describe('isPaletteHotkey', () => {
  const event = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

  it.each([
    ['⌘K', { key: 'k', metaKey: true }],
    ['Ctrl+K', { key: 'k', ctrlKey: true }],
    ['⌘K with caps', { key: 'K', metaKey: true }],
  ])('recognises %s', (_, init) => {
    expect(isPaletteHotkey(event(init))).toBe(true);
  });

  it.each([
    ['a plain k', { key: 'k' }],
    ['⌘⇧K', { key: 'k', metaKey: true, shiftKey: true }],
    ['⌥⌘K', { key: 'k', metaKey: true, altKey: true }],
    ['⌘J', { key: 'j', metaKey: true }],
  ])('ignores %s', (_, init) => {
    expect(isPaletteHotkey(event(init))).toBe(false);
  });
});

describe('isEditableTarget', () => {
  it.each(['input', 'textarea', 'select'])('is true for a %s', tag => {
    expect(isEditableTarget(document.createElement(tag))).toBe(true);
  });

  it('is true for a contenteditable region', () => {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    // jsdom does not compute isContentEditable from the attribute.
    Object.defineProperty(div, 'isContentEditable', { value: true });
    expect(isEditableTarget(div)).toBe(true);
  });

  it('is false for a button, the body and a null target', () => {
    expect(isEditableTarget(document.createElement('button'))).toBe(false);
    expect(isEditableTarget(document.body)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe('visiblePaletteFilters', () => {
  const one = [candidate('x', 'x')];
  const ids = (chips: { id: string }[]) => chips.map(chip => chip.id);

  it('offers All plus a chip per kind that has entries', () => {
    expect(
      ids(
        visiblePaletteFilters(
          { sessions: one, agents: one, skills: [] },
          'all',
        ),
      ),
    ).toEqual(['all', 'sessions', 'agents']);
  });

  it('offers no chips while at most one kind has entries', () => {
    expect(visiblePaletteFilters({ sessions: one }, 'all')).toEqual([]);
    expect(visiblePaletteFilters({}, 'all')).toEqual([]);
  });

  it('keeps the active chip even when its kind emptied', () => {
    expect(
      ids(visiblePaletteFilters({ sessions: one, skills: [] }, 'skills')),
    ).toEqual(['all', 'sessions', 'skills']);
  });
});
