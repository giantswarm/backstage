import {
  alignIndentation,
  DiffLine,
  diffLines,
  foldContext,
  foldLabel,
  indentUnit,
  reindent,
  splitLines,
} from './diff';

const kinds = (lines: DiffLine[]) => lines.map(l => l.kind);

describe('diffLines', () => {
  it('keeps the common lines as context with both line numbers', () => {
    expect(diffLines('a\nb\nc\n', 'a\nx\nc\n')).toEqual([
      { kind: 'context', text: 'a', currentLine: 1, line: 1 },
      { kind: 'removed', text: 'b', currentLine: 2 },
      { kind: 'added', text: 'x', line: 2 },
      { kind: 'context', text: 'c', currentLine: 3, line: 3 },
    ]);
  });

  it('adds every line of a file the record lacks', () => {
    expect(diffLines('', 'a\nb')).toEqual([
      { kind: 'added', text: 'a', line: 1 },
      { kind: 'added', text: 'b', line: 2 },
    ]);
  });

  it('removes before it adds, and finishes the longer side', () => {
    expect(kinds(diffLines('a\nb', 'a\nc\nd'))).toEqual([
      'context',
      'removed',
      'added',
      'added',
    ]);
  });

  it('does not invent an empty last line from the trailing newline', () => {
    expect(splitLines('a\n')).toEqual(['a']);
    expect(splitLines('a\n\n')).toEqual(['a', '']);
    expect(splitLines('')).toEqual([]);
  });

  it('never aligns a leaf with the same text under another key', () => {
    // The record's gateway block goes, the render's components come: their
    // `enabled: true` lines are other leaves, so the rewrite reads as one
    // removal then one addition rather than hunks around a shared line.
    const record = [
      'gateway:',
      '  jwksEgress:',
      '    enabled: true',
      'llmRouting:',
      '  enabled: true',
      '',
    ].join('\n');
    const render = [
      'components:',
      '  kagent:',
      '    enabled: true',
      '  postgres:',
      '    enabled: true',
      'llmRouting:',
      '  enabled: true',
      '',
    ].join('\n');
    expect(kinds(diffLines(record, render))).toEqual([
      'removed',
      'removed',
      'removed',
      'added',
      'added',
      'added',
      'added',
      'added',
      'context',
      'context',
    ]);
  });

  it('reads a moved block as one removal then one addition', () => {
    expect(
      diffLines('a:\n  x: 1\nb:\n  y: 2\n', 'b:\n  y: 2\na:\n  x: 1\n'),
    ).toEqual([
      { kind: 'removed', text: 'a:', currentLine: 1 },
      { kind: 'removed', text: '  x: 1', currentLine: 2 },
      { kind: 'context', text: 'b:', currentLine: 3, line: 1 },
      { kind: 'context', text: '  y: 2', currentLine: 4, line: 2 },
      { kind: 'added', text: 'a:', line: 3 },
      { kind: 'added', text: '  x: 1', line: 4 },
    ]);
  });

  it('aligns the entries of one sequence', () => {
    expect(
      kinds(
        diffLines('items:\n  - a\n  - b\n  - c\n', 'items:\n  - a\n  - c\n'),
      ),
    ).toEqual(['context', 'context', 'removed', 'context']);
  });

  it('keeps a comment with the block it sits in', () => {
    const record = 'a:\n  # about b\n  b: 1\n';
    const render = '# about b\na:\n  b: 1\n';
    expect(kinds(diffLines(record, render))).toEqual([
      'added',
      'context',
      'removed',
      'context',
    ]);
  });
});

