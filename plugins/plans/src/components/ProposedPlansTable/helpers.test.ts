import { PlanPullRow, sortPullsBy } from './helpers';

function row(
  overrides: Partial<PlanPullRow> & { number: number },
): PlanPullRow {
  return {
    id: overrides.number,
    title: `Plan ${overrides.number}`,
    author: 'someone',
    draft: false,
    body: '',
    ...overrides,
  };
}

const rows: PlanPullRow[] = [
  row({
    number: 10,
    title: 'Beta',
    author: 'zoe',
    updatedAt: '2026-09-01T00:00:00Z',
  }),
  row({
    number: 2,
    title: 'Alpha',
    author: 'adam',
    draft: true,
    updatedAt: '2026-09-15T00:00:00Z',
  }),
  row({ number: 7, title: 'Gamma', author: undefined, updatedAt: undefined }),
];

const numbers = (sorted: PlanPullRow[]) => sorted.map(r => r.number);

describe('sortPullsBy', () => {
  it('sorts the pull number numerically, not as a string', () => {
    // '10' < '2' as strings; the column has to compare the numbers.
    expect(
      numbers(sortPullsBy(rows, { column: 'number', direction: 'ascending' })),
    ).toEqual([2, 7, 10]);
    expect(
      numbers(sortPullsBy(rows, { column: 'number', direction: 'descending' })),
    ).toEqual([10, 7, 2]);
  });

  it('sorts by parsed time, newest first when descending', () => {
    expect(
      numbers(
        sortPullsBy(rows, { column: 'updatedAt', direction: 'descending' }),
      ),
    ).toEqual([2, 10, 7]);
  });

  it('keeps rows with no timestamp last in both directions', () => {
    // "Unknown" is not "oldest": flipping the direction must not float the row
    // with no `updatedAt` to the top.
    expect(
      numbers(
        sortPullsBy(rows, { column: 'updatedAt', direction: 'ascending' }),
      ),
    ).toEqual([10, 2, 7]);
    expect(
      numbers(
        sortPullsBy(rows, { column: 'updatedAt', direction: 'descending' }),
      ),
    ).toEqual([2, 10, 7]);
  });

  it('groups drafts by the boolean rather than the rendered label', () => {
    expect(
      numbers(sortPullsBy(rows, { column: 'draft', direction: 'descending' })),
    ).toEqual([2, 10, 7]);
  });

  it('sorts text columns alphabetically, missing values first when ascending', () => {
    expect(
      numbers(sortPullsBy(rows, { column: 'title', direction: 'ascending' })),
    ).toEqual([2, 10, 7]);
    // The row with no author sorts as an empty string.
    expect(
      numbers(sortPullsBy(rows, { column: 'author', direction: 'ascending' })),
    ).toEqual([7, 2, 10]);
  });

  it('sorts authors by the name shown, not the login behind it', () => {
    // `zoe` displays as "Anna Zoe": sorting on the login would put her last
    // ascending, in a position the reader cannot explain from the screen.
    const named = [
      row({ number: 1, author: 'zoe' }),
      row({ number: 2, author: 'adam' }),
    ];
    const displayName = (login: string) =>
      ({ zoe: 'Anna Zoe', adam: 'Zach Adam' })[login] ?? login;

    expect(
      numbers(
        sortPullsBy(
          named,
          { column: 'author', direction: 'ascending' },
          displayName,
        ),
      ),
    ).toEqual([1, 2]);
    // Without the resolver it falls back to the login, so the order flips.
    expect(
      numbers(sortPullsBy(named, { column: 'author', direction: 'ascending' })),
    ).toEqual([2, 1]);
  });

  it('breaks ties on the pull number so the order is total', () => {
    const tied = [
      row({ number: 3, title: 'Same', updatedAt: '2026-09-01T00:00:00Z' }),
      row({ number: 9, title: 'Same', updatedAt: '2026-09-01T00:00:00Z' }),
    ];
    expect(
      numbers(
        sortPullsBy(tied, { column: 'updatedAt', direction: 'ascending' }),
      ),
    ).toEqual([9, 3]);
    expect(
      numbers(sortPullsBy(tied, { column: 'title', direction: 'ascending' })),
    ).toEqual([9, 3]);
  });

  it('does not mutate the rows it is given', () => {
    const original = [...rows];
    sortPullsBy(rows, { column: 'number', direction: 'ascending' });
    expect(rows).toEqual(original);
  });
});
