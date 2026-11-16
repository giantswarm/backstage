// eslint-disable-next-line no-restricted-imports
import path from 'path';

import { collectToolCalls, fixtureToolCoverage } from './fixtureToolCoverage';

const SAMPLES = path.resolve(__dirname, '__fixtures__/toolCalls');

describe('collectToolCalls', () => {
  it('works out the tool names of every call form, and names what it cannot', () => {
    expect(collectToolCalls(SAMPLES)).toEqual({
      tools: [
        'core_bracket',
        'core_create',
        'core_destructured',
        'core_from_jsx',
        'core_joined',
        'core_update',
        'x_sample_read_thing',
        'x_sample_write_thing',
      ],
      unresolved: ['tools.ts: name'],
    });
  });
});

describe('fixtureToolCoverage', () => {
  it('reports what a guard must fix', () => {
    const report = fixtureToolCoverage({
      srcDir: SAMPLES,
      handled: new Set(['x_sample_read_thing', 'core_bracket', 'core_stale']),
      notServed: new Set([
        'x_sample_write_thing',
        'core_bracket',
        'x_sample_unused_thing',
      ]),
      unresolved: new Set(['tools.ts: name', 'Runner.tsx: tool']),
    });

    expect(report).toEqual(
      expect.objectContaining({
        missing: [
          'core_create',
          'core_destructured',
          'core_from_jsx',
          'core_joined',
          'core_update',
        ],
        staleNotServed: ['core_bracket', 'x_sample_unused_thing'],
        unresolved: [],
        staleUnresolved: ['Runner.tsx: tool'],
      }),
    );
  });
});
