// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- fixture MCP servers are muster's.
import type { MusterApi } from '@giantswarm/backstage-plugin-muster';
import {
  createFixtureDataSet,
  type FixtureOrganization,
  type OrganizationRole,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

import {
  AGENT_MANAGER_TOOLS,
  AgentManagerError,
  hasReachedWrittenRevision,
  type AgentSpec,
} from '../../../lib/agentManager';
import { preparedCredentialOperation } from '../../../lib/credentialOperations';
import { AgentManagerClient } from '../../AgentManagerClient';
import { credentialOperationErrorCode } from '../../AgentManagerCredentialsApi';
import { AgentManagerCredentialsFixtureApi } from '../AgentManagerCredentialsFixtureApi';
import {
  AgentManagerFixtureState,
  ERASURE_STEPS,
  OPERATION_TTL_MS,
  SETTLE_MS,
} from '../agentManagerFixtureState';
import { agentManagerFixtureServer } from './agentManager';

const NOW = Date.parse('2026-11-14T12:00:00Z');
const INSTALLATION = 'meadow';

function setup() {
  const data = createFixtureDataSet({ now: NOW });
  let now = NOW;
  const state = new AgentManagerFixtureState(data, () => now);
  const server = agentManagerFixtureServer(() => state);
  // The fixture MusterApi's dispatch, by `x_<server>_<tool>`.
  const musterApi = {
    callTool: async (
      name: string,
      args: Record<string, unknown>,
      installation: string,
    ) => {
      const tool = name.replace(`x_${server.server}_`, '');
      return server.tools[tool](args, {
        installation,
        signal: new AbortController().signal,
      });
    },
  } as unknown as MusterApi;
  const organizationWith = (role: OrganizationRole): FixtureOrganization =>
    data.organizations.find(
      organization =>
        organization.installation === INSTALLATION &&
        organization.state === 'ready' &&
        organization.role === role,
    )!;
  return {
    data,
    state,
    server,
    client: new AgentManagerClient(musterApi, INSTALLATION),
    credentials: new AgentManagerCredentialsFixtureApi(state),
    organizationWith,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

function specIn(namespace: string, overrides: Partial<AgentSpec> = {}) {
  return {
    namespace,
    name: 'fixture-checker',
    displayName: 'Fixture Checker',
    description: 'Checks the fixtures.',
    modelConfig: 'default',
    toolset: ['preset:read-only'],
    tags: ['checks'],
    ...overrides,
  };
}

describe('the fixture agent-manager', () => {
  it('has a handler for every tool the client calls', () => {
    const { server } = setup();
    expect(Object.keys(server.tools).sort()).toEqual(
      Object.values(AGENT_MANAGER_TOOLS).sort(),
    );
  });

  it('lists the organizations of the installation with what the person may do', async () => {
    const { client, data } = setup();
    const { organizations } = await client.listOrganizations();
    expect(organizations.map(organization => organization.name)).toEqual(
      data.organizations
        .filter(organization => organization.installation === INSTALLATION)
        .map(organization => organization.name),
    );
    expect(
      organizations.some(
        organization => organization.permissions.createAgents === false,
      ),
    ).toBe(true);
  });

  it('reads the agents of the data set back', async () => {
    const { client, data } = setup();
    const agent = data.agents.find(
      candidate =>
        candidate.installation === INSTALLATION && candidate.state === 'ready',
    )!;
    const answer = await client.getAgent(agent.namespace, agent.name);
    expect(answer).toMatchObject({
      name: agent.name,
      displayName: agent.displayName,
      modelConfig: 'default',
      toolset: ['preset:read-only'],
      ready: true,
    });
    expect(
      await client.getAgentStatus(agent.namespace, agent.name),
    ).toMatchObject({ verdict: 'ready' });
  });

  it('creates an agent that the Kubernetes API lists and that becomes ready', async () => {
    const { client, state, organizationWith, advance } = setup();
    const { namespace } = organizationWith('editor');

    const validation = await client.validateAgent(specIn(namespace!));
    expect(validation).toMatchObject({ valid: true, mode: 'create' });
    expect(validation.manifests.helmRelease).toContain('fixture-checker');

    const before = state.kubernetesObjectsOf(INSTALLATION);
    const created = await client.createAgent(specIn(namespace!));
    expect(created.status?.verdict).toBe('progressing');
    const objects = state.kubernetesObjectsOf(INSTALLATION);
    expect(objects).not.toBe(before);
    expect(
      objects
        .filter(object => object.metadata.name === 'fixture-checker')
        .map(object => object.kind)
        .sort(),
    ).toEqual(['Agent', 'RemoteMCPServer']);
    expect(state.kubernetesObjectsOf(INSTALLATION)).toBe(objects);

    advance(SETTLE_MS);
    expect(
      await client.getAgentStatus(namespace!, 'fixture-checker'),
    ).toMatchObject({ verdict: 'ready' });
    expect(state.kubernetesObjectsOf(INSTALLATION)).not.toBe(objects);
  });

  it('refuses a create the dry run finds wrong, in agent-manager’s words', async () => {
    const { client, organizationWith, data } = setup();
    const { namespace } = organizationWith('admin');
    const taken = data.agents.find(agent => agent.namespace === namespace)!;

    const validation = await client.validateAgent(
      specIn(namespace!, { name: taken.name, modelConfig: 'missing' }),
    );
    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual([
      expect.stringContaining('already exists'),
      expect.stringContaining('ModelConfig "missing" not found'),
    ]);
    await expect(
      client.createAgent(specIn(namespace!, { modelConfig: 'missing' })),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    await expect(
      client.createAgent(specIn(namespace!, { name: taken.name })),
    ).rejects.toMatchObject({ code: 'conflict' });
    await expect(client.commitAgent(specIn(namespace!))).rejects.toMatchObject({
      code: 'unsupported',
    });
  });

  it('refuses a create where the person only uses agents', async () => {
    const { client, organizationWith } = setup();
    const { namespace } = organizationWith('user');
    const error = await client
      .createAgent(specIn(namespace!))
      .catch(caught => caught);
    expect(error).toBeInstanceOf(AgentManagerError);
    expect(error.code).toBe('forbidden');
  });

  it('updates an agent: a new generation, the controller catching up later', async () => {
    const { client, data, advance } = setup();
    const agent = data.agents.find(
      candidate =>
        candidate.installation === INSTALLATION &&
        candidate.state === 'ready' &&
        data.organizations.some(
          organization =>
            organization.namespace === candidate.namespace &&
            organization.role !== 'user',
        ),
    )!;
    const before = await client.getAgent(agent.namespace, agent.name);

    const update = {
      namespace: agent.namespace,
      name: agent.name,
      description: 'Changed.',
      systemMessage: 'Answer briefly.',
    };
    expect(await client.validateUpdate(update)).toMatchObject({
      valid: true,
      mode: 'update',
    });
    const result = await client.updateAgent(update);
    expect(result.changed).toEqual([
      'agent.description',
      'agent.systemMessage',
    ]);
    expect(result.agent).toMatchObject({
      description: 'Changed.',
      systemMessage: 'Answer briefly.',
    });

    const fromGeneration = before.status?.generation;
    const progressing = await client.getAgentStatus(
      agent.namespace,
      agent.name,
    );
    expect(hasReachedWrittenRevision(progressing, fromGeneration)).toBe(false);
    advance(SETTLE_MS);
    const settled = await client.getAgentStatus(agent.namespace, agent.name);
    expect(hasReachedWrittenRevision(settled, fromGeneration)).toBe(true);
    expect(settled.verdict).toBe('ready');

    const again = await client.updateAgent(update);
    expect(again.changed).toEqual([]);
  });

  it('deletes an agent', async () => {
    const { client, organizationWith, data } = setup();
    const { namespace } = organizationWith('admin');
    const agent = data.agents.find(
      candidate => candidate.namespace === namespace,
    )!;
    expect(await client.deleteAgent(agent.namespace, agent.name)).toMatchObject(
      { helmReleaseDeleted: true },
    );
    await expect(
      client.getAgent(agent.namespace, agent.name),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('adds and removes members, keeping the last admin of organization-admins', async () => {
    const { client, organizationWith } = setup();
    const { namespace } = organizationWith('admin');

    await client.addOrganizationMember({
      namespace: namespace!,
      group: 'reviewers',
      role: 'user',
    });
    expect(
      (await client.listOrganizationMembers(namespace!)).members,
    ).toContainEqual(expect.objectContaining({ name: 'reviewers' }));
    await client.removeOrganizationMember({
      namespace: namespace!,
      group: 'reviewers',
      role: 'user',
    });
    const { members } = await client.listOrganizationMembers(namespace!);
    expect(members).not.toContainEqual(
      expect.objectContaining({ name: 'reviewers' }),
    );

    // The person is an admin too: once they leave, the group is the last.
    await client.removeOrganizationMember({
      namespace: namespace!,
      user: 'guest@example.com',
      role: 'admin',
    });
    const group = members.find(
      member =>
        member.kind === 'Group' && member.binding === 'organization-admins',
    )!;
    await expect(
      client.removeOrganizationMember({
        namespace: namespace!,
        group: group.name,
        role: 'admin',
      }),
    ).rejects.toThrow(/would lose its last admin/);
    await expect(
      client.removeOrganizationMember({
        namespace: namespace!,
        group: group.name,
        role: 'admin',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('adds an admin to the admins binding and lists groups first', async () => {
    const { client, organizationWith } = setup();
    const { namespace } = organizationWith('admin');

    await client.addOrganizationMember({
      namespace: namespace!,
      group: 'leads',
      role: 'admin',
    });
    const { members } = await client.listOrganizationMembers(namespace!);
    const kinds = members.map(member => member.kind);
    expect(kinds.lastIndexOf('Group')).toBeLessThan(kinds.indexOf('User'));
    expect(members.find(member => member.name === 'leads')?.binding).toBe(
      'organization-admins',
    );

    const first = members.find(
      member =>
        member.kind === 'Group' && member.binding === 'organization-admins',
    )!;
    await client.removeOrganizationMember({
      namespace: namespace!,
      group: first.name,
      role: 'admin',
    });
  });

  it('adds a model once its key is saved on the credential form', async () => {
    const { client, credentials, organizationWith } = setup();
    const { namespace } = organizationWith('admin');

    const result = await client.setOrganizationModel({
      namespace: namespace!,
      name: 'claude-sonnet',
      provider: 'Anthropic',
      model: 'claude-sonnet-4-6',
      requestId: 'request-1',
    });
    const operation = preparedCredentialOperation(result)!;
    expect(operation).toMatch(/^[a-f0-9]{48}$/);
    expect(
      (await client.listModelConfigs(namespace!)).map(model => model.name),
    ).toEqual(['default']);

    const read = await credentials.getOperation(INSTALLATION, operation);
    expect(read.operation).toMatchObject({ state: 'pending', mode: 'apply' });
    const [pair] = read.operation.result!.credentials!;

    const stale = await credentials
      .saveOperation(INSTALLATION, operation, '"0"', [])
      .catch(caught => caught);
    expect(credentialOperationErrorCode(stale)).toBe('precondition_failed');

    const saved = await credentials.saveOperation(
      INSTALLATION,
      operation,
      read.etag,
      [{ secret: pair.secret, key: pair.key, value: 'a value' }],
    );
    expect(saved).toMatchObject({ kind: 'model', created: true });
    expect(
      (await client.listModelConfigs(namespace!)).map(model => model.name),
    ).toEqual(['default', 'claude-sonnet']);
    expect(
      (await credentials.getOperation(INSTALLATION, operation)).operation.state,
    ).toBe('complete');
  });

  it('asks for a new key of a model, and cancels the request', async () => {
    const { client, credentials, organizationWith } = setup();
    const { namespace } = organizationWith('admin');

    const result = await client.replaceOrganizationCredential({
      namespace: namespace!,
      secret: 'default-model-key',
      key: 'OPENAI_API_KEY',
      requestId: 'request-1',
    });
    const operation = preparedCredentialOperation(result)!;
    const read = await credentials.getOperation(INSTALLATION, operation);
    expect(read.operation.result?.kind).toBe('credential');
    await credentials.cancelOperation(INSTALLATION, operation, read.etag);
    expect(
      (await credentials.getOperation(INSTALLATION, operation)).operation.state,
    ).toBe('cancelled');

    const unknown = await credentials
      .getOperation(INSTALLATION, 'f'.repeat(48))
      .catch(caught => caught);
    expect(credentialOperationErrorCode(unknown)).toBe('not_found');
  });

  it('erases an organization once confirmed', async () => {
    const { client, organizationWith } = setup();
    const organization = organizationWith('admin');

    const { erases } = await client.getOrganization(
      organization.parent,
      organization.name,
    );
    expect(erases?.models).toEqual(['default']);
    const result = await client.deleteOrganization({
      parent: organization.parent,
      name: organization.name,
      confirm: `${organization.parent}/${organization.name}`,
    });
    expect(result).toMatchObject({
      deleted: true,
      organization: { deleting: true },
    });
  });

  it('settles an edit made while the create still settles', async () => {
    const { client, organizationWith, advance } = setup();
    const { namespace } = organizationWith('admin');
    await client.createAgent(specIn(namespace!));
    advance(SETTLE_MS / 2);
    await client.updateAgent({
      namespace: namespace!,
      name: 'fixture-checker',
      description: 'Changed early.',
    });
    advance(SETTLE_MS);
    expect(
      await client.getAgentStatus(namespace!, 'fixture-checker'),
    ).toMatchObject({ verdict: 'ready' });
  });

  it('names the model the controller looked at while a model fix settles', async () => {
    const { client, data, advance } = setup();
    const failed = data.agents.find(
      agent =>
        agent.installation === INSTALLATION &&
        agent.state === 'failed' &&
        data.organizations.some(
          organization =>
            organization.namespace === agent.namespace &&
            organization.role === 'admin',
        ),
    )!;
    await client.updateAgent({
      namespace: failed.namespace,
      name: failed.name,
      modelConfig: 'default',
    });

    const settling = await client.getAgentStatus(failed.namespace, failed.name);
    expect(settling.verdict).toBe('failed');
    expect(settling.summary).toContain('"retired"');
    advance(SETTLE_MS);
    expect(
      await client.getAgentStatus(failed.namespace, failed.name),
    ).toMatchObject({ verdict: 'ready' });
  });

  it('answers a retried write with the same idempotency key once', async () => {
    const { client, organizationWith } = setup();
    const { namespace } = organizationWith('admin');
    const request = {
      namespace: namespace!,
      name: 'claude-sonnet',
      provider: 'Anthropic',
      model: 'claude-sonnet-4-6',
      requestId: 'request-1',
    };
    const first = await client.setOrganizationModel(request);
    expect(await client.setOrganizationModel(request)).toEqual(first);
    expect(
      (
        await client.setOrganizationModel({
          ...request,
          requestId: 'request-2',
        })
      ).credentialOperation,
    ).not.toBe(first.credentialOperation);
  });

  it('starts a session once per idempotency key', async () => {
    const { client, data } = setup();
    const agent = data.agents.find(
      candidate =>
        candidate.installation === INSTALLATION && candidate.state === 'ready',
    )!;
    const request = {
      namespace: agent.namespace,
      name: agent.name,
      requestId: 'request-1',
    };
    const first = await client.startSession(request);
    expect(first.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect((await client.startSession(request)).sessionId).toBe(
      first.sessionId,
    );
  });

  it('asks for a new connector credential', async () => {
    const { client, credentials, organizationWith } = setup();
    const { namespace } = organizationWith('admin');
    const [connector] = (
      await client.listOrganizationConnectors(namespace!)
    ).filter(candidate => candidate.credentials.length > 0);
    const [credential] = connector.credentials;

    const operation = preparedCredentialOperation(
      await client.replaceOrganizationCredential({
        namespace: namespace!,
        secret: credential.secret,
        key: credential.key,
        requestId: 'request-1',
      }),
    )!;
    const { operation: read } = await credentials.getOperation(
      INSTALLATION,
      operation,
    );
    expect(read.references).toEqual([
      expect.objectContaining({
        kind: 'RemoteMCPServer',
        name: connector.name,
      }),
    ]);
  });

  it('refuses a credential request once it expired', async () => {
    const { client, credentials, organizationWith, advance } = setup();
    const { namespace } = organizationWith('admin');
    const operation = preparedCredentialOperation(
      await client.setOrganizationModel({
        namespace: namespace!,
        name: 'claude-sonnet',
        provider: 'Anthropic',
        model: 'claude-sonnet-4-6',
        requestId: 'request-1',
      }),
    )!;
    const { etag } = await credentials.getOperation(INSTALLATION, operation);
    advance(OPERATION_TTL_MS);
    const expired = await credentials
      .saveOperation(INSTALLATION, operation, etag, [])
      .catch(caught => caught);
    expect(credentialOperationErrorCode(expired)).toBe('not_found');
  });

  it('hands out copies: changing an answer changes nothing it holds', async () => {
    const { client, data } = setup();
    const agent = data.agents.find(
      candidate => candidate.installation === INSTALLATION,
    )!;
    const answer = await client.getAgent(agent.namespace, agent.name);
    answer.toolset!.push('preset:full');
    expect(
      (await client.getAgent(agent.namespace, agent.name)).toolset,
    ).toEqual(['preset:read-only']);
  });

  it('erases an organization step by step, then reads it as gone', async () => {
    const { client, state, organizationWith, advance } = setup();
    const organization = organizationWith('admin');
    await client.deleteOrganization({
      parent: organization.parent,
      name: organization.name,
      confirm: `${organization.parent}/${organization.name}`,
    });
    await expect(
      client.addOrganizationMember({
        namespace: organization.namespace!,
        group: 'late',
      }),
    ).rejects.toMatchObject({ code: 'conflict' });

    const steps: (string | undefined)[] = [];
    for (let i = 0; i < ERASURE_STEPS.length; i++) {
      steps.push(
        (await client.getOrganization(organization.parent, organization.name))
          .organization.erasureStep,
      );
      advance(SETTLE_MS);
    }
    expect(steps).toEqual([...ERASURE_STEPS]);
    await expect(
      client.getOrganization(organization.parent, organization.name),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(
      state
        .kubernetesObjectsOf(INSTALLATION)
        .some(object => object.metadata.namespace === organization.namespace),
    ).toBe(false);
  });
});
