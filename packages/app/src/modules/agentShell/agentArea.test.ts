import {
  configApiRef,
  featureFlagsApiRef,
  FeatureFlagState,
} from '@backstage/frontend-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/frontend-test-utils';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { isAgentArea, usePortals } from './agentArea';
import { AGENT_SHELL_FLAG } from './predicates';
import { PortalFeatureFlags } from './PortalFeatureFlags';

describe('isAgentArea', () => {
  it.each([
    '/',
    '/agent-platform',
    '/agent-platform/',
    '/agent-platform/sessions',
    '/agent-platform/agents/gazelle/kagent/sre',
    '/customize',
    '/customize/connectors',
  ])('counts %s as the agent area', pathname => {
    expect(isAgentArea(pathname)).toBe(true);
  });

  it.each([
    '/clusters',
    '/catalog',
    '/deployments',
    '/settings',
    '/settings/feature-flags',
    '/search',
    // Prefix matches respect path-segment boundaries.
    '/agent-platform-docs',
    '/customized',
  ])('keeps %s classic', pathname => {
    expect(isAgentArea(pathname)).toBe(false);
  });
});

describe('usePortals', () => {
  it('keeps the opt-in this load started with after the settings toggle flips it', () => {
    const config = mockApis.config({ data: {} });
    const inner = mockApis.featureFlags();
    inner.registerFlag({ name: AGENT_SHELL_FLAG, pluginId: 'app' });
    const featureFlags = new PortalFeatureFlags(config, inner);
    const { result, rerender } = renderHook(() => usePortals(), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(TestApiProvider, {
          apis: [
            [configApiRef, config],
            [featureFlagsApiRef, featureFlags],
          ],
          children,
        }),
    });
    expect(result.current.agentPlatform).toBe(false);

    act(() =>
      featureFlags.save({
        states: { [AGENT_SHELL_FLAG]: FeatureFlagState.Active },
      }),
    );
    rerender();
    expect(featureFlags.isActive(AGENT_SHELL_FLAG)).toBe(true);
    expect(result.current.agentPlatform).toBe(false);
  });
});
