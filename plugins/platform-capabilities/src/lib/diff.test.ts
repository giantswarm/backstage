import { diffLines, foldContext, splitLines } from './diff';

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
    expect(diffLines('a\nb', 'a\nc\nd').map(l => l.kind)).toEqual([
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
    expect(runs.map(r => [r.folded, r.lines.length])).toEqual([
      [true, 4],
      [false, 2 + 1 + 2],
      [true, 4],
    ]);
  });

  it('leaves a short unchanged stretch shown', () => {
    const runs = foldContext([
      { kind: 'added', text: 'x', line: 1 },
      ...context(4),
      { kind: 'removed', text: 'y', currentLine: 9 },
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0].folded).toBe(false);
  });
});
