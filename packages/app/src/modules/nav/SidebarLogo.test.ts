import { classicLogoTarget } from './SidebarLogo';

const bothPortals = { agentPlatform: true, platformPortal: true };

describe('classicLogoTarget', () => {
  it('leads to a classic root redirect in the same tab', () => {
    expect(classicLogoTarget(bothPortals, '/clusters')).toEqual({
      to: '/clusters',
      newTab: false,
    });
  });

  it('opens the shell in a new tab when the redirect is a shell page', () => {
    expect(classicLogoTarget(bothPortals, '/customize/agents')).toEqual({
      to: '/',
      newTab: true,
    });
  });

  it('counts the Platform section as the shell where it is on', () => {
    expect(
      classicLogoTarget(bothPortals, '/platform/clusters', {
        platformSection: true,
      }),
    ).toEqual({ to: '/', newTab: true });
  });

  it('keeps /platform a classic address where the section is off', () => {
    expect(classicLogoTarget(bothPortals, '/platform/clusters')).toEqual({
      to: '/platform/clusters',
      newTab: false,
    });
  });
});
