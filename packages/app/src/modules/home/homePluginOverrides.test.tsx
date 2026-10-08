import {
  FeatureFlagState,
  type ExtensionDefinition,
} from '@backstage/frontend-plugin-api';
import {
  evaluateFilterPredicate,
  type FilterPredicate,
} from '@backstage/filter-predicates';
import { mockApis, renderTestApp } from '@backstage/frontend-test-utils';
import homePlugin from '@backstage/plugin-home/alpha';
import { screen } from '@testing-library/react';
import { AGENT_SHELL_FLAG } from '../agentShell/predicates';
import { AgentShellHomePage } from './AgentShellHomePage';
import { HomePageOverride } from './HomePageOverride';
import { homePluginOverrides } from './index';

jest.mock('./RootPage', () => ({
  RootPage: () => <div data-testid="classic-home" />,
}));

jest.mock('@giantswarm/backstage-plugin-agent-platform', () => ({
  AgentPlatformHome: () => <div data-testid="agent-shell-home" />,
}));

function enabledWith(extension: ExtensionDefinition, featureFlags: string[]) {
  const predicate = (extension as unknown as { if?: FilterPredicate }).if;
  expect(predicate).toBeDefined();
  return evaluateFilterPredicate(predicate!, { featureFlags });
}

describe('home page overrides', () => {
  it('serves the classic home page while the agent shell flag is off', () => {
    expect(enabledWith(HomePageOverride, [])).toBe(true);
    expect(enabledWith(HomePageOverride, [AGENT_SHELL_FLAG])).toBe(false);
  });

  it('serves the agent shell home page while the flag is on', () => {
    expect(enabledWith(AgentShellHomePage, [AGENT_SHELL_FLAG])).toBe(true);
    expect(enabledWith(AgentShellHomePage, [])).toBe(false);
  });

  it('gives the agent shell home page an extension of its own', () => {
    expect(AgentShellHomePage).toMatchObject({
      kind: 'page',
      name: 'agent-shell',
    });
    expect(HomePageOverride).toMatchObject({ kind: 'page', name: undefined });
  });
});

function renderHome(flag: FeatureFlagState) {
  return renderTestApp({
    features: [homePlugin, homePluginOverrides],
    initialRouteEntries: ['/'],
    apis: [
      mockApis.featureFlags({ initialStates: { [AGENT_SHELL_FLAG]: flag } }),
    ],
  });
}

describe('the page at /', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    // The override does not declare the home plugin's `widgets` input, which
    // the app tree reports for every widget the plugin attaches to it.
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('is the classic home page while the agent shell flag is off', async () => {
    renderHome(FeatureFlagState.None);

    expect(await screen.findByTestId('classic-home')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-shell-home')).not.toBeInTheDocument();
  });

  it('is the new-session screen while the flag is on', async () => {
    renderHome(FeatureFlagState.Active);

    expect(await screen.findByTestId('agent-shell-home')).toBeInTheDocument();
    expect(screen.queryByTestId('classic-home')).not.toBeInTheDocument();
  });
});
