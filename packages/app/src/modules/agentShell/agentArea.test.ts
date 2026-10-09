import { isAgentArea } from './agentArea';

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
