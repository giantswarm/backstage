import {
  compareDisplayPaths,
  firstHeading,
  friendlyFileName,
  isHtmlFile,
  isMarkdownFile,
  isDotPath,
  isRenderableFile,
  splitFrontmatter,
  stripFolderPrefix,
} from './files';

describe('file type helpers', () => {
  it('detects markdown files', () => {
    expect(isMarkdownFile('plan/README.md')).toBe(true);
    expect(isMarkdownFile('plan/notes.MDX')).toBe(true);
    expect(isMarkdownFile('plan/index.html')).toBe(false);
    expect(isMarkdownFile('plan/diagram.png')).toBe(false);
  });

  it('detects html files', () => {
    expect(isHtmlFile('plan/index.html')).toBe(true);
    expect(isHtmlFile('plan/index.htm')).toBe(true);
    expect(isHtmlFile('plan/README.md')).toBe(false);
  });

  it('combines both for renderable files', () => {
    expect(isRenderableFile('plan/README.md')).toBe(true);
    expect(isRenderableFile('plan/index.html')).toBe(true);
    expect(isRenderableFile('plan/data.json')).toBe(false);
  });
});

describe('splitFrontmatter', () => {
  it('splits a leading YAML frontmatter block off the body', () => {
    const markdown = '---\nname: contrarian\ndescription: x\n---\n# Title\n';
    expect(splitFrontmatter(markdown)).toEqual({
      frontmatter: 'name: contrarian\ndescription: x',
      body: '# Title\n',
    });
  });

  it('leaves documents without frontmatter untouched', () => {
    expect(splitFrontmatter('# Title\n')).toEqual({ body: '# Title\n' });
    // A thematic break later in the document is not frontmatter.
    const later = '# Title\n\n---\ntext\n---\n';
    expect(splitFrontmatter(later)).toEqual({ body: later });
  });
});

describe('firstHeading', () => {
  it('returns the first ATX heading text', () => {
    expect(firstHeading('intro\n\n# My Plan\n\n## Detail\n')).toBe('My Plan');
    expect(firstHeading('## Only Subheading\ntext\n')).toBe('Only Subheading');
  });

  it('skips frontmatter and trims closing hashes', () => {
    expect(firstHeading('---\ntitle: x\n---\n# Real Title ##\n')).toBe(
      'Real Title',
    );
  });

  it('returns undefined without a heading', () => {
    expect(firstHeading('just text\nno heading\n')).toBeUndefined();
  });
});

describe('compareDisplayPaths', () => {
  it('puts README first, then index, then the rest alphabetically', () => {
    const paths = [
      'plan/z-appendix.md',
      'plan/index.html',
      'plan/README.md',
      'plan/a-details.md',
    ];
    expect([...paths].sort(compareDisplayPaths)).toEqual([
      'plan/README.md',
      'plan/index.html',
      'plan/a-details.md',
      'plan/z-appendix.md',
    ]);
  });

  it('orders shallower paths before deeper ones', () => {
    const paths = ['plan/sub/deep.md', 'plan/top.md'];
    expect([...paths].sort(compareDisplayPaths)).toEqual([
      'plan/top.md',
      'plan/sub/deep.md',
    ]);
  });
});

describe('friendlyFileName', () => {
  it('maps well-known file names case-insensitively', () => {
    expect(friendlyFileName('PRD.md')).toBe('Product Requirements Document');
    expect(friendlyFileName('prd.md')).toBe('Product Requirements Document');
    expect(friendlyFileName('index.html')).toBe('Web page');
    // Matches on the basename, so nested paths still resolve.
    expect(friendlyFileName('sub/PRD.md')).toBe(
      'Product Requirements Document',
    );
  });

  it('returns undefined for files without a known convention', () => {
    expect(friendlyFileName('notes.md')).toBeUndefined();
    expect(friendlyFileName('design.html')).toBeUndefined();
  });
});

describe('isDotPath', () => {
  it('flags dot files and folders anywhere in the path', () => {
    expect(isDotPath('.agents/plan.md')).toBe(true);
    expect(isDotPath('.cursor')).toBe(true);
    expect(isDotPath('plan/.notes.md')).toBe(true);
    expect(isDotPath('plan/.hidden/doc.md')).toBe(true);
  });

  it('leaves normal paths unflagged', () => {
    expect(isDotPath('my-plan/README.md')).toBe(false);
    expect(isDotPath('plan/sub/deep.md')).toBe(false);
    // A dot inside a segment (not a prefix) is fine.
    expect(isDotPath('plan/v1.2.3-notes.md')).toBe(false);
  });
});

describe('stripFolderPrefix', () => {
  it('removes the folder prefix from a path within it', () => {
    expect(stripFolderPrefix('my-plan/README.md', 'my-plan')).toBe('README.md');
    expect(stripFolderPrefix('my-plan/sub/deep.md', 'my-plan')).toBe(
      'sub/deep.md',
    );
  });

  it('leaves paths outside the folder unchanged', () => {
    // A path that isn't under the given folder is returned verbatim.
    expect(stripFolderPrefix('README.md', 'my-plan')).toBe('README.md');
    // A folder name that is a prefix but not a path segment must not match.
    expect(stripFolderPrefix('my-plan-2/README.md', 'my-plan')).toBe(
      'my-plan-2/README.md',
    );
  });
});
