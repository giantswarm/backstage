import { renderHook } from '@testing-library/react';
import type { LlmUsage } from '../lib/llmUsage';
import { useLlmUsageView } from './useLlmUsageView';

const installationState = {
  installation: 'gazelle' as string | undefined,
  candidates: ['gazelle'] as string[],
  isResolvedFromAll: false,
  notReachable: [] as string[],
  isLoading: false,
  hasInstallations: true,
};

const usageState = {
  usage: undefined as LlmUsage | undefined,
  isLoading: false,
  isError: false,
  isAvailable: true as boolean | undefined,
};

const DEFAULT_INSTALLATION = { ...installationState };
const DEFAULT_USAGE = { ...usageState };

jest.mock('./useUsageInstallation', () => ({
  useUsageInstallation: () => installationState,
}));

jest.mock('./useLlmUsage', () => ({
  useLlmUsage: () => usageState,
}));

/** Enough of an `LlmUsage` for `hasAnyLlmUsage` to answer. */
function usage(overrides: { tokens?: number; calls?: number } = {}): LlmUsage {
  return {
    totals: { tokens: overrides.tokens ?? 5000, calls: overrides.calls ?? 10 },
  } as unknown as LlmUsage;
}

beforeEach(() => {
  Object.assign(installationState, DEFAULT_INSTALLATION);
  Object.assign(usageState, DEFAULT_USAGE);
});

const state = () => renderHook(() => useLlmUsageView()).result.current.state;

describe('useLlmUsageView', () => {
  it('is ready once Mimir answered with usage', () => {
    usageState.usage = usage();

    expect(state()).toBe('ready');
  });

  it('says nothing happened rather than rendering a strip of zeros', () => {
    usageState.usage = usage({ tokens: 0, calls: 0 });

    expect(state()).toBe('empty');
  });

  it('is ready when tokens flowed but nothing could be priced', () => {
    // An installation with no price catalogue has real usage and no cost. That
    // is a page worth rendering, not an empty window.
    usageState.usage = usage({ tokens: 5000, calls: 0 });

    expect(state()).toBe('ready');
  });

  it('reports no installations before anything else', () => {
    installationState.hasInstallations = false;
    installationState.candidates = [];
    installationState.installation = undefined;

    expect(state()).toBe('no-installations');
  });

  it('distinguishes unreachable from not-running-kagent', () => {
    installationState.candidates = [];
    installationState.installation = undefined;
    installationState.notReachable = ['gazelle'];
    expect(state()).toBe('none-reachable');

    installationState.notReachable = [];
    expect(state()).toBe('no-kagent');
  });

  it('stays loading while the installation is still resolving', () => {
    installationState.isLoading = true;
    installationState.candidates = [];
    installationState.installation = undefined;

    // Not 'no-kagent': the candidate list is empty because nothing has been
    // resolved yet, and reporting a factual negative here would retract itself
    // a moment later.
    expect(state()).toBe('loading');
  });

  it('prefers loading over unavailable while availability is unknown', () => {
    // `useMimirQuery` reports loading exactly while the installations config
    // has not resolved, which is when availability is `undefined`. Claiming
    // "no metrics on this installation" then would be wrong half the time.
    usageState.isLoading = true;
    usageState.isAvailable = undefined;

    expect(state()).toBe('loading');
  });

  it('reports the Mimir opt-out once it is known', () => {
    usageState.isAvailable = false;

    expect(state()).toBe('unavailable');
  });

  it('reports an error over an empty window', () => {
    // A failed read has no usage either; saying "nothing happened" about it
    // would state a factual negative nothing established.
    usageState.isError = true;
    usageState.usage = undefined;

    expect(state()).toBe('error');
  });
});
