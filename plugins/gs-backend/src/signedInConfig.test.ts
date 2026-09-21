import { mockServices } from '@backstage/backend-test-utils';
import {
  projectConfigPaths,
  readSignedInConfig,
  SIGNED_IN_CONFIG_PATHS,
} from './signedInConfig';

describe('projectConfigPaths', () => {
  it('keeps only the named paths, in app-config shape', () => {
    const projected = projectConfigPaths(
      {
        gs: {
          adminGroups: ['admins'],
          authProvider: 'oidc-main',
          clusterTokenBroker: {
            tokenUrl: 'https://muster.example.com/oauth/token',
            clientId: 'portal',
            clientSecret: 'hunter2',
          },
        },
        auth: { providers: { 'oidc-main': {} } },
      },
      ['gs.adminGroups', 'gs.clusterTokenBroker.tokenUrl'],
    );

    expect(projected).toEqual({
      gs: {
        adminGroups: ['admins'],
        clusterTokenBroker: {
          tokenUrl: 'https://muster.example.com/oauth/token',
        },
      },
    });
  });

  it('projects fields of every array element and merges them per element', () => {
    const projected = projectConfigPaths(
      {
        muster: {
          installations: [
            {
              name: 'golem',
              url: 'https://muster.golem.example.com/mcp',
              authProvider: 'mcp-muster',
              headers: { 'X-Secret': 's' },
            },
            { name: 'gaggle', url: 'https://muster.gaggle.example.com/mcp' },
          ],
        },
      },
      ['muster.installations[].name', 'muster.installations[].authProvider'],
    );

    expect(projected).toEqual({
      muster: {
        installations: [
          { name: 'golem', authProvider: 'mcp-muster' },
          { name: 'gaggle' },
        ],
      },
    });
  });

  it('contributes nothing for a path that is not set', () => {
    expect(
      projectConfigPaths({ gs: { authProvider: 'oidc-main' } }, [
        'gs.adminGroups',
        'muster.installations[].name',
        'flux.gitRepositoryPatterns',
      ]),
    ).toEqual({});
  });

  it('takes a whole subtree when the path ends at an object or array', () => {
    const installations = {
      golem: { pipeline: 'stable', baseDomain: 'golem.example.com' },
    };
    const patterns = [{ targetUrl: 'a', gitRepositoryUrlPattern: 'b' }];

    expect(
      projectConfigPaths(
        { gs: { installations }, flux: { gitRepositoryPatterns: patterns } },
        ['gs.installations', 'flux.gitRepositoryPatterns'],
      ),
    ).toEqual({
      gs: { installations },
      flux: { gitRepositoryPatterns: patterns },
    });
  });
});

describe('readSignedInConfig', () => {
  it('serves the allowlisted paths and nothing next to them', () => {
    const config = mockServices.rootConfig({
      data: {
        app: { baseUrl: 'https://portal.example.com' },
        gs: {
          authProvider: 'oidc-main',
          adminGroups: ['admins'],
          installations: {
            golem: { authProvider: 'oidc', baseDomain: 'golem.example.com' },
          },
          clusterTokenBroker: {
            tokenUrl: 'https://muster.example.com/oauth/token',
            clientId: 'portal',
            clientSecret: 'hunter2',
          },
          containerRegistry: {
            registries: [
              { host: 'r.example.com', username: 'u', password: 'p' },
            ],
          },
        },
        muster: {
          installations: [
            {
              name: 'golem',
              url: 'https://muster.golem.example.com/mcp',
              authProvider: 'mcp-muster',
            },
          ],
        },
        aiChat: {
          mcp: [{ name: 'muster', authProvider: 'mcp-muster', url: 'x' }],
        },
      },
    });

    expect(readSignedInConfig(config)).toEqual({
      gs: {
        adminGroups: ['admins'],
        installations: {
          golem: { authProvider: 'oidc', baseDomain: 'golem.example.com' },
        },
        clusterTokenBroker: {
          tokenUrl: 'https://muster.example.com/oauth/token',
        },
      },
      muster: {
        installations: [{ name: 'golem', authProvider: 'mcp-muster' }],
      },
      aiChat: {
        mcp: [{ name: 'muster', authProvider: 'mcp-muster' }],
      },
    });
  });

  it('names no secret and no public path in the allowlist', () => {
    for (const path of SIGNED_IN_CONFIG_PATHS) {
      expect(path).not.toMatch(/secret|password|clientId|token$/i);
      expect(path).not.toMatch(/^(app|auth|backend)\./);
      expect(path).not.toBe('gs.authProvider');
    }
  });
});
