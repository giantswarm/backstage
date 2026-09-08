import {
  isKagentMetadataFlagSet,
  readKagentMetadata,
  readKagentMetadataString,
} from './kagentMetadata';

describe('readKagentMetadata', () => {
  it('prefers the adk_ prefix over kagent_', () => {
    // Mirrors kagent's own getMetadataValue: upstream ADK writes adk_, kagent
    // writes kagent_, and a session can contain both.
    expect(
      readKagentMetadata(
        { adk_author: 'from-adk', kagent_author: 'from-kagent' },
        'author',
      ),
    ).toBe('from-adk');
  });

  it('falls back to the kagent_ prefix', () => {
    expect(readKagentMetadata({ kagent_author: 'from-kagent' }, 'author')).toBe(
      'from-kagent',
    );
  });

  it('ignores an unprefixed key', () => {
    // Reading a bare key would pick up unrelated fields that happen to collide.
    expect(readKagentMetadata({ author: 'bare' }, 'author')).toBeUndefined();
  });

  it('returns a present-but-falsy value rather than skipping it', () => {
    // `in` rather than truthiness: `thought: false` is a real answer.
    expect(readKagentMetadata({ adk_thought: false }, 'thought')).toBe(false);
  });

  it.each([undefined, null, 0, 'nope', [], [{ adk_author: 'x' }]])(
    'returns undefined for %p',
    input => {
      expect(readKagentMetadata(input, 'author')).toBeUndefined();
    },
  );
});

describe('readKagentMetadataString', () => {
  it('accepts a non-empty string under either prefix', () => {
    expect(
      readKagentMetadataString({ kagent_type: 'function_call' }, 'type'),
    ).toBe('function_call');
  });

  it.each<[unknown, string]>([
    ['', 'empty string'],
    [0, 'a number'],
    [{}, 'an object'],
  ])('rejects %p (%s)', value => {
    expect(
      readKagentMetadataString({ kagent_type: value }, 'type'),
    ).toBeUndefined();
  });
});

describe('isKagentMetadataFlagSet', () => {
  it('is true only for a strict boolean true', () => {
    expect(isKagentMetadataFlagSet({ adk_thought: true }, 'thought')).toBe(
      true,
    );
  });

  it.each(['true', 1, {}, false, undefined])('is false for %p', value => {
    expect(isKagentMetadataFlagSet({ adk_thought: value }, 'thought')).toBe(
      false,
    );
  });
});
