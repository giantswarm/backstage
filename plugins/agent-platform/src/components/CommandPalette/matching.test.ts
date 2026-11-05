import {
  editDistance,
  foldQuery,
  FUZZY_MIN_LENGTH,
  indexForMatch,
  MATCH_RANK,
  matchRank,
} from './matching';

describe('foldQuery and indexForMatch', () => {
  it('fold case, accents, spaces, hyphens and underscores alike', () => {
    for (const query of [
      'Swarm Operator',
      'swarm-operator',
      'swarm_operator',
      'swarmoperator',
    ]) {
      expect(foldQuery(query)?.joined).toBe('swarmoperator');
    }
    expect(foldQuery('  Café  Crème ')).toEqual({
      joined: 'cafecreme',
      spaced: ' cafe creme',
    });
    expect(foldQuery(' -_ ')).toBeUndefined();
  });

  it('index a name by its word starts and its runs of whole words', () => {
    const [name] = indexForMatch(['Swarm Operator']).names;
    expect(name.joined).toBe('swarmoperator');
    expect(name.starts).toEqual(['swarmoperator', 'operator']);
    expect(name.runs).toEqual(['swarm', 'swarmoperator', 'operator']);
  });

  it('index a detail with its word boundaries kept', () => {
    expect(indexForMatch(['x'], ['Login for maintainers']).details).toEqual([
      ' login for maintainers',
    ]);
  });
});

describe('editDistance', () => {
  it('counts an insert, a delete, a substitution or a swap as one edit', () => {
    expect(editDistance('swarmoperator', 'swarmoperator', 1)).toBe(0);
    expect(editDistance('swarmoprator', 'swarmoperator', 1)).toBe(1);
    expect(editDistance('swarmooperator', 'swarmoperator', 1)).toBe(1);
    expect(editDistance('swarnoperator', 'swarmoperator', 1)).toBe(1);
    expect(editDistance('swamroperator', 'swarmoperator', 1)).toBe(1);
  });

  it('caps the distance one past the allowed edits', () => {
    expect(editDistance('kubernetes', 'swarmoperator', 1)).toBe(2);
    expect(editDistance('ab', 'abcdef', 1)).toBe(2);
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

  it('finds a description where a word starts, below every name match', () => {
    expect(matchRank('runs the fl', name, ['Runs the fleet'])).toBe(
      MATCH_RANK.detail,
    );
    expect(matchRank('fleet', name, ['Runs the fleet'])).toBe(
      MATCH_RANK.detail,
    );
    expect(matchRank('swarm', name, ['The swarm'])).toBe(MATCH_RANK.prefix);
  });

  it('does not join the words of a description, nor match inside a word', () => {
    expect(matchRank('inform', ['Agent'], ['Login for maintainers'])).toBe(
      undefined,
    );
    expect(matchRank('is a', ['Foo'], ['Runs this agent'])).toBeUndefined();
    expect(matchRank('leet', ['Foo'], ['Runs the fleet'])).toBeUndefined();
  });

  it.each(['swarmoprator', 'swamroperator', 'swarm opertor', 'oprator'])(
    'finds a name through one typo: “%s”',
    query => {
      expect(matchRank(query, name)).toBe(MATCH_RANK.fuzzy);
    },
  );

  it('finds a run of words with one typo inside a longer name', () => {
    expect(matchRank('swarmoprator', ['Swarm Operator rollout'])).toBe(
      MATCH_RANK.fuzzy,
    );
  });

  it('does not forgive two typos', () => {
    expect(matchRank('swrmoprator', name)).toBeUndefined();
  });

  it('forgives a typo against whole words only, never part of one', () => {
    expect(matchRank('tests', ['Best sellers'])).toBeUndefined();
    expect(matchRank('model', ['Modern UI'])).toBeUndefined();
    expect(matchRank('swarmopr', name)).toBeUndefined();
  });

  it('forgives no typo in a short query, which would match too much', () => {
    expect(FUZZY_MIN_LENGTH).toBe(5);
    expect(matchRank('swam', ['Swarm'])).toBeUndefined();
    expect(matchRank('tast', ['Test'])).toBeUndefined();
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
