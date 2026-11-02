// The table app-config.yaml ships, read as shipped, so a test pins its values.
// A file of its own: it depends on the repository's root config, which the
// pattern-matching tests in contextWindows.test.ts do not.
// eslint-disable-next-line no-restricted-imports
import { readFileSync } from 'fs';
// eslint-disable-next-line no-restricted-imports
import { resolve } from 'path';
import { load } from 'js-yaml';

import { contextWindowFor } from './contextWindows';

describe('the default table in app-config.yaml', () => {
  const config = load(
    readFileSync(resolve(__dirname, '../../../../app-config.yaml'), 'utf8'),
  ) as {
    agentPlatform: { models: { contextWindows: Record<string, unknown> } };
  };
  const table = config.agentPlatform.models.contextWindows;

  it.each([
    // The 1M models, by default and with no beta header.
    ['claude-opus-5-5', 1_000_000],
    ['claude-sonnet-5-5', 1_000_000],
    ['claude-haiku-5-5', 1_000_000],
    ['claude-fable-5-1', 1_000_000],
    ['claude-opus-5', 1_000_000],
    ['claude-opus-4-6', 1_000_000],
    ['claude-sonnet-4-6', 1_000_000],
    // Bedrock and Vertex spellings.
    ['anthropic.claude-opus-5-5', 1_000_000],
    ['global.anthropic.claude-opus-4-6-v1', 1_000_000],
    // The 200k models, dated or not.
    ['claude-opus-4-5-20251101', 200_000],
    ['claude-sonnet-4-5', 200_000],
    ['claude-haiku-4-5@20251001', 200_000],
    ['us.anthropic.claude-haiku-4-5-20251001-v1:0', 200_000],
  ])('gives %s a %d-token window', (model, tokens) => {
    expect(contextWindowFor(model, table)).toBe(tokens);
  });

  it('names no window for a Claude model it does not list', () => {
    // No catch-all: a newer model shows its raw count, not a share of a
    // window it does not have.
    expect(contextWindowFor('claude-opus-6', table)).toBeUndefined();
  });
});
