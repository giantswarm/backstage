import type { ToolSummary } from '@giantswarm/backstage-plugin-muster';

import {
  buildCatalogue,
  type DeclaredToolset,
  type ServerInfo,
} from './toolset';
import {
  describeReach,
  presetPhrase,
  reachNeedsCatalogue,
} from './toolsetReach';

const reads = (name: string): ToolSummary => ({
  name,
  kind: 'tool',
  annotations: { readOnlyHint: true },
});
const changes = (name: string): ToolSummary => ({ name, kind: 'tool' });
const core = (name: string): ToolSummary => ({ name, kind: 'core' });

const server = (name: string): ServerInfo => ({
  name,
  group: 'infrastructure',
  toolNamePrefix: `x_${name}`,
  oauth: false,
});

const CONNECTORS = ['kubernetes', 'cluster-manager', 'github', 'jira', 'slack'];

// Every connector has two read-only tools and one that changes things.
const GROUPS = buildCatalogue(
  [
    ...CONNECTORS.flatMap(name => [
      reads(`x_${name}_get`),
      reads(`x_${name}_list`),
      changes(`x_${name}_update`),
    ]),
    core('core_auth_login'),
    core('core_service_list'),
  ],
  CONNECTORS.map(server),
  [],
);

const all = (name: string) => [
  `tool:x_${name}_get`,
  `tool:x_${name}_list`,
  `tool:x_${name}_update`,
];
const readOnly = (name: string) => [
  `tool:x_${name}_get`,
  `tool:x_${name}_list`,
];

const reach = (selectors: string[], groups = GROUPS) =>
  describeReach({ state: 'declared', carrier: 'sre-agent', selectors }, groups);

describe('describeReach', () => {
  it('names a connector whose every tool is chosen plainly', () => {
    expect(reach(['server:kubernetes', ...all('cluster-manager')])).toBe(
      'Can use cluster-manager and kubernetes.',
    );
  });

  it('says "read from" for exactly the read-only tools', () => {
    expect(
      reach([...readOnly('kubernetes'), ...readOnly('cluster-manager')]),
    ).toBe('Can read from cluster-manager and kubernetes.');
  });

  it('says "some tools from" for any other pick', () => {
    expect(
      reach(['tool:x_cluster-manager_get', 'tool:x_cluster-manager_update']),
    ).toBe('Can use some tools from cluster-manager.');
  });

  it('combines mixed coverage in one sentence', () => {
    expect(
      reach([
        'server:kubernetes',
        ...readOnly('github'),
        'tool:x_cluster-manager_get',
      ]),
    ).toBe(
      'Can use kubernetes, read from github and use some tools from cluster-manager.',
    );
    // Without read-only coverage, the two uses share one verb.
    expect(reach(['server:kubernetes', 'tool:x_cluster-manager_get'])).toBe(
      'Can use kubernetes and some tools from cluster-manager.',
    );
    // Workflows and muster's own tools follow the connectors they share a verb with.
    expect(
      reach([
        'server:kubernetes',
        ...readOnly('github'),
        'workflow:triage',
        'tool:x_cluster-manager_get',
      ]),
    ).toBe(
      'Can use kubernetes and the triage workflow, read from github and use some tools from cluster-manager.',
    );
    expect(reach(['tool:x_cluster-manager_get', 'tool:core_auth_login'])).toBe(
      'Can use some tools from cluster-manager and some platform tools.',
    );
    // A serial comma once a clause lists with "and" itself.
    expect(
      reach([
        'server:kubernetes',
        'server:slack',
        ...readOnly('github'),
        'tool:x_cluster-manager_get',
      ]),
    ).toBe(
      'Can use kubernetes and slack, read from github, and use some tools from cluster-manager.',
    );
  });

  it('calls muster’s own tools platform tools', () => {
    expect(
      reach([
        'tool:x_cluster-manager_get',
        'tool:x_cluster-manager_list',
        'tool:x_cluster-manager_update',
        'tool:core_auth_login',
      ]),
    ).toBe('Can use cluster-manager and some platform tools.');
    expect(reach(['tool:core_auth_login', 'tool:core_service_list'])).toBe(
      'Can use platform tools.',
    );
  });

  it('caps a long fleet with "and N more"', () => {
    expect(reach(CONNECTORS.flatMap(readOnly))).toBe(
      'Can read from cluster-manager, github, jira, kubernetes and slack.',
    );
    expect(
      reach([
        ...CONNECTORS.map(name => `server:${name}`),
        'server:confluence',
        'server:pagerduty',
      ]),
    ).toBe(
      'Can use cluster-manager, github, jira, kubernetes, slack and 2 more.',
    );
    // Shared across the sentence, at least one name per verb.
    expect(
      reach([
        ...['kubernetes', 'slack', 'jira', 'github'].map(n => `server:${n}`),
        'server:confluence',
        ...readOnly('cluster-manager'),
      ]),
    ).toBe(
      'Can use github, jira, kubernetes, slack and 1 more, and read from cluster-manager.',
    );
  });

  it('names presets by their phrase beside connectors', () => {
    expect(reach(['preset:read-only', 'server:slack'])).toBe(
      'Can use read-only tools and slack.',
    );
    expect(reach(['preset:sre'])).toBe('Can use the sre preset.');
    expect(reach(['workflow:triage'])).toBe('Can use the triage workflow.');
  });

  it('counts the picked tools while the catalogue is not known', () => {
    expect(
      describeReach({
        state: 'declared',
        carrier: 'sre-agent',
        selectors: [
          'server:kubernetes',
          'tool:x_cluster-manager_get',
          'tool:x_cluster-manager_list',
          'tool:core_auth_login',
        ],
      }),
    ).toBe('Can use kubernetes and 3 selected tools.');
  });

  it('keeps the loud states', () => {
    expect(describeReach({ state: 'no-gateway' })).toBe('Has no connectors.');
    expect(reach(['preset:none'])).toBe('Has no connectors.');
    expect(describeReach({ state: 'implicit-full', carrier: 'muster' })).toBe(
      'Can use every connector you can.',
    );
    expect(reach(['preset:full'])).toBe('Can use every connector you can.');
    expect(describeReach(undefined)).toBeUndefined();
    expect(
      describeReach({ state: 'unresolved', carrier: 'sre-agent' }),
    ).toBeUndefined();
  });
});

describe('reachNeedsCatalogue', () => {
  it('asks for the catalogue only for tools picked one by one', () => {
    const declared = (selectors: string[]): DeclaredToolset => ({
      state: 'declared',
      carrier: 'a',
      selectors,
    });
    expect(
      reachNeedsCatalogue(declared(['server:x', 'preset:read-only'])),
    ).toBe(false);
    expect(reachNeedsCatalogue(declared(['tool:x_a_b']))).toBe(true);
    expect(reachNeedsCatalogue({ state: 'no-gateway' })).toBe(false);
  });
});

describe('presetPhrase', () => {
  it('reads shipped presets in words and others as a preset', () => {
    expect(presetPhrase('read-only')).toBe('read-only tools');
    expect(presetPhrase('none')).toBe('');
    expect(presetPhrase('mine')).toBe('the mine preset');
  });
});
