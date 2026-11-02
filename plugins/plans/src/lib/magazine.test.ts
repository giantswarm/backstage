import {
  docTitle,
  HIVE_HISTORY_WINDOW,
  isPortalPath,
  knowledgeDocs,
  Lane,
  magazineFile,
  progressLabel,
  progressMoveLabel,
  progressPercent,
  sortLanes,
  statusTone,
  visibleCards,
} from './magazine';

describe('magazine helpers', () => {
  it('names the data file of each view', () => {
    expect(magazineFile('now')).toBe('magazine/now.json');
    expect(magazineFile('weeks')).toBe('magazine/history-weeks.json');
  });

  it('reads the three weeks of history', () => {
    expect(magazineFile(HIVE_HISTORY_WINDOW)).toBe(
      'magazine/history-weeks.json',
    );
  });

  it('orders lanes by priority', () => {
    const lane = (id: Lane['id']): Lane => ({
      id,
      title: id,
      summary: '',
      total: 0,
      cards: [],
    });
    expect(
      sortLanes([
        lane('chore'),
        lane('setup'),
        lane('customer'),
        lane('top-epic'),
      ]).map(l => l.id),
    ).toEqual(['customer', 'top-epic', 'setup', 'chore']);
  });

  it('shows a preview of a lane until expanded', () => {
    const cards = [1, 2, 3, 4, 5, 6];
    expect(visibleCards(cards, false)).toEqual({
      shown: [1, 2, 3, 4],
      hidden: 2,
    });
    expect(visibleCards(cards, true)).toEqual({ shown: cards, hidden: 0 });
    expect(visibleCards([1, 2], false)).toEqual({ shown: [1, 2], hidden: 0 });
  });

  it('labels progress', () => {
    expect(progressLabel({ done: 3, total: 5 })).toBe('3 of 5 done');
    expect(
      progressMoveLabel({
        from: { done: 1, total: 5 },
        to: { done: 3, total: 5 },
      }),
    ).toBe('1 → 3 of 5 done');
    expect(progressMoveLabel({ to: { done: 3, total: 5 } })).toBe(
      '3 of 5 done',
    );
    expect(
      progressMoveLabel({
        from: { done: 3, total: 5 },
        to: { done: 3, total: 5 },
      }),
    ).toBe('3 of 5 done');
    expect(progressPercent({ done: 1, total: 3 })).toBe(33);
    expect(progressPercent({ done: 0, total: 0 })).toBe(0);
    expect(progressPercent({ done: 7, total: 5 })).toBe(100);
  });

  it('tells portal paths from external URLs', () => {
    expect(isPortalPath('/roadmap/items/1')).toBe(true);
    expect(isPortalPath('//evil.example')).toBe(false);
    expect(isPortalPath('https://github.com/x/y')).toBe(false);
  });

  it('keeps the accent for blockers and reviews', () => {
    expect(statusTone('Blocked / Waiting')).toBe('warning');
    expect(statusTone('Validation')).toBe('warning');
    expect(statusTone('In Progress')).toBe('info');
    expect(statusTone('Done')).toBe('success');
    expect(statusTone('Up Next')).toBe('neutral');
    expect(statusTone(undefined)).toBe('neutral');
  });

  it('lists knowledge documents by category', () => {
    const docs = knowledgeDocs([
      { path: 'knowledge/product/overview.md', type: 'blob' },
      { path: 'knowledge/product', type: 'tree' },
      { path: 'knowledge/architecture/data-flow.md', type: 'blob' },
      {
        path: 'knowledge/decisions/2026-09-01-0900-adr-data-branch.md',
        type: 'blob',
      },
      { path: 'knowledge/decisions/2026-10-01-pdr-lanes.md', type: 'blob' },
      { path: 'knowledge/decisions/.template.md', type: 'blob' },
      { path: 'knowledge/other/x.md', type: 'blob' },
      { path: 'knowledge/product/diagram.png', type: 'blob' },
      { path: 'README.md', type: 'blob' },
    ]);
    expect(docs.product).toEqual([
      { path: 'knowledge/product/overview.md', title: 'Overview' },
    ]);
    expect(docs.architecture.map(d => d.title)).toEqual(['Data flow']);
    expect(docs.decisions.map(d => d.title)).toEqual([
      'PDR: Lanes (2026-10-01)',
      'ADR: Data branch (2026-09-01)',
    ]);
  });

  it('titles documents from file names', () => {
    expect(docTitle('team_outcomes.md')).toBe('Team outcomes');
    expect(docTitle('2026-10-01-0900-adr-data-branch.md')).toBe(
      'ADR: Data branch (2026-10-01)',
    );
  });
});
