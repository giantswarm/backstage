import {
  assignSkillFiles,
  gitBlobSha,
  isBinaryFileName,
  isSkillFilePath,
  looksBinary,
  MAX_INLINE_FILE_BYTES,
  MAX_SKILL_FILES,
  needsFileBytes,
  repositoryFilePath,
  skillFileContent,
} from './skillFiles';

const file = (path: string, size = 1) => ({ path, size, sha: `sha-${path}` });

describe('assignSkillFiles', () => {
  it('gives each file to the deepest skill directory containing it', () => {
    const lists = assignSkillFiles(
      ['', 'a', 'a/b'],
      [
        file('SKILL.md'),
        file('README.md'),
        file('a/SKILL.md'),
        file('a/references/x.md'),
        file('a/b/SKILL.md'),
        file('a/b/c/deep.md'),
        file('ab/not-a.md'),
      ],
    );

    const paths = (dir: string) => lists.get(dir)!.files.map(f => f.path);
    expect(paths('')).toEqual(['SKILL.md', 'README.md', 'ab/not-a.md']);
    expect(paths('a')).toEqual(['SKILL.md', 'references/x.md']);
    expect(paths('a/b')).toEqual(['SKILL.md', 'c/deep.md']);
    expect(lists.get('a/b')!.files[1]).toEqual({
      path: 'c/deep.md',
      size: 1,
      sha: 'sha-a/b/c/deep.md',
    });
  });

  it('drops files under no skill and lists an empty skill', () => {
    const lists = assignSkillFiles(['skills/x'], [file('docs/readme.md')]);

    expect(lists).toEqual(
      new Map([['skills/x', { files: [], truncated: false, total: 0 }]]),
    );
  });

  it(`caps a list at ${MAX_SKILL_FILES}, SKILL.md first, counting the rest`, () => {
    const files = Array.from({ length: MAX_SKILL_FILES + 5 }, (_, i) =>
      file(`s/a-${String(i).padStart(3, '0')}.md`),
    );
    const lists = assignSkillFiles(['s'], [...files, file('s/SKILL.md')]);

    const list = lists.get('s')!;
    expect(list.files).toHaveLength(MAX_SKILL_FILES);
    expect(list.files[0].path).toBe('SKILL.md');
    expect(list.files[MAX_SKILL_FILES - 1].path).toBe('a-198.md');
    expect(list.truncated).toBe(true);
    expect(list.total).toBe(MAX_SKILL_FILES + 6);
  });

  it('is not truncated at exactly the cap', () => {
    const files = Array.from({ length: MAX_SKILL_FILES }, (_, i) =>
      file(`s/f-${i}`),
    );
    expect(assignSkillFiles(['s'], files).get('s')!.truncated).toBe(false);
  });
});

describe('isSkillFilePath', () => {
  it.each(['SKILL.md', 'references/x.md', 'data/My Notes.csv', '.hidden'])(
    'accepts %s',
    path => {
      expect(isSkillFilePath(path)).toBe(true);
    },
  );

  it.each([
    '',
    '/etc/passwd',
    '../other/SKILL.md',
    'references/../../x',
    'a/./b',
    'a//b',
    'a/',
    'a\\..\\b',
    'a\u0000b',
    'x'.repeat(1025),
  ])('refuses %j', path => {
    expect(isSkillFilePath(path)).toBe(false);
  });
});

describe('repositoryFilePath', () => {
  it('joins the skill directory and the file', () => {
    expect(repositoryFilePath('a/b', 'x.md')).toBe('a/b/x.md');
    expect(repositoryFilePath('', 'x.md')).toBe('x.md');
  });
});

describe('binary detection', () => {
  it('knows binary extensions, case-insensitively', () => {
    expect(isBinaryFileName('assets/logo.PNG')).toBe(true);
    expect(isBinaryFileName('data/archive.tar')).toBe(true);
    expect(isBinaryFileName('data/table.csv')).toBe(false);
    expect(isBinaryFileName('Makefile')).toBe(false);
    expect(isBinaryFileName('.png')).toBe(false);
  });

  it('sniffs a NUL in the first 8,000 bytes', () => {
    expect(looksBinary(Buffer.from([0x50, 0x4b, 0x00]))).toBe(true);
    expect(looksBinary(Buffer.from('plain text ✓'))).toBe(false);
    const lateNul = Buffer.alloc(9000, 'a');
    lateNul[8500] = 0;
    expect(looksBinary(lateNul)).toBe(false);
  });
});

describe('gitBlobSha', () => {
  it('is git’s blob id', () => {
    expect(gitBlobSha(Buffer.alloc(0))).toBe(
      'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391',
    );
    expect(gitBlobSha(Buffer.from('hello\n'))).toBe(
      'ce013625030ba8dba906f756967f9e9ca394464a',
    );
  });
});

describe('skillFileContent', () => {
  const text = { path: 'references/x.md', size: 6, sha: 'abc' };

  it('answers a text file inline', () => {
    expect(skillFileContent(text, { bytes: Buffer.from('hello\n') })).toEqual({
      ...text,
      binary: false,
      truncated: false,
      content: 'hello\n',
    });
  });

  it('answers a NUL-sniffed file as binary, without content', () => {
    expect(skillFileContent(text, { bytes: Buffer.from([1, 0, 1]) })).toEqual({
      ...text,
      binary: true,
      truncated: false,
    });
    expect(skillFileContent(text, { binary: true })).toEqual({
      ...text,
      binary: true,
      truncated: false,
    });
  });

  it('answers an oversize or binary-named file from the listing alone', () => {
    const large = { ...text, size: MAX_INLINE_FILE_BYTES + 1 };
    const image = { path: 'img/logo.png', size: 10, sha: 'def' };

    expect(needsFileBytes(large)).toBe(false);
    expect(needsFileBytes(image)).toBe(false);
    expect(needsFileBytes(text)).toBe(true);
    expect(skillFileContent(large)).toEqual({
      ...large,
      binary: false,
      truncated: true,
    });
    expect(skillFileContent(image)).toEqual({
      ...image,
      binary: true,
      truncated: false,
    });
  });

  it('treats bytes over the cap as oversize whatever the listing said', () => {
    expect(
      skillFileContent(text, {
        bytes: Buffer.alloc(MAX_INLINE_FILE_BYTES + 1, 'a'),
      }),
    ).toEqual({ ...text, binary: false, truncated: true });
  });

  it('refuses to answer a text file without its bytes', () => {
    expect(() => skillFileContent(text)).toThrow('needed');
  });
});
