import { mockServices } from '@backstage/backend-test-utils';
import { JsonObject } from '@backstage/types';
import {
  deriveMusterUrl,
  musterInstallationRequiresAuth,
  resolveMusterInstallations,
} from './musterInstallations';

// The fleet as the portal knows it: three installations with a base domain
// (a muster can be derived) and one without (nothing to derive from).
const FLEET: JsonObject = {
  gs: {
    installations: {
      gazelle: { baseDomain: 'gazelle.example.test', pipeline: 'stable' },
      golem: { baseDomain: 'golem.example.test' },
      wombat: { baseDomain: 'wombat.example.test' },
      snail: { pipeline: 'testing' },
    },
  },
};

function resolve(data: JsonObject) {
  const logger = mockServices.logger.mock();
  const config = mockServices.rootConfig({ data });
  return { ...resolveMusterInstallations(config, logger), logger };
}

describe('deriveMusterUrl', () => {
  it('builds the aggregator endpoint from the base domain, MCP path included', () => {
    expect(deriveMusterUrl('gazelle.example.test')).toBe(
      'https://muster.gazelle.example.test/mcp',
    );
  });

  it('derives nothing without a base domain', () => {
    expect(deriveMusterUrl(undefined)).toBeUndefined();
    expect(deriveMusterUrl('')).toBeUndefined();
  });
});

describe('resolveMusterInstallations', () => {
  it('derives one entry per installation with a base domain', () => {
    const { installations, counts } = resolve(FLEET);

    expect([...installations.keys()]).toEqual(['gazelle', 'golem', 'wombat']);
    expect(installations.get('golem')).toEqual({
      name: 'golem',
      url: 'https://muster.golem.example.test/mcp',
      source: 'derived',
    });
    expect(counts).toEqual({ derived: 3, configured: 0, total: 3 });
  });

  it('lets a configured entry override the derived url, headers and prometheusServer', () => {
    const { installations, counts } = resolve({
      ...FLEET,
      muster: {
        installations: [
          {
            name: 'golem',
            url: 'https://muster-internal.golem.example.test/mcp',
            headers: { 'X-Portal': 'yes' },
            prometheusServer: 'golem-prometheus',
            authProvider: 'mcp-muster',
          },
        ],
      },
    });

    expect(installations.get('golem')).toEqual({
      name: 'golem',
      url: 'https://muster-internal.golem.example.test/mcp',
      headers: { 'X-Portal': 'yes' },
      prometheusServer: 'golem-prometheus',
      authProvider: 'mcp-muster',
      source: 'configured',
    });
    // The other two stay derived; the override keeps golem's position.
    expect([...installations.keys()]).toEqual(['gazelle', 'golem', 'wombat']);
    expect(installations.get('gazelle')?.source).toBe('derived');
    expect(counts).toEqual({ derived: 2, configured: 1, total: 3 });
  });

  it('lets a configured entry override only some fields, keeping the derived url', () => {
    const { installations } = resolve({
      ...FLEET,
      muster: {
        installations: [{ name: 'wombat', prometheusServer: 'wombat-mimir' }],
      },
    });

    expect(installations.get('wombat')).toEqual({
      name: 'wombat',
      url: 'https://muster.wombat.example.test/mcp',
      authProvider: undefined,
      headers: undefined,
      prometheusServer: 'wombat-mimir',
      source: 'configured',
    });
  });

  it('adds a configured entry the fleet configuration does not know', () => {
    const { installations, counts } = resolve({
      ...FLEET,
      muster: {
        installations: [
          { name: 'lab', url: 'https://muster.lab.example.test/mcp' },
        ],
      },
    });

    expect([...installations.keys()]).toEqual([
      'gazelle',
      'golem',
      'wombat',
      'lab',
    ]);
    expect(installations.get('lab')).toMatchObject({
      url: 'https://muster.lab.example.test/mcp',
      source: 'configured',
    });
    expect(counts).toEqual({ derived: 3, configured: 1, total: 4 });
  });

  it('skips, with a warning, a configured entry that has neither a url nor a base domain to derive one', () => {
    const { installations, logger } = resolve({
      ...FLEET,
      muster: { installations: [{ name: 'snail' }] },
    });

    expect(installations.has('snail')).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Skipping muster installation 'snail'"),
    );
  });

  it('keeps the first of two configured entries with the same name', () => {
    const { installations, logger } = resolve({
      muster: {
        installations: [
          { name: 'lab', url: 'https://first/mcp' },
          { name: 'lab', url: 'https://second/mcp' },
        ],
      },
    });

    expect(installations.get('lab')?.url).toBe('https://first/mcp');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Duplicate muster installation 'lab'"),
    );
  });

  it('works from muster.installations alone, as before', () => {
    const { installations, counts } = resolve({
      muster: {
        installations: [
          { name: 'gazelle', url: 'https://muster.gazelle/mcp' },
          {
            name: 'graveler',
            url: 'https://muster.graveler/mcp',
            authProvider: 'mcp-muster',
          },
        ],
      },
    });

    expect([...installations.keys()]).toEqual(['gazelle', 'graveler']);
    expect(installations.get('graveler')).toMatchObject({
      authProvider: 'mcp-muster',
      source: 'configured',
    });
    expect(counts).toEqual({ derived: 0, configured: 2, total: 2 });
  });

  it('falls back to the legacy aiChat.mcp entry when neither source yields anything', () => {
    const { installations, counts } = resolve({
      aiChat: { mcp: [{ name: 'muster', url: 'http://muster/mcp' }] },
      // A fleet without base domains derives nothing, so the legacy entry
      // still applies.
      gs: { installations: { snail: { pipeline: 'testing' } } },
    });

    expect([...installations.keys()]).toEqual(['muster']);
    expect(installations.get('muster')).toMatchObject({
      name: 'muster',
      url: 'http://muster/mcp',
      source: 'configured',
    });
    expect(counts).toEqual({ derived: 0, configured: 1, total: 1 });
  });

  it('honours muster.serverName on the legacy path', () => {
    const { installations } = resolve({
      muster: { serverName: 'muster-prod' },
      aiChat: { mcp: [{ name: 'muster-prod', url: 'http://prod/mcp' }] },
    });

    expect([...installations.keys()]).toEqual(['muster-prod']);
  });

  it('ignores the legacy entry once installations are derived or configured', () => {
    const { installations } = resolve({
      ...FLEET,
      aiChat: { mcp: [{ name: 'muster', url: 'http://localhost:8091/mcp' }] },
    });

    expect(installations.has('muster')).toBe(false);
    expect(installations.size).toBe(3);
  });

  it('returns an empty map without any configuration', () => {
    const { installations, counts } = resolve({});

    expect(installations.size).toBe(0);
    expect(counts).toEqual({ derived: 0, configured: 0, total: 0 });
  });
});

describe('musterInstallationRequiresAuth', () => {
  it('gates a derived entry always, a configured one only with an authProvider', () => {
    expect(musterInstallationRequiresAuth({ source: 'derived' })).toBe(true);
    expect(
      musterInstallationRequiresAuth({
        source: 'configured',
        authProvider: 'mcp-muster',
      }),
    ).toBe(true);
    expect(musterInstallationRequiresAuth({ source: 'configured' })).toBe(
      false,
    );
    expect(musterInstallationRequiresAuth({})).toBe(false);
  });
});
