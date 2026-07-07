import {
  compareDisplayPaths,
  isHtmlFile,
  isMarkdownFile,
  isRenderableFile,
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
