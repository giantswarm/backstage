import { fencedData, INLINE_DATA_MAX_CHARS, inlineData } from './promptData';

describe('inlineData', () => {
  it('keeps a plain name as it is', () => {
    expect(inlineData('ticket-triage')).toBe('ticket-triage');
  });

  it('folds line breaks and control characters into single spaces', () => {
    expect(inlineData(' a\n\nb\r\tc\u2028d\u0007e ')).toBe('a b c d e');
  });

  it('replaces the characters that could end the quotes around it', () => {
    expect(inlineData('x" and `y`')).toBe("x' and 'y'");
  });

  it(`caps it at ${INLINE_DATA_MAX_CHARS} characters`, () => {
    const capped = inlineData('n'.repeat(500));
    expect(capped).toHaveLength(INLINE_DATA_MAX_CHARS);
    expect(capped.endsWith('…')).toBe(true);
  });
});

describe('fencedData', () => {
  it('fences with three backticks by default', () => {
    expect(fencedData('a: 1', 'yaml')).toBe('```yaml\na: 1\n```');
  });

  it('uses a fence longer than any backtick run inside', () => {
    expect(fencedData('x\n`````\ny', 'markdown')).toBe(
      '``````markdown\nx\n`````\ny\n``````',
    );
  });
});
