import { matchesQuery, tokenize } from './workflowSearch';

describe('tokenize', () => {
  it('lowercases and splits on non-alphanumeric boundaries', () => {
    expect(tokenize('Dex-Error_rate 2')).toEqual(['dex', 'error', 'rate', '2']);
  });

  it('drops empty tokens from leading/trailing separators', () => {
    expect(tokenize('  -foo--bar-  ')).toEqual(['foo', 'bar']);
  });
});

describe('matchesQuery', () => {
  it('matches a query token at a token boundary', () => {
    expect(matchesQuery('dex', 'dex-error-rate')).toBe(true);
  });

  it('matches by prefix within a token', () => {
    expect(matchesQuery('err', 'dex-error-rate')).toBe(true);
  });

  it('does not match inside a token (F3: "dex" must not match "index")', () => {
    expect(matchesQuery('dex', 'loki-request-errors index_stats')).toBe(false);
  });

  it('requires every query token to match (AND semantics)', () => {
    expect(matchesQuery('dex error', 'dex-error-rate')).toBe(true);
    expect(matchesQuery('dex missing', 'dex-error-rate')).toBe(false);
  });

  it('treats a blank query as matching everything', () => {
    expect(matchesQuery('   ', 'anything')).toBe(true);
  });
});
