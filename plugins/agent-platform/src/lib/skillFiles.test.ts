import {
  groupSkillFiles,
  matchSkillFileMention,
  parseDelimited,
  resolveSkillFilePath,
  skillFileKind,
} from './skillFiles';

const file = (path: string) => ({ path, size: 1, sha: path });

describe('resolveSkillFilePath', () => {
  it('resolves relative references against the file they are written in', () => {
    expect(resolveSkillFilePath('references/setup.md')).toBe(
      'references/setup.md',
    );
    expect(resolveSkillFilePath('./references/setup.md')).toBe(
      'references/setup.md',
    );
    expect(resolveSkillFilePath('other.md', 'references/setup.md')).toBe(
      'references/other.md',
    );
    expect(resolveSkillFilePath('../SKILL.md', 'references/setup.md')).toBe(
      'SKILL.md',
    );
    expect(resolveSkillFilePath('references/my%20notes.md#usage')).toBe(
      'references/my notes.md',
    );
  });

  it('leaves URLs, anchors, root paths and paths out of the skill alone', () => {
    expect(resolveSkillFilePath('https://example.com/a.md')).toBeUndefined();
    expect(resolveSkillFilePath('mailto:x@example.com')).toBeUndefined();
    expect(resolveSkillFilePath('#usage')).toBeUndefined();
    expect(resolveSkillFilePath('/etc/passwd')).toBeUndefined();
    expect(resolveSkillFilePath('../other-skill/SKILL.md')).toBeUndefined();
    expect(resolveSkillFilePath('%E0%A4%A')).toBeUndefined();
    expect(resolveSkillFilePath(undefined)).toBeUndefined();
  });
});

describe('matchSkillFileMention', () => {
  const paths = new Set(['SKILL.md', 'references/setup.md', 'scripts/q.py']);

  it('matches a backticked path exactly', () => {
    expect(matchSkillFileMention('references/setup.md', paths)).toBe(
      'references/setup.md',
    );
    expect(matchSkillFileMention('./scripts/q.py', paths)).toBe('scripts/q.py');
    expect(
      matchSkillFileMention('setup.md', paths, 'references/other.md'),
    ).toBe('references/setup.md');
  });

  it('leaves code that only contains a path as code', () => {
    expect(
      matchSkillFileMention('python3 scripts/q.py', paths),
    ).toBeUndefined();
    expect(matchSkillFileMention('setup.md', paths)).toBeUndefined();
    expect(matchSkillFileMention('references/', paths)).toBeUndefined();
  });
});

describe('skillFileKind', () => {
  it('reads Markdown, CSV and everything else as text', () => {
    expect(skillFileKind('references/a.md')).toBe('markdown');
    expect(skillFileKind('rules.MDC')).toBe('markdown');
    expect(skillFileKind('data/x.csv')).toBe('csv');
    expect(skillFileKind('data/x.tsv')).toBe('csv');
    expect(skillFileKind('scripts/q.py')).toBe('text');
    expect(skillFileKind('LICENSE')).toBe('text');
    expect(skillFileKind('.md')).toBe('text');
  });
});

describe('parseDelimited', () => {
  it('reads quoted fields, escaped quotes, embedded newlines and CRLF', () => {
    expect(
      parseDelimited('a,b,c\r\n"x, y","say ""hi""","two\nlines"\n1,,3\n'),
    ).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'say "hi"', 'two\nlines'],
      ['1', '', '3'],
    ]);
  });

  it('reads TSV', () => {
    expect(parseDelimited('a\tb\n1\t2', '\t')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('groupSkillFiles', () => {
  it('puts the top-level files first, SKILL.md leading, then each folder in listing order', () => {
    const groups = groupSkillFiles([
      file('LICENSE'),
      file('SKILL.md'),
      file('data/x.csv'),
      file('references/a.md'),
      file('references/deep/b.md'),
      file('scripts/q.py'),
    ]);

    expect(
      groups.map(group => [group.dir, group.files.map(f => f.path)]),
    ).toEqual([
      ['', ['SKILL.md', 'LICENSE']],
      ['data', ['data/x.csv']],
      ['references', ['references/a.md']],
      ['references/deep', ['references/deep/b.md']],
      ['scripts', ['scripts/q.py']],
    ]);
  });
});
