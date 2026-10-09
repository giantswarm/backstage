import { FeatureFlagState } from '@backstage/frontend-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/frontend-test-utils';
import { AGENT_SHELL_FLAG } from '@giantswarm/backstage-plugin-agent-platform-common';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

import { useAgentShell } from './useAgentShell';

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
  it('reads the agent-platform-shell flag', () => {
    expect(AGENT_SHELL_FLAG).toBe('agent-platform-shell');
  });

  it('is true while the flag is active', () => {
    expect(renderWithFlag(FeatureFlagState.Active).result.current).toBe(true);
  });

  it('is false while the flag is off or was never set', () => {
    expect(renderWithFlag(FeatureFlagState.None).result.current).toBe(false);
    expect(renderWithFlag().result.current).toBe(false);
  });
});
