import { exceedsTagLimit, isValidTag, parseTags } from './tags';

describe('parseTags', () => {
  it('splits, trims, lowercases and dedupes, dropping invalid values', () => {
    expect(
      parseTags(' Triage, kubernetes,,triage, on call, -x, ok-1 '),
    ).toEqual(['triage', 'kubernetes', 'ok-1']);
  });

  it('is empty for nothing', () => {
    expect(parseTags(undefined)).toEqual([]);
    expect(parseTags('')).toEqual([]);
  });

  it('keeps more than MAX_TAGS', () => {
    const many = Array.from({ length: 51 }, (_, index) => `tag-${index}`);
    expect(parseTags(many.join(','))).toEqual(many);
  });
});

describe('isValidTag', () => {
  it.each(['a', 'on-call', 'k8s', 'x'.repeat(63)])('accepts %s', tag =>
    expect(isValidTag(tag)).toBe(true),
  );
  it.each(['', 'On-call', 'on--call', '-a', 'a b', 'x'.repeat(64)])(
    'refuses %s',
    tag => expect(isValidTag(tag)).toBe(false),
  );
});

describe('exceedsTagLimit', () => {
  const numbered = (count: number) =>
    Array.from({ length: count }, (_, index) => `tag-${index}`);

  it('refuses more than MAX_TAGS on create', () => {
    expect(exceedsTagLimit(numbered(50))).toBe(false);
    expect(exceedsTagLimit(numbered(51))).toBe(true);
  });

  it('lets an unchanged or shortened list past the limit through', () => {
    const stored = numbered(55);
    expect(exceedsTagLimit(stored, stored)).toBe(false);
    expect(exceedsTagLimit(stored.slice(2), stored)).toBe(false);
    expect(exceedsTagLimit([...stored].reverse(), stored)).toBe(false);
  });

  it('refuses a tag added to a list past the limit', () => {
    const stored = numbered(55);
    expect(exceedsTagLimit([...stored.slice(1), 'new'], stored)).toBe(true);
    expect(exceedsTagLimit([...numbered(50), 'new'], numbered(50))).toBe(true);
    expect(exceedsTagLimit(numbered(50), numbered(49))).toBe(false);
  });
});
