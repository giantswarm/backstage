import { splitMermaid } from './splitMermaid';

describe('splitMermaid', () => {
  it('leaves markdown without a diagram whole', () => {
    const content = '# Title\n\n```ts\nconst a = 1;\n```';
    expect(splitMermaid(content)).toEqual([
      { kind: 'markdown', text: content },
    ]);
  });

  it('splits the diagrams out of the text around them', () => {
    expect(
      splitMermaid(
        [
          '# Flow',
          '',
          '```mermaid',
          'graph TD',
          '  A --> B',
          '```',
          '',
          'Between.',
          '',
          '~~~~ mermaid title="second"',
          'sequenceDiagram',
          '~~~~',
        ].join('\n'),
      ),
    ).toEqual([
      { kind: 'markdown', text: '# Flow\n' },
      { kind: 'mermaid', source: 'graph TD\n  A --> B' },
      { kind: 'markdown', text: '\nBetween.\n' },
      { kind: 'mermaid', source: 'sequenceDiagram' },
    ]);
  });

  it('keeps a mermaid fence inside another fence as code', () => {
    const content = '````md\n```mermaid\ngraph TD\n```\n````';
    expect(splitMermaid(content)).toEqual([
      { kind: 'markdown', text: content },
    ]);
  });

  it('closes a fence only with as many of its own markers', () => {
    expect(
      splitMermaid('````mermaid\ngraph TD\n```\n~~~~\n````\nAfter.'),
    ).toEqual([
      { kind: 'mermaid', source: 'graph TD\n```\n~~~~' },
      { kind: 'markdown', text: 'After.' },
    ]);
  });

  it('runs an unclosed diagram to the end of the document', () => {
    expect(splitMermaid('Text.\n```mermaid\ngraph TD')).toEqual([
      { kind: 'markdown', text: 'Text.' },
      { kind: 'mermaid', source: 'graph TD' },
    ]);
  });

  it('gives every part the link reference definitions', () => {
    expect(
      splitMermaid(
        'See [the docs][docs].\n\n```mermaid\ngraph TD\n```\n\nAnd [again][docs].\n\n[docs]: https://example.com',
      ),
    ).toEqual([
      {
        kind: 'markdown',
        text: 'See [the docs][docs].\n\n\n[docs]: https://example.com',
      },
      { kind: 'mermaid', source: 'graph TD' },
      {
        kind: 'markdown',
        text: '\nAnd [again][docs].\n\n[docs]: https://example.com\n\n[docs]: https://example.com',
      },
    ]);
  });
});
