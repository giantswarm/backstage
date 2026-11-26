import { rowOf, type PrState } from '../../lib/github';
import { sortPrRows } from './PrTable';

const row = (number: number, merge?: PrState['merge']['state']) => ({
  ...rowOf({
    number,
    title: `PR ${number}`,
    html_url: `https://github.com/giantswarm/x/pull/${number}`,
    user: { login: 'a' },
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    repository_url: 'https://api.github.com/repos/giantswarm/x',
  }),
  requested: [],
  state: merge
    ? {
        state: {
          ci: { state: 'passing', failing: [], running: 0, total: 1 },
          review: { state: 'none', approvals: 0, changesBy: [] },
          merge: { state: merge, raw: undefined },
        } as PrState,
        isLoading: false,
        error: null,
      }
    : undefined,
});

describe('sortPrRows', () => {
  it('puts rows without a state last, in either direction', () => {
    const rows = [row(1), row(2, 'conflicts'), row(3, 'ready')];
    const numbers = (direction: 'ascending' | 'descending') =>
      sortPrRows(rows, { column: 'merge', direction }).map(r => r.number);
    expect(numbers('ascending')).toEqual([2, 3, 1]);
    expect(numbers('descending')).toEqual([3, 2, 1]);
  });
});
