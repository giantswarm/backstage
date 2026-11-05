import {
  FUZZY_MIN_LENGTH,
  MATCH_RANK,
  matchRank,
  normalizeForMatch,
  prefixEditDistance,
} from './matching';

describe('normalizeForMatch', () => {
  it('drops case, accents, spaces, hyphens and underscores', () => {
    expect(normalizeForMatch('Swarm Operator')).toBe('swarmoperator');
    expect(normalizeForMatch('swarm-operator')).toBe('swarmoperator');
    expect(normalizeForMatch('swarm_operator')).toBe('swarmoperator');
    expect(normalizeForMatch('  Café  Crème ')).toBe('cafecreme');
  });
});

describe('prefixEditDistance', () => {
  it('measures the needle against the nearest prefix of the target', () => {
    expect(prefixEditDistance('swarm', 'swarmoperator', 1)).toBe(0);
    expect(prefixEditDistance('swarmoprator', 'swarmoperator', 1)).toBe(1);
    expect(prefixEditDistance('swamroperator', 'swarmoperator', 1)).toBe(1);
    expect(prefixEditDistance('swarnoperator', 'swarmoperator', 1)).toBe(1);
  });

  it('caps the distance one past the allowed edits', () => {
    expect(prefixEditDistance('kubernetes', 'swarmoperator', 1)).toBe(2);
  });
});

describe('matchRank', () => {
  const name = ['Swarm Operator'];

  it.each([
    'swarmoperator',
    'Swarmoperator',
    'swarm-operator',
    'Swarm Operator',
    'swarm_operator',
    'SWARM  OPERATOR',
  ])('finds “Swarm Operator” for “%s”, as an exact match', query => {
    expect(matchRank(query, name)).toBe(MATCH_RANK.exact);
  });

  it('ranks a prefix, a later word and a substring of a name', () => {
    expect(matchRank('swarm op', name)).toBe(MATCH_RANK.prefix);
    expect(matchRank('oper', name)).toBe(MATCH_RANK.wordPrefix);
    expect(matchRank('mope', name)).toBe(MATCH_RANK.name);
  });

  it('finds a description by substring, below every name match', () => {
    expect(matchRank('runs the fleet', name, ['Runs the fleet'])).toBe(
      MATCH_RANK.detail,
    );
    expect(matchRank('swarm', name, ['The swarm'])).toBe(MATCH_RANK.prefix);
  });

  it.each(['swarmoprator', 'swamroperator', 'swarm opertor', 'oprator'])(
    'finds a name through one typo: “%s”',
    query => {
      expect(matchRank(query, name)).toBe(MATCH_RANK.fuzzy);
    },
  );

  it('does not forgive two typos', () => {
    expect(matchRank('swrmoprator', name)).toBeUndefined();
  });

  it('forgives no typo in a short query, which would match too much', () => {
    expect(FUZZY_MIN_LENGTH).toBe(5);
    expect(matchRank('swam', name)).toBeUndefined();
    expect(matchRank('test', ['Best practices'])).toBeUndefined();
  });

  it('forgives no typo in a description', () => {
    expect(matchRank('clustre', ['Agent'], ['Upgrades a cluster'])).toBe(
      undefined,
    );
  });

  it('matches everything on a blank query', () => {
    expect(matchRank('', name)).toBe(MATCH_RANK.exact);
    expect(matchRank('  -_ ', name)).toBe(MATCH_RANK.exact);
  });

  it('skips missing names and details', () => {
    expect(matchRank('swarm', [undefined, 'Swarm'], [undefined])).toBe(
      MATCH_RANK.exact,
    );
    expect(matchRank('swarm', [undefined])).toBeUndefined();
  });
});