describe('indentation', () => {
  it('finds the unit of a text', () => {
    expect(indentUnit('a:\n    b:\n        c: 1\n')).toBe(4);
    expect(indentUnit('a:\n  b: 1\n    c: 2\n')).toBe(2);
    expect(indentUnit('a: 1\nb: 2\n')).toBe(0);
    expect(indentUnit('a:\n\tb: 1\n')).toBe(0);
  });

  it("scales a record SOPS wrote with four spaces to the render's two, so only the changed line differs", () => {
    const record =
      'metadata:\n    name: dex\n    namespace: auth\nspec:\n    replicas: 2\n';
    const render =
      'metadata:\n  name: dex\n  namespace: auth\nspec:\n  replicas: 1\n';
    const aligned = alignIndentation(record, render);
    expect(aligned.reindented).toEqual({ side: 'record', from: 4, to: 2 });
    expect(aligned.content).toBe(render);
    const lines = diffLines(aligned.current, aligned.content);
    expect(kinds(lines)).toEqual([
      'context',
      'context',
      'context',
      'context',
      'removed',
      'added',
    ]);
    expect(lines[4]).toEqual({
      kind: 'removed',
      text: '  replicas: 2',
      currentLine: 5,
    });
  });

  it('reindents the render where it is the deeper side', () => {
    expect(alignIndentation('a:\n  b: 1\n', 'a:\n    b: 1\n')).toEqual({
      current: 'a:\n  b: 1\n',
      content: 'a:\n  b: 1\n',
      reindented: { side: 'render', from: 4, to: 2 },
    });
  });

  it('leaves both sides alone where the units do not divide or are no indentation', () => {
    expect(
      alignIndentation('a:\n   b: 1\n', 'a:\n  b: 1\n').reindented,
    ).toBeUndefined();
    expect(
      alignIndentation('a:\n b: 1\n', 'a:\n  b: 1\n').reindented,
    ).toBeUndefined();
    expect(
      alignIndentation('a: 1\n', 'a:\n  b: 1\n').reindented,
    ).toBeUndefined();
  });

  it('keeps blank lines and the line count while reindenting', () => {
    expect(reindent('a:\n    b: 1\n\n    c: |\n        text\n', 4, 2)).toBe(
      'a:\n  b: 1\n\n  c: |\n    text\n',
    );
  });
});

describe('foldContext', () => {
  const context = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      kind: 'context' as const,
      text: `l${i}`,
      currentLine: i + 1,
      line: i + 1,
    }));

  it('folds the unchanged lines beyond the context around a change', () => {
    const runs = foldContext([
      ...context(6),
      { kind: 'added', text: 'x', line: 7 },
      ...context(6),
    ]);
    expect(runs.map(r => [r.fold, r.lines.length])).toEqual([
      ['unchanged', 4],
      [undefined, 2 + 1 + 2],
      ['unchanged', 4],
    ]);
    expect(foldLabel(runs[0])).toBe('… 4 unchanged lines');
  });

  it('leaves a short unchanged stretch shown', () => {
    const runs = foldContext([
      { kind: 'added', text: 'x', line: 1 },
      ...context(4),
      { kind: 'removed', text: 'y', currentLine: 9 },
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0].fold).toBeUndefined();
  });

  it('folds a change of comment and blank lines behind a line saying so', () => {
    const runs = foldContext([
      { kind: 'context', text: 'a: 1', currentLine: 1, line: 1 },
      { kind: 'removed', text: '# one', currentLine: 2 },
      { kind: 'removed', text: '', currentLine: 3 },
      { kind: 'removed', text: '  # two', currentLine: 4 },
      { kind: 'added', text: '# rendered', line: 2 },
      { kind: 'added', text: '# by the manager', line: 3 },
      { kind: 'context', text: 'b: 2', currentLine: 5, line: 4 },
    ]);
    expect(runs.map(r => [r.fold, r.lines.length])).toEqual([
      [undefined, 1],
      ['comments', 3],
      ['comments', 2],
      [undefined, 1],
    ]);
    expect(foldLabel(runs[1])).toBe(
      '… 2 comment lines and 1 blank line removed',
    );
    expect(foldLabel(runs[2])).toBe('… 2 comment lines added');
  });

  it('shows a lone comment line, and a change that carries a value', () => {
    const runs = foldContext([
      { kind: 'removed', text: '# one', currentLine: 1 },
      { kind: 'added', text: '# one', line: 1 },
      { kind: 'added', text: 'a: 1', line: 2 },
    ]);
    expect(runs.map(r => [r.fold, r.lines.length])).toEqual([[undefined, 3]]);
  });
});
