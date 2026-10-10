import { FeatureFlagState } from '@backstage/frontend-plugin-api';
import { mockApis } from '@backstage/frontend-test-utils';
import { AGENT_SHELL_FLAG } from './predicates';
import { PortalFeatureFlags } from './PortalFeatureFlags';

function flagsFor(
  portals: { platformPortal?: boolean; agentPlatform?: boolean } | undefined,
  states: Record<string, FeatureFlagState> = {},
) {
  const inner = mockApis.featureFlags({ initialStates: states });
  inner.registerFlag({ name: AGENT_SHELL_FLAG, pluginId: 'app' });
  inner.registerFlag({ name: 'other-flag', pluginId: 'app' });
  return new PortalFeatureFlags(
    mockApis.config({ data: portals ? { app: { portals } } : {} }),
    inner,
  );
}

describe('PortalFeatureFlags', () => {
  it('reports the agent shell on for everyone when the deployment switched it on', () => {
    expect(flagsFor({ agentPlatform: true }).isActive(AGENT_SHELL_FLAG)).toBe(
      true,
    );
    expect(
      flagsFor({ platformPortal: false, agentPlatform: true }).isActive(
        AGENT_SHELL_FLAG,
      ),
    ).toBe(true);
  });

  it('reports the agent shell off by default', () => {
    expect(flagsFor(undefined).isActive(AGENT_SHELL_FLAG)).toBe(false);
    expect(
      flagsFor({ platformPortal: true, agentPlatform: false }).isActive(
        AGENT_SHELL_FLAG,
      ),
    ).toBe(false);
  });

  it('honours the person’s opt-in while the deployment has the shell off', () => {
    expect(
      flagsFor(
        { agentPlatform: false },
        { [AGENT_SHELL_FLAG]: FeatureFlagState.Active },
      ).isActive(AGENT_SHELL_FLAG),
    ).toBe(true);
  });

  it('lists the opt-in flag only while it means something', () => {
    const names = (flags: PortalFeatureFlags) =>
      flags.getRegisteredFlags().map(flag => flag.name);

    expect(names(flagsFor(undefined))).toEqual([
      AGENT_SHELL_FLAG,
      'other-flag',
    ]);
    expect(names(flagsFor({ agentPlatform: true }))).toEqual(['other-flag']);
  });

  it('passes every other flag through', () => {
    const flags = flagsFor(
      { agentPlatform: true },
      { 'other-flag': FeatureFlagState.Active },
    );
    expect(flags.isActive('other-flag')).toBe(true);

    flags.save({ states: { 'other-flag': FeatureFlagState.None } });
    expect(flags.isActive('other-flag')).toBe(false);
  });
});
