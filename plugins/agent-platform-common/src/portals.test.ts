import { isAgentShellOptInOffered, readPortals } from './portals';

function readerOf(portals: {
  platformPortal?: boolean;
  agentPlatform?: boolean;
}) {
  return {
    getOptionalBoolean: (key: string) =>
      ({
        'app.portals.platformPortal': portals.platformPortal,
        'app.portals.agentPlatform': portals.agentPlatform,
      })[key],
  };
}

describe('readPortals', () => {
  it('is the classic portal alone when nothing is configured', () => {
    expect(readPortals(undefined)).toEqual({
      platformPortal: true,
      agentPlatform: false,
    });
    expect(readPortals(readerOf({}))).toEqual({
      platformPortal: true,
      agentPlatform: false,
    });
  });

  it('serves both portals when both are switched on', () => {
    expect(
      readPortals(readerOf({ platformPortal: true, agentPlatform: true })),
    ).toEqual({ platformPortal: true, agentPlatform: true });
    // The Platform Portal defaults to on.
    expect(readPortals(readerOf({ agentPlatform: true }))).toEqual({
      platformPortal: true,
      agentPlatform: true,
    });
  });

  it('serves the Agent Platform alone when the Platform Portal is off', () => {
    expect(
      readPortals(readerOf({ platformPortal: false, agentPlatform: true })),
    ).toEqual({ platformPortal: false, agentPlatform: true });
  });

  it('serves the Platform Portal alone when the Agent Platform is off', () => {
    expect(
      readPortals(readerOf({ platformPortal: true, agentPlatform: false })),
    ).toEqual({ platformPortal: true, agentPlatform: false });
  });

  it('falls back to the classic portal when both are switched off', () => {
    expect(
      readPortals(readerOf({ platformPortal: false, agentPlatform: false })),
    ).toEqual({ platformPortal: true, agentPlatform: false });
  });

  it('adds the Agent Platform for a person who opted in while it is off', () => {
    expect(readPortals(readerOf({}), { agentShellOptIn: true })).toEqual({
      platformPortal: true,
      agentPlatform: true,
    });
  });

  it('is idempotent in the opt-in', () => {
    for (const config of [
      {},
      { agentPlatform: true },
      { platformPortal: false, agentPlatform: true },
      { platformPortal: false, agentPlatform: false },
    ]) {
      for (const agentShellOptIn of [false, true]) {
        const once = readPortals(readerOf(config), { agentShellOptIn });
        expect(
          readPortals(readerOf(config), {
            agentShellOptIn: once.agentPlatform,
          }),
        ).toEqual(once);
      }
    }
  });
});

describe('isAgentShellOptInOffered', () => {
  it('offers the opt-in only while the deployment has the Agent Platform off', () => {
    expect(isAgentShellOptInOffered(undefined)).toBe(true);
    expect(isAgentShellOptInOffered(readerOf({}))).toBe(true);
    expect(isAgentShellOptInOffered(readerOf({ agentPlatform: false }))).toBe(
      true,
    );
    expect(isAgentShellOptInOffered(readerOf({ agentPlatform: true }))).toBe(
      false,
    );
    expect(
      isAgentShellOptInOffered(
        readerOf({ platformPortal: false, agentPlatform: true }),
      ),
    ).toBe(false);
  });
});
