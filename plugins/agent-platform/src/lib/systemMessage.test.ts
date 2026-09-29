import {
  MAX_SYSTEM_MESSAGE_LENGTH,
  characterCount,
  systemMessageProblem,
} from './systemMessage';

describe('characterCount', () => {
  it('counts code points, not UTF-16 units', () => {
    expect(characterCount('abc')).toBe(3);
    expect(characterCount('é')).toBe(1);
    expect('🙂'.length).toBe(2);
    expect(characterCount('🙂🙂')).toBe(2);
  });
});

describe('systemMessageProblem', () => {
  it('accepts a prompt at the limit', () => {
    expect(
      systemMessageProblem('a'.repeat(MAX_SYSTEM_MESSAGE_LENGTH)),
    ).toBeUndefined();
    // 20,000 emoji are 40,000 UTF-16 units and still within the limit.
    expect(
      systemMessageProblem('🙂'.repeat(MAX_SYSTEM_MESSAGE_LENGTH)),
    ).toBeUndefined();
  });

  it('names the length and the limit past it', () => {
    expect(
      systemMessageProblem('日'.repeat(MAX_SYSTEM_MESSAGE_LENGTH + 1)),
    ).toBe(
      'System prompt is 20,001 characters; the limit is 20,000. Move long reference material into a skill',
    );
  });
});
