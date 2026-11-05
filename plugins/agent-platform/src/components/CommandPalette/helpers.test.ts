import {
  buildPaletteGroups,
  isEditableTarget,
  isPaletteHotkey,
  PALETTE_GROUP_CAP,
  PALETTE_SINGLE_GROUP_CAP,
  visiblePaletteFilters,
  type PaletteCandidate,
} from './helpers';

function candidate(
  id: string,
  title: string,
  ...details: (string | undefined)[]
): PaletteCandidate {
  return { id, title, href: `/x/${id}`, names: [title], details };
}

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

  it('strips the matched text off the entries it returns', () => {
    const [group] = buildPaletteGroups(candidates, 'release', 'all');
    expect(group.entries[0]).not.toHaveProperty('names');
    expect(group.entries[0]).not.toHaveProperty('details');
  });

  it.each([
    'swarmoperator',
    'swarm-operator',
    'Swarm Operator',
    'swarm_operator',
  ])('finds the Swarm Operator agent for “%s”', query => {
    const [group] = buildPaletteGroups(
      {
        agents: [
          candidate('a0', 'Support Triage'),
          candidate('a1', 'Swarm Operator', 'Operates the swarm'),
        ],
      },
      query,
      'all',
    );
    expect(group.entries.map(entry => entry.id)).toEqual(['a1']);
  });

  it('ranks exact, then prefix, then word, then inside, then description, then typo', () => {
    const agents = [
      // Listed in the reverse of the expected order, so the ranking, not the
      // list's own order, is what puts them right.
      candidate('typo', 'Deplyo bot'),
      candidate('detail', 'Release helper', 'Helps you deploy'),
      candidate('inside', 'Autodeploy'),
      candidate('word', 'Cluster Deploy checker'),
      candidate('prefix', 'Deploy Manager'),
      candidate('exact', 'deploy'),
    ];
    const [group] = buildPaletteGroups({ agents }, 'deploy', 'agents');
    expect(group.entries.map(entry => entry.id)).toEqual([
      'exact',
      'prefix',
      'word',
      'inside',
      'detail',
      'typo',
    ]);
  });

  it('keeps the list’s own order among equal matches and on a blank query', () => {
    const sessions = [
      candidate('newer', 'Deploy the gateway'),
      candidate('older', 'Deploy the cache'),
    ];
    const ids = (query: string) =>
      buildPaletteGroups({ sessions }, query, 'all')[0].entries.map(
        entry => entry.id,
      );
    expect(ids('deploy')).toEqual(['newer', 'older']);
    expect(ids('')).toEqual(['newer', 'older']);
  });

  it('caps the ranked list, so the best matches are the ones shown', () => {
    const agents = [
      ...Array.from({ length: 6 }, (_, i) =>
        candidate(`d${i}`, `Agent ${i}`, 'Keeps the swarm operator busy'),
      ),
      candidate('so', 'Swarm Operator'),
    ];
    const [group] = buildPaletteGroups({ agents }, 'swarm operator', 'all');
    expect(group.entries[0].id).toBe('so');
    expect(group.moreCount).toBe(2);
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
  const ids = (chips: { id: string }[]) => chips.map(chip => chip.id);
  const disabled = (chips: { id: string; isDisabled: boolean }[]) =>
    chips.filter(chip => chip.isDisabled).map(chip => chip.id);
  const read = (count: number) => ({ count, isLoading: false });
  const reading = (count = 0) => ({ count, isLoading: true });

  describe('once every kind is read', () => {
    it('offers All plus a chip per kind that has entries', () => {
      const chips = visiblePaletteFilters(
        { sessions: read(1), agents: read(1), skills: read(0) },
        'all',
      );
      expect(ids(chips)).toEqual(['all', 'sessions', 'agents']);
      expect(disabled(chips)).toEqual([]);
    });

    it('offers no chips while at most one kind has entries', () => {
      expect(
        visiblePaletteFilters({ sessions: read(1), skills: read(0) }, 'all'),
      ).toEqual([]);
      expect(visiblePaletteFilters({}, 'all')).toEqual([]);
    });

    it('keeps the active chip even when its kind emptied', () => {
      expect(
        ids(
          visiblePaletteFilters(
            { sessions: read(1), skills: read(0) },
            'skills',
          ),
        ),
      ).toEqual(['all', 'sessions', 'skills']);
    });
  });

  describe('while kinds are still read (T11)', () => {
    it('holds every kind’s place from the start, all but All disabled', () => {
      const chips = visiblePaletteFilters(
        {
          sessions: reading(),
          agents: reading(),
          skills: reading(),
          models: reading(),
        },
        'all',
      );
      expect(ids(chips)).toEqual([
        'all',
        'sessions',
        'agents',
        'skills',
        'models',
      ]);
      expect(disabled(chips)).toEqual([
        'sessions',
        'agents',
        'skills',
        'models',
      ]);
    });

    it('enables a kind as it arrives, without moving any chip', () => {
      const before = visiblePaletteFilters(
        { sessions: reading(), agents: reading(), skills: reading() },
        'all',
      );
      const after = visiblePaletteFilters(
        { sessions: read(3), agents: reading(), skills: reading() },
        'all',
      );
      expect(ids(after)).toEqual(ids(before));
      expect(disabled(after)).toEqual(['agents', 'skills']);
    });

    it('keeps a kind that came back empty in place, disabled, until the rest is read', () => {
      const chips = visiblePaletteFilters(
        { sessions: read(3), agents: reading(), skills: read(0) },
        'all',
      );
      expect(ids(chips)).toEqual(['all', 'sessions', 'agents', 'skills']);
      expect(disabled(chips)).toEqual(['agents', 'skills']);
    });

    it('drops the empty kinds in one go once the last kind is read', () => {
      const chips = visiblePaletteFilters(
        { sessions: read(3), agents: read(2), skills: read(0) },
        'all',
      );
      expect(ids(chips)).toEqual(['all', 'sessions', 'agents']);
    });

    it('counts a kind that has entries while it reads more as arrived', () => {
      const chips = visiblePaletteFilters(
        { sessions: reading(20), agents: read(2), skills: read(0) },
        'all',
      );
      // Nothing still reading with nothing in it: the row is settled.
      expect(ids(chips)).toEqual(['all', 'sessions', 'agents']);
      expect(disabled(chips)).toEqual([]);
    });

    it('offers no chips over a single searchable kind, even while it reads', () => {
      expect(visiblePaletteFilters({ sessions: reading() }, 'all')).toEqual([]);
    });

    it('never gives a kind that cannot be searched a chip', () => {
      const chips = visiblePaletteFilters(
        { sessions: reading(), agents: reading() },
        'all',
      );
      expect(ids(chips)).toEqual(['all', 'sessions', 'agents']);
    });
  });
});
