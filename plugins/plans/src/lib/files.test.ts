import {
  compareDisplayPaths,
  firstHeading,
  isHtmlFile,
  isMarkdownFile,
  isRenderableFile,
  splitFrontmatter,
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
