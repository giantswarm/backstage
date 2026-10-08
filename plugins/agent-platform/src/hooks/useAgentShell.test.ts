import { FeatureFlagState } from '@backstage/frontend-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/frontend-test-utils';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

import { AGENT_SHELL_FLAG, useAgentShell } from './useAgentShell';

function renderWithFlag(state?: FeatureFlagState) {
  const featureFlags = mockApis.featureFlags({
    initialStates: state === undefined ? {} : { [AGENT_SHELL_FLAG]: state },
  });
  return renderHook(() => useAgentShell(), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(TestApiProvider, { apis: [featureFlags], children }),
  });
}

describe('useAgentShell', () => {
  it('names the agent-platform-shell flag', () => {
    expect(AGENT_SHELL_FLAG).toBe('agent-platform-shell');
  });

  it('is true while the flag is active', () => {
    expect(renderWithFlag(FeatureFlagState.Active).result.current).toBe(true);
  });

  it('is false while the flag is off', () => {
    expect(renderWithFlag(FeatureFlagState.None).result.current).toBe(false);
  });

  it('is false when the flag was never set', () => {
    expect(renderWithFlag().result.current).toBe(false);
  });
});
