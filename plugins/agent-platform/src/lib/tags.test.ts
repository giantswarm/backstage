import {
  areSimilarTags,
  draftProblem,
  editDistance,
  normalizeTag,
  sameTags,
  similarExistingTag,
  suggestTags,
  tagCounts,
  tagProblem,
} from './tags';

describe('normalizeTag', () => {
  it('turns what was typed into the stored form', () => {
    expect(normalizeTag('  Marketing ')).toBe('marketing');
    expect(normalizeTag('On Call')).toBe('on-call');
    expect(normalizeTag(' On_Call! ')).toBe('on-call');
    expect(normalizeTag('a -- b')).toBe('a-b');
    expect(normalizeTag('--ops--')).toBe('ops');
    expect(normalizeTag('c++/c#')).toBe('cc');
    expect(normalizeTag('!!!')).toBe('');
  });
});

describe('tagProblem', () => {
  it('accepts lowercase words joined by single hyphens', () => {
    expect(tagProblem('util')).toBeUndefined();
    expect(tagProblem('on-call-2')).toBeUndefined();
  });

  it('refuses anything else, and tags over 63 characters', () => {
    for (const tag of ['', 'a--b', '-a', 'a-', 'a_b', 'ä']) {
      expect(tagProblem(tag)).toBe('Use letters and numbers.');
    }
    expect(tagProblem('a'.repeat(63))).toBeUndefined();
    expect(tagProblem('a'.repeat(64))).toBe('Use at most 63 characters.');
  });
});

describe('draftProblem', () => {
  it('names the first part that cannot be a tag', () => {
    expect(draftProblem('')).toBeUndefined();
    expect(draftProblem(' Util , On Call ')).toBeUndefined();
    expect(draftProblem('util, !!!')).toBe('Use letters and numbers.');
    expect(draftProblem(`${'a'.repeat(64)}`)).toBe(
      'Use at most 63 characters.',
    );
  });
});

describe('sameTags', () => {
  it('compares lists regardless of order', () => {
    expect(sameTags(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameTags(['a'], ['a', 'b'])).toBe(false);
    expect(sameTags([], [])).toBe(true);
  });
});

describe('suggestTags', () => {
  const counts = tagCounts([
    { tags: ['util', 'ops'] },
    { tags: ['util', 'marketing'] },
    { tags: ['ops', 'util', 'util'] },
    { tags: [] },
  ]);

  it('counts each agent once per tag', () => {
    expect([...counts]).toEqual([
      ['util', 3],
      ['ops', 2],
      ['marketing', 1],
    ]);
  });

  it('offers the most used first, matching what is typed, minus the picked', () => {
    expect(suggestTags(counts, '', [])).toEqual(['util', 'ops', 'marketing']);
    expect(suggestTags(counts, 'T', [])).toEqual(['util', 'marketing']);
    expect(suggestTags(counts, '', ['util'])).toEqual(['ops', 'marketing']);
    expect(suggestTags(counts, 'xyz', [])).toEqual([]);
  });
});

describe('similarity', () => {
  it('measures edits', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('util', 'util')).toBe(0);
  });

  it('finds plurals, prefixes and small typos', () => {
    expect(areSimilarTags('agents', 'agent')).toBe(true);
    expect(areSimilarTags('policies', 'policy')).toBe(true);
    expect(areSimilarTags('boxes', 'box')).toBe(true);
    expect(areSimilarTags('util', 'utils')).toBe(true);
    expect(areSimilarTags('utility', 'util')).toBe(true);
    expect(areSimilarTags('marketng', 'marketing')).toBe(true);
    expect(areSimilarTags('util', 'util')).toBe(false);
    // Short tags: no prefix below three characters, no typos below four.
    expect(areSimilarTags('ai', 'aiops')).toBe(false);
    expect(areSimilarTags('ops', 'dps')).toBe(false);
    expect(areSimilarTags('sales', 'legal')).toBe(false);
  });

  it('names the closest existing tag for a new one, or none', () => {
    const counts = new Map([
      ['util', 3],
      ['utils', 1],
      ['marketing', 2],
    ]);
    expect(similarExistingTag('utl', counts)).toBeUndefined();
    expect(similarExistingTag('utill', counts)).toBe('util');
    expect(similarExistingTag('marketng', counts)).toBe('marketing');
    expect(similarExistingTag('util', counts)).toBeUndefined();
    expect(similarExistingTag('finance', counts)).toBeUndefined();
    expect(similarExistingTag('utill', counts, ['util'])).toBe('utils');
  });
});
