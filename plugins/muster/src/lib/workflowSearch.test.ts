import { searchByRelevance, searchScore, tokenize } from './workflowSearch';

describe('tokenize', () => {
  it('splits on non-alphanumeric boundaries and lowercases', () => {
    expect(tokenize('dex-error-rate-high')).toEqual([
      'dex',
      'error',
      'rate',
      'high',
    ]);
    expect(tokenize('index_stats, index-cache')).toEqual([
      'index',
      'stats',
      'index',
      'cache',
    ]);
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('searchScore', () => {
  const tokens = (q: string) => tokenize(q);

  it('matches a query token as a prefix of a name token, not mid-token', () => {
    // The F3 bug: "dex" must NOT match "index".
    expect(
      searchScore('dex-error-rate-high', '', tokens('dex')),
    ).toBeGreaterThan(0);
    expect(
      searchScore('loki-request-errors', 'index_stats', tokens('dex')),
    ).toBe(0);
    expect(
      searchScore('memcached-low-hit-ratio', 'index-cache hit', tokens('dex')),
    ).toBe(0);
  });

  it('ranks a name match above a description-only match', () => {
    const nameHit = searchScore('dex-error-rate', 'unrelated', tokens('dex'));
    const descHit = searchScore(
      'something-else',
      'dex session errors',
      tokens('dex'),
    );
    expect(nameHit).toBeGreaterThan(descHit);
    expect(descHit).toBeGreaterThan(0);
  });

  it('ranks an exact token above a prefix token', () => {
    const exact = searchScore('dex', '', tokens('dex'));
    const prefix = searchScore('dexterity', '', tokens('dex'));
    expect(exact).toBeGreaterThan(prefix);
  });

  it('requires every query token to match (AND semantics)', () => {
    expect(
      searchScore('dex-error-rate', '', tokens('dex error')),
    ).toBeGreaterThan(0);
    expect(searchScore('dex-error-rate', '', tokens('dex missing'))).toBe(0);
  });
});

describe('searchByRelevance', () => {
  const fields = (i: { name: string; description: string }) => i;
  const workflows = [
    {
      name: 'dex-error-rate-high',
      description: 'Dex authentication error rate',
    },
    { name: 'dex-token-issuance', description: 'Dex token issuance latency' },
    {
      name: 'loki-request-errors',
      description: 'Loki request errors, index_stats',
    },
    {
      name: 'memcached-low-hit-ratio',
      description: 'memcached index-cache hit ratio',
    },
  ];

  it('returns only boundary matches for "dex", excluding index-only rows', () => {
    const names = searchByRelevance(workflows, 'dex', fields).map(w => w.name);
    expect(names).toEqual(
      expect.arrayContaining(['dex-error-rate-high', 'dex-token-issuance']),
    );
    expect(names).not.toContain('loki-request-errors');
    expect(names).not.toContain('memcached-low-hit-ratio');
  });

  it('orders name matches ahead of description-only matches', () => {
    const items = [
      { name: 'other', description: 'mentions dex once' },
      { name: 'dex-workflow', description: 'no relevant words' },
    ];
    const names = searchByRelevance(items, 'dex', fields).map(w => w.name);
    expect(names[0]).toBe('dex-workflow');
  });

  it('returns the input unchanged for an empty query', () => {
    expect(searchByRelevance(workflows, '   ', fields)).toBe(workflows);
  });
});
