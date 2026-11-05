import { SkillTagsError, skillTagsOf, withSkillTags } from './skillTags';

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
    expect(() => withSkillTags({ metadata: 'x' }, ['a'])).toThrow(
      SkillTagsError,
    );
  });

  it.each([
    { tags: ['triage', 'kubernetes'] },
    { tags: 'ops, on call' },
    { tags: 'ops, über' },
    { tags: 42 },
  ])(
    'refuses to replace a metadata.tags it cannot read whole: %j',
    metadata => {
      expect(() => withSkillTags({ metadata }, ['ops'])).toThrow(
        SkillTagsError,
      );
      expect(() => withSkillTags({ metadata }, [])).toThrow(SkillTagsError);
    },
  );

  describe('the 50-tag limit, as muster checks it', () => {
    const numbered = (count: number) =>
      Array.from({ length: count }, (_, index) => `tag-${index}`);
    const stored = numbered(55);
    const skill = { metadata: { tags: stored.join(', ') } };

    it('refuses more than 50 tags on a new skill', () => {
      expect(() => withSkillTags({}, numbered(51))).toThrow(
        'A skill takes at most 50 tags.',
      );
      expect(withSkillTags({}, numbered(50))).toEqual({
        metadata: { tags: numbered(50).join(', ') },
      });
    });

    it('keeps an unchanged or shortened list past it', () => {
      expect(withSkillTags(skill, stored)).toEqual(skill);
      expect(withSkillTags(skill, stored.slice(3))).toEqual({
        metadata: { tags: stored.slice(3).join(', ') },
      });
    });

    it('refuses a tag the skill lacks on a list past it', () => {
      expect(() => withSkillTags(skill, [...stored.slice(1), 'new'])).toThrow(
        SkillTagsError,
      );
    });
  });

  it('replaces a metadata.tags it reads whole, in any case', () => {
    expect(
      withSkillTags({ metadata: { tags: 'Ops, ,Triage' } }, ['ops']),
    ).toEqual({ metadata: { tags: 'ops' } });
  });
});
