import { knowledgeDocumentLink } from './knowledgeLinks';

describe('knowledgeDocumentLink', () => {
  const page = '/hive/knowledge?team=Bumblebee&q=agent';
  const source = 'knowledge/product/agent-platform.md';

  it.each([
    ['slack-agent.md', 'knowledge/product/slack-agent.md', ''],
    ['./slack-agent.md#tools', 'knowledge/product/slack-agent.md', '#tools'],
    ['../architecture/architect.md', 'knowledge/architecture/architect.md', ''],
    ['/knowledge/decisions/access.mdx', 'knowledge/decisions/access.mdx', ''],
    ['missing.md', 'knowledge/product/missing.md', ''],
    ['a%20document.md', 'knowledge/product/a document.md', ''],
  ])('resolves %s within its document collection', (href, path, hash) => {
    const target = new URL(
      knowledgeDocumentLink(href, source, page),
      'https://portal.example.com',
    );
    expect(target.pathname).toBe('/hive/knowledge');
    expect(target.searchParams.get('doc')).toBe(path);
    expect(target.searchParams.get('team')).toBe('Bumblebee');
    expect(target.searchParams.get('q')).toBe('agent');
    expect(target.hash).toBe(hash);
  });

  it.each([
    '',
    '#tools',
    '?team=other',
    'https://github.com/example/repo/blob/main/README.md',
    '//docs.example.com/guide.md',
    'mailto:team@example.com',
    '/catalog',
    'diagram.svg',
    '%broken.md',
  ])('preserves %s', href => {
    expect(knowledgeDocumentLink(href, source, page)).toBe(href);
  });

  it('resolves a sibling architecture document from the selected document', () => {
    const target = knowledgeDocumentLink(
      'architect-orb.md',
      'knowledge/architecture/architect.md',
      `${page}&doc=knowledge%2Farchitecture%2Farchitect.md`,
    );
    expect(
      new URL(target, 'https://portal.example.com').searchParams.get('doc'),
    ).toBe('knowledge/architecture/architect-orb.md');
  });
});
