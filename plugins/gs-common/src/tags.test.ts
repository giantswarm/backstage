import { isValidTag, parseTags } from './tags';

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
