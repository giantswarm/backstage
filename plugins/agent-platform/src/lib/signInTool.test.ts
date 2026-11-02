import {
  connectorsNeedingSignIn,
  presetsToAsk,
  signInToolOf,
  SIGN_IN_TOOL_SELECTOR,
} from './signInTool';
import { MAX_INLINE_SELECTORS, type ServerInfo } from './toolset';

const SERVERS: ServerInfo[] = [
  {
    name: 'grafana-cloud',
    group: 'registered',
    toolNamePrefix: 'x_grafana-cloud',
    oauth: true,
    signInTool: true,
  },
  {
    name: 'org-a/pro',
    group: 'registered',
    toolNamePrefix: 'x_org-a_pro',
    oauth: true,
    signInTool: true,
  },
  {
    name: 'kubernetes-gazelle',
    family: 'kubernetes',
    group: 'infrastructure',
    toolNamePrefix: 'x_kubernetes',
    oauth: true,
    signInTool: false,
  },
  {
    name: 'docs',
    group: 'registered',
    toolNamePrefix: 'x_docs',
    oauth: false,
  },
];

const signIn = (
  selection: string[],
  options: { declined?: boolean; presetsInclude?: boolean } = {},
) =>
  signInToolOf({
    selection,
    servers: SERVERS,
    declined: options.declined ?? false,
    presetsInclude: options.presetsInclude ?? false,
  });

describe('connectorsNeedingSignIn', () => {
  it('finds the connectors by their server selector or their tools, each once', () => {
    expect(
      connectorsNeedingSignIn(
        [
          'tool:x_org-a_pro_list_boards',
          'server:grafana-cloud',
          'tool:x_grafana-cloud_query',
          'server:kubernetes',
          'tool:x_docs_search',
          'preset:read-only',
        ],
        SERVERS,
      ),
    ).toEqual(['org-a/pro', 'grafana-cloud']);
  });
});

describe('presetsToAsk', () => {
  it('asks muster about an installation’s own presets only', () => {
    expect(
      presetsToAsk([
        'preset:read-only',
        'preset:full',
        'preset:none',
        'preset:infrastructure',
        'server:grafana-cloud',
      ]),
    ).toEqual(['preset:infrastructure']);
  });
});

describe('signInToolOf', () => {
  it('adds the sign-in tool for a connector that needs it', () => {
    expect(signIn(['server:grafana-cloud', 'tool:x_docs_search'])).toEqual({
      status: 'added',
      connectors: ['grafana-cloud'],
      toolset: [
        'server:grafana-cloud',
        'tool:x_docs_search',
        SIGN_IN_TOOL_SELECTOR,
      ],
    });
  });

  it('adds nothing where no selected connector needs it', () => {
    expect(signIn(['server:kubernetes', 'server:docs'])).toMatchObject({
      status: 'not-needed',
      toolset: ['server:kubernetes', 'server:docs'],
    });
    expect(signIn([]).status).toBe('not-needed');
  });

  it('adds nothing where the selection or a preset carries it', () => {
    expect(signIn(['server:grafana-cloud', SIGN_IN_TOOL_SELECTOR]).status).toBe(
      'present',
    );
    expect(signIn(['preset:read-only', 'server:grafana-cloud']).status).toBe(
      'covered',
    );
    expect(signIn(['preset:full']).status).toBe('not-needed');
    expect(
      signIn(['preset:infrastructure', 'server:grafana-cloud'], {
        presetsInclude: true,
      }).status,
    ).toBe('covered');
  });

  it('keeps it out once the person removed it, or where the cap leaves no room', () => {
    expect(signIn(['server:grafana-cloud'], { declined: true })).toMatchObject({
      status: 'removed',
      toolset: ['server:grafana-cloud'],
    });

    const full = [
      'server:grafana-cloud',
      ...Array.from(
        { length: MAX_INLINE_SELECTORS - 1 },
        (_, i) => `tool:x_docs_tool_${i}`,
      ),
    ];
    expect(signIn(full)).toMatchObject({ status: 'no-room', toolset: full });
  });
});
