import { createFixtureDataSet } from '@giantswarm/backstage-plugin-gs-common/fixtures';

import {
  TOOLCHAIN_MANAGER_TOOLS,
  ToolchainManagerError,
  sharedToolchainNames,
} from '../../../lib/toolchainManager';
import { ToolchainManagerClient } from '../../ToolchainManagerClient';
import { SETTLE_MS } from '../agentManagerFixtureState';
import { ToolchainManagerFixtureState } from '../toolchainManagerFixtureState';
import { musterApiOf } from './musterApiOf';
import { toolchainManagerFixtureServer } from './toolchainManager';

const NOW = Date.parse('2026-11-14T12:00:00Z');
const INSTALLATION = 'meadow';

function setup() {
  const data = createFixtureDataSet({ now: NOW });
  let now = NOW;
  const state = new ToolchainManagerFixtureState(data, () => now);
  const server = toolchainManagerFixtureServer(() => state);
  return {
    data,
    server,
    client: new ToolchainManagerClient(musterApiOf(server), INSTALLATION),
    offered: data.toolchainSources.find(
      s => s.installation === INSTALLATION && s.state === 'offered',
    )!,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

async function failureOf(
  call: Promise<unknown>,
): Promise<ToolchainManagerError> {
  const error = await call.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ToolchainManagerError);
  return error as ToolchainManagerError;
}

describe('the fixture toolchain-manager', () => {
  it('has a handler for every tool the client calls', () => {
    const { server } = setup();
    expect(Object.keys(server.tools).sort()).toEqual(
      Object.values(TOOLCHAIN_MANAGER_TOOLS).sort(),
    );
  });

  it('lists the toolchains of the offered sources at their newest version, and the unreachable sources', async () => {
    const { client, data } = setup();
    const list = await client.listToolchains();
    const expected = data.toolchains.filter(
      t => t.installation === INSTALLATION,
    );
    expect(list.toolchains).toHaveLength(expected.length);
    for (const toolchain of list.toolchains) {
      expect(toolchain.version).toBe(toolchain.versions[0]);
      expect(toolchain.image).toBe(
        `registry.example.com/toolchains/${toolchain.name}:${toolchain.version.slice(1)}`,
      );
    }
    expect(sharedToolchainNames(list.toolchains).size).toBe(1);
    expect(list.unreachable?.map(u => u.source)).toEqual(
      data.toolchainSources
        .filter(
          s => s.installation === INSTALLATION && s.state === 'unreachable',
        )
        .map(s => s.name),
    );
    expect(list.status).toBeUndefined();
  });

  it('describes a version of a toolchain, of the source named where two publish it', async () => {
    const { client } = setup();
    const { toolchains } = await client.listToolchains();
    const [shared] = sharedToolchainNames(toolchains);
    const second = toolchains.filter(t => t.name === shared)[1];
    const described = await client.describeToolchain({
      name: shared,
      source: second.source,
    });
    expect(described.toolchain?.source).toBe(second.source);
    expect(described.toolchain?.tools.length).toBeGreaterThan(0);
    expect(described.toolchain?.dockerfile).toContain('FROM ');

    const oldest = second.versions[second.versions.length - 1];
    expect(
      (
        await client.describeToolchain({
          name: shared,
          source: second.source,
          version: oldest.slice(1),
        })
      ).toolchain?.version,
    ).toBe(oldest);
    expect(
      (
        await failureOf(
          client.describeToolchain({ name: shared, version: '99.0.0' }),
        )
      ).kind,
    ).toBe('failed');
    expect(
      (await failureOf(client.describeToolchain({ name: 'nothing' }))).kind,
    ).toBe('failed');
  });

  it('adds a source, pending until an owner approves it', async () => {
    const { client, offered } = setup();
    const before = (await client.listSources()).sources;
    expect(new Set(before.map(s => s.phase))).toEqual(
      new Set(['Approved', 'Pending']),
    );
    const { source } = await client.addSource({
      repository: 'example/more-tools',
      registry: 'registry.example.com/more',
      slackChannel: '#tools',
    });
    expect(source).toMatchObject({
      name: 'more-tools',
      phase: 'Pending',
      offered: false,
      registry: 'registry.example.com/more',
      slackChannel: '#tools',
    });
    expect((await client.listSources()).sources).toContainEqual(source);
    await failureOf(
      client.addSource({
        repository: offered.repository,
        registry: 'r',
        slackChannel: '',
      }),
    );
    await failureOf(
      client.addSource({ repository: 'nope', registry: 'r', slackChannel: '' }),
    );
  });

  it('writes a toolchain from packages and follows its pull request to the merge it waits for', async () => {
    const { client, offered, advance } = setup();
    const search = await client.searchPackages('kube');
    expect(search.packages.map(p => p.name)).toEqual([
      'kubectl',
      'kubernetes-helm',
    ]);
    expect(search.branches).toEqual(['stable', 'unstable']);

    const written = await client.addPackages({
      name: 'cluster-tools',
      packages: ['kubectl', 'jq'],
    });
    expect(written.dockerfile).toContain('kubectl jq');

    const input = {
      name: 'cluster-tools',
      source: offered.name,
      dockerfile: written.dockerfile,
    };
    const { created } = await client.createToolchain(input);
    expect(created?.pullURL).toBe(
      `https://github.com/${offered.repository}/pull/${created?.pull}`,
    );
    // A retry answers the same pull request.
    expect((await client.createToolchain(input)).created).toEqual(created);
    await failureOf(
      client.createToolchain({ ...input, dockerfile: 'FROM other' }),
    );

    const states: string[] = [];
    for (let i = 0; i < 4; i++) {
      const { build } = await client.buildStatus({
        name: 'cluster-tools',
        source: offered.name,
        pull: created!.pull,
      });
      states.push(build!.state);
      advance(SETTLE_MS);
    }
    expect(states).toEqual(['queued', 'checking', 'checked', 'checked']);
  });

  it("reports a published toolchain's build as published", async () => {
    const { client } = setup();
    const [toolchain] = (await client.listToolchains()).toolchains;
    const { build } = await client.buildStatus({
      name: toolchain.name,
      source: toolchain.source,
    });
    expect(build).toMatchObject({
      state: 'published',
      version: toolchain.version,
      image: toolchain.image,
    });
  });

  it('refuses a toolchain for a pending source', async () => {
    const { client, data } = setup();
    const pending = data.toolchainSources.find(
      s => s.installation === INSTALLATION && s.state === 'pending',
    )!;
    const failure = await failureOf(
      client.createToolchain({
        name: 'anything',
        source: pending.name,
        dockerfile: 'FROM x',
      }),
    );
    expect(failure.message).toContain('is not an offered source');
  });
});
