import {
  isKagentMetadataFlagSet,
  readKagentMetadata,
  readKagentMetadataString,
  readKagentSubagentUsage,
  readKagentTimelinePosition,
} from './kagentMetadata';

describe('readKagentMetadata', () => {
  it.each([
    ['type', 'kagent.dev/a2a/part-type', 'function_call'],
    ['usage_metadata', 'kagent.dev/a2a/usage', { promptTokenCount: 1 }],
  ])('reads %s under its canonical key %s', (key, canonical, value) => {
    expect(readKagentMetadata({ [canonical]: value }, key)).toEqual(value);
  });

  it('prefers the canonical key over both legacy prefixes', () => {
    expect(
      readKagentMetadata(
        {
          'kagent.dev/a2a/part-type': 'function_response',
          adk_type: 'function_call',
          kagent_type: 'function_call',
        },
        'type',
      ),
    ).toBe('function_response');
  });

  it('reads a key without a canonical name under the prefixes only', () => {
    expect(
      readKagentMetadata({ 'kagent.dev/a2a/thought': true }, 'thought'),
    ).toBeUndefined();
  });

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

describe('readKagentTimelinePosition', () => {
  it('reads the canonical key first', () => {
    expect(
      readKagentTimelinePosition({
        'kagent.dev/a2a/timeline-position': '2026-09-25T10:00:00Z',
        'kagent.dev/timeline-position': '2026-09-11T03:02:56Z',
      }),
    ).toBe('2026-09-25T10:00:00Z');
  });

  it('falls back to the key older controllers wrote', () => {
    expect(
      readKagentTimelinePosition({
        'kagent.dev/timeline-position': '2026-09-11T03:02:56Z',
      }),
    ).toBe('2026-09-11T03:02:56Z');
  });

  it.each([undefined, {}, { 'kagent.dev/a2a/timeline-position': 3 }])(
    'returns undefined for %p',
    input => {
      expect(readKagentTimelinePosition(input)).toBeUndefined();
    },
  );
});

describe('readKagentSubagentUsage', () => {
  it("reads the usage field of a delegated agent's response", () => {
    expect(
      readKagentSubagentUsage({ result: 'ok', usage: { promptTokenCount: 5 } }),
    ).toEqual({ promptTokenCount: 5 });
  });

  it('falls back to the metadata-style key', () => {
    expect(
      readKagentSubagentUsage({
        kagent_usage_metadata: { promptTokenCount: 7 },
      }),
    ).toEqual({ promptTokenCount: 7 });
  });
});
