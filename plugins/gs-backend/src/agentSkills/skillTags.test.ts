import { isValidTag, parseTags, skillTagsOf, withSkillTags } from './skillTags';

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

describe('skillTagsOf', () => {
  it('reads metadata.tags', () => {
    expect(
      skillTagsOf({ metadata: { tags: 'triage, kubernetes', team: 'x' } }),
    ).toEqual(['triage', 'kubernetes']);
  });

  it.each([
    {},
    { metadata: 'tags' },
    { metadata: { tags: ['triage'] } },
    { metadata: null },
  ])('is empty for %j', frontmatter =>
    expect(skillTagsOf(frontmatter)).toEqual([]),
  );
});

describe('withSkillTags', () => {
  it('sets metadata.tags comma-joined, keeping the other metadata keys', () => {
    expect(
      withSkillTags(
        { license: 'MIT', metadata: { team: 'ops', tags: 'old' } },
        ['triage', 'kubernetes'],
      ),
    ).toEqual({
      license: 'MIT',
      metadata: { team: 'ops', tags: 'triage, kubernetes' },
    });
  });

  it('creates metadata for tags only when there are tags', () => {
    expect(withSkillTags({ license: 'MIT' }, ['a'])).toEqual({
      license: 'MIT',
      metadata: { tags: 'a' },
    });
    expect(withSkillTags({ license: 'MIT' }, [])).toEqual({ license: 'MIT' });
  });

  it('removes metadata.tags, and metadata when tags were all it held', () => {
    expect(withSkillTags({ metadata: { tags: 'a', team: 'ops' } }, [])).toEqual(
      { metadata: { team: 'ops' } },
    );
    expect(
      withSkillTags({ license: 'MIT', metadata: { tags: 'a' } }, []),
    ).toEqual({ license: 'MIT' });
  });

  it('keeps an empty metadata it did not empty', () => {
    expect(withSkillTags({ metadata: {} }, [])).toEqual({ metadata: {} });
  });

  it('refuses to write tags into a metadata that is not a map', () => {
    expect(() => withSkillTags({ metadata: 'x' }, ['a'])).toThrow();
  });
});
