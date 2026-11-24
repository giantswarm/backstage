import {
  githubPathUrl,
  planDocumentLink,
  resolveRepositoryLink,
} from './repositoryLinks';

describe('resolveRepositoryLink', () => {
  const source = 'beekeeper/PRD.md';

  it.each([
    ['workflows/sdlc.md', 'beekeeper/workflows/sdlc.md', '', false],
    ['./design/x.md#failures', 'beekeeper/design/x.md', '#failures', false],
    ['../connector-manager/PRD.md', 'connector-manager/PRD.md', '', false],
    ['/README.md', 'README.md', '', false],
    ['design/', 'beekeeper/design', '', true],
    ['../', '', '', true],
    ['a%20b.md', 'beekeeper/a b.md', '', false],
    ['../../../escape.md', 'escape.md', '', false],
  ])('resolves %s', (href, path, hash, folder) => {
    expect(resolveRepositoryLink(href, source)).toEqual({
      path,
      hash,
      folder,
    });
  });

  it.each([
    '',
    '#solution',
    '?tab=merged',
    'https://github.com/giantswarm/roadmap/issues/1',
    '//example.com/x.md',
    'mailto:team@example.com',
    '%broken.md',
  ])('leaves %s alone', href => {
    expect(resolveRepositoryLink(href, source)).toBeUndefined();
  });
});

describe('githubPathUrl', () => {
  it('names a file blob and a folder tree at a branch with slashes', () => {
    expect(
      githubPathUrl('giantswarm/team-plans', 'plan/beekeeper', {
        path: 'beekeeper/a b.yaml',
        hash: '#L3',
        folder: false,
      }),
    ).toBe(
      'https://github.com/giantswarm/team-plans/blob/plan/beekeeper/beekeeper/a%20b.yaml#L3',
    );
    expect(
      githubPathUrl('giantswarm/team-plans', 'HEAD', {
        path: '',
        hash: '',
        folder: true,
      }),
    ).toBe('https://github.com/giantswarm/team-plans/tree/HEAD');
  });
});

describe('planDocumentLink', () => {
  const options = {
    documentPath: 'beekeeper/PRD.md',
    pageHref: '/hive/plans?repo=giantswarm%2Fteam-plans&plan=beekeeper',
    documents: new Set([
      'beekeeper/PRD.md',
      'beekeeper/design/operations.md',
      'connector-manager/PRD.md',
    ]),
    repo: 'giantswarm/team-plans',
    ref: 'HEAD',
    params: (path: string) => ({ plan: path.slice(0, path.indexOf('/')) }),
  };
  const open = (href: string) =>
    new URL(planDocumentLink(href, options), 'https://portal.example.com');

  it('opens a document the page renders on the page, at its anchor', () => {
    const target = open('design/operations.md#failures');
    expect(target.pathname).toBe('/hive/plans');
    expect(target.searchParams.get('repo')).toBe('giantswarm/team-plans');
    expect(target.searchParams.get('plan')).toBe('beekeeper');
    expect(target.searchParams.get('doc')).toBe(
      'beekeeper/design/operations.md',
    );
    expect(target.hash).toBe('#failures');
  });

  it('opens another plan’s document at its start', () => {
    const target = open('../connector-manager/PRD.md');
    expect(target.searchParams.get('plan')).toBe('connector-manager');
    expect(target.searchParams.get('doc')).toBe('connector-manager/PRD.md');
    expect(target.hash).toBe('#top');
  });

  it.each([
    [
      'workflows/sdlc.yaml',
      'https://github.com/giantswarm/team-plans/blob/HEAD/beekeeper/workflows/sdlc.yaml',
    ],
    [
      'design/',
      'https://github.com/giantswarm/team-plans/tree/HEAD/beekeeper/design',
    ],
    [
      'missing.md#x',
      'https://github.com/giantswarm/team-plans/blob/HEAD/beekeeper/missing.md#x',
    ],
  ])('opens %s on GitHub', (href, url) => {
    expect(planDocumentLink(href, options)).toBe(url);
  });

  it.each(['#solution', 'https://example.com/spec', 'mailto:a@example.com'])(
    'keeps %s',
    href => {
      expect(planDocumentLink(href, options)).toBe(href);
    },
  );
});
