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
import { hasModelOperations } from '../../../lib/organizations';
import { preparedCredentialOperation } from '../../../lib/credentialOperations';
import { DEFAULT_MODEL_ANNOTATION } from '../../../lib/defaultModel';
import { AgentManagerClient } from '../../AgentManagerClient';
import { credentialOperationErrorCode } from '../../AgentManagerCredentialsApi';
import { musterApiOf } from '../../../lib/__testUtils__/musterApiOf';
import { AgentManagerCredentialsFixtureApi } from '../AgentManagerCredentialsFixtureApi';
import {
  AgentManagerFixtureState,
  ERASURE_STEPS,
  HELM_PLATFORM_MODEL,
  INCOMPLETE_MODEL,
  INCOMPLETE_MODEL_INSTALLATION,
  OPERATION_TTL_MS,
  ORGANIZATION_PULL_REQUEST_INSTALLATION,
  SETTLE_MS,
  UNUSED_VERTEX_MODEL,
} from '../agentManagerFixtureState';
import { MODEL_CONFIG_NAMESPACE } from '../../../lib/modelConfigs';
import {
  agentManagerFixtureServer,
  WITHOUT_MODEL_OPERATIONS,
} from './agentManager';

const NOW = Date.parse('2026-11-14T12:00:00Z');
const INSTALLATION = 'meadow';

function setup() {
  const data = createFixtureDataSet({ now: NOW });
  let now = NOW;
  const state = new AgentManagerFixtureState(data, () => now);
  const server = agentManagerFixtureServer(() => state);
  const musterApi = musterApiOf(server);
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

  it('takes an organization by its name, as agent-manager does, and refuses its namespace', async () => {
    const { server, organizationWith, client } = setup();
    const call = (tool: string, args: Record<string, unknown>) =>
      musterApiOf(server).callTool(
        `x_agent-manager_${tool}`,
        args,
        INSTALLATION,
      );
    const { name, namespace } = organizationWith('admin');

    await expect(
      call('list_organization_members', { namespace }),
    ).rejects.toThrow(/^invalid_request: unknown argument namespace/);
    await expect(call('list_model_configs', { namespace })).rejects.toThrow(
      `invalid_request: namespace ${namespace} is the namespace of organization ${name}: pass organization "${name}"`,
    );
    await expect(
      call('list_model_configs', { organization: name }),
    ).resolves.toMatchObject({ organization: name });

    await client.createOrganization({ name: 'newcomers' });
    await expect(
      call('list_organization_members', { organization: 'newcomers' }),
    ).rejects.toThrow(/^conflict: organization newcomers is not ready yet/);
    await expect(
      call('list_organization_members', { organization: 'nobody' }),
    ).rejects.toThrow(/^not_found: organization nobody not found/);
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

  it('adds and removes members, and leaves the admins to the organization', async () => {
    const { client, organizationWith } = setup();
    const { name: organization } = organizationWith('admin');

    await client.addOrganizationMember({
      organization,
      group: 'reviewers',
      role: 'user',
    });
    expect(
      (await client.listOrganizationMembers(organization)).members,
    ).toContainEqual(expect.objectContaining({ name: 'reviewers' }));
    await client.removeOrganizationMember({
      organization,
      group: 'reviewers',
      role: 'user',
    });
    const { members } = await client.listOrganizationMembers(organization);
    expect(members).not.toContainEqual(
      expect.objectContaining({ name: 'reviewers' }),
    );

    // The admins come from spec.admins: the member tools neither give the
    // role nor take it.
    const admin = members.find(member => member.role === 'admin')!;
    expect(admin.from).toMatch(/spec\.admins/);
    await expect(
      client.addOrganizationMember({
        organization,
        group: 'leads',
        role: 'admin' as 'user',
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    await expect(
      client.removeOrganizationMember({
        organization,
        group: admin.name,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('answers a create in mode commit with a pull request where it reports commit, and creates nothing', async () => {
    const { server, client } = setup();
    const tarragon = new AgentManagerClient(
      musterApiOf(server),
      ORGANIZATION_PULL_REQUEST_INSTALLATION,
    );

    expect((await tarragon.getInfo()).capabilities?.commit).toBe(true);
    const opened = await tarragon.createOrganization({
      name: 'newcomers',
      mode: 'commit',
    });
    expect(opened).toMatchObject({
      created: false,
      commit: { pullRequest: expect.stringMatching(/^https:\/\//) },
    });
    expect(
      (await tarragon.listOrganizations()).organizations.map(o => o.name),
    ).not.toContain('newcomers');

    // Where agent-manager reports no commit, it refuses as it words it.
    expect((await client.getInfo()).capabilities?.commit).toBe(false);
    await expect(
      client.createOrganization({ name: 'newcomers', mode: 'commit' }),
    ).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('creates an organization that turns ready, and changes its admins', async () => {
    const { client, advance } = setup();

    const created = await client.createOrganization({
      name: 'newcomers',
      adminGroups: ['newcomers-admins'],
    });
    expect(created).toMatchObject({ created: true, next: expect.any(String) });
    const listed = async () =>
      (await client.listOrganizations()).organizations.find(
        organization => organization.name === 'newcomers',
      );
    expect((await listed())?.namespace).toBeUndefined();
    await expect(
      client.createOrganization({ name: 'newcomers' }),
    ).rejects.toMatchObject({ code: 'conflict' });

    advance(SETTLE_MS);
    const ready = await listed();
    expect(ready?.namespace).toBe('agents-newcomers');

    await client.updateOrganizationAdmins({
      name: 'newcomers',
      adminGroups: [],
      adminUsers: ['jane@example.com'],
    });
    expect((await listed())?.organization?.admins).toEqual([
      { kind: 'User', name: 'jane@example.com' },
    ]);
    const { members } = await client.listOrganizationMembers(ready!.name);
    expect(
      members.filter(member => member.role === 'admin').map(m => m.name),
    ).toEqual(['jane@example.com']);
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
    ).toEqual(['default', UNUSED_VERTEX_MODEL]);

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
    ).toEqual(['default', UNUSED_VERTEX_MODEL, 'claude-sonnet']);
    expect(
      (await credentials.getOperation(INSTALLATION, operation)).operation.state,
    ).toBe('complete');
  });

  it('reports the platform and the organizations the person may create agents in as managed', async () => {
    const { client, data, organizationWith } = setup();
    const deleting = data.organizations.find(
      organization =>
        organization.installation === INSTALLATION &&
        organization.state === 'deleting',
    )!;
    const { namespaces } = await client.getInfo();

    expect(namespaces.default).toBe('kagent');
    expect(namespaces.managed[0]).toBe('kagent');
    expect(namespaces.managed).toContain(organizationWith('admin').namespace);
    expect(namespaces.managed).toContain(organizationWith('editor').namespace);
    expect(namespaces.managed).not.toContain(
      organizationWith('user').namespace,
    );
    expect(deleting.role).toBe('admin');
    expect(namespaces.managed).not.toContain(deleting.namespace);
  });

  it('lets only an organization’s admins create its models', () => {
    const { state, organizationWith } = setup();
    const createModelIn = (namespace: string | undefined) =>
      state.allows(INSTALLATION, {
        verb: 'create',
        group: 'api.kagent.dev',
        resource: 'modelconfigs',
        namespace,
      });

    expect(createModelIn(organizationWith('admin').namespace)).toBe(true);
    expect(createModelIn(organizationWith('editor').namespace)).toBe(false);
    expect(createModelIn(organizationWith('user').namespace)).toBe(false);
    expect(createModelIn('kagent')).toBeUndefined();
    expect(
      state.allows(INSTALLATION, {
        verb: 'create',
        group: 'api.kagent.dev',
        resource: 'agents',
        namespace: organizationWith('editor').namespace,
      }),
    ).toBeUndefined();
  });

  it('annotates the default model and moves the annotation with the mark', async () => {
    const { client, credentials, organizationWith, state } = setup();
    const { namespace } = organizationWith('admin');
    const markedIn = () =>
      state
        .kubernetesObjectsOf(INSTALLATION)
        .filter(
          object =>
            object.kind === 'ModelConfig' &&
            object.metadata.namespace === namespace &&
            object.metadata.annotations?.[DEFAULT_MODEL_ANNOTATION] === 'true',
        )
        .map(object => object.metadata.name);
    expect(markedIn()).toEqual(['default']);

    const prepared = await client.setOrganizationModel({
      namespace: namespace!,
      name: 'claude-sonnet',
      provider: 'Anthropic',
      model: 'claude-sonnet-4-6',
      requestId: 'request-1',
    });
    const operation = preparedCredentialOperation(prepared)!;
    const read = await credentials.getOperation(INSTALLATION, operation);
    const [pair] = read.operation.result!.credentials!;
    await credentials.saveOperation(INSTALLATION, operation, read.etag, [
      { secret: pair.secret, key: pair.key, value: 'a value' },
    ]);
    expect(markedIn()).toEqual(['default']);

    await client.setOrganizationModel({
      namespace: namespace!,
      name: 'claude-sonnet',
      default: true,
      requestId: 'request-2',
    });
    expect(markedIn()).toEqual(['claude-sonnet']);
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

    const { erases } = await client.getOrganization(organization.name);
    expect(erases?.models).toEqual(['default', UNUSED_VERTEX_MODEL]);
    const result = await client.deleteOrganization({
      name: organization.name,
      confirm: organization.name,
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
    const { name, namespace } = organizationWith('admin');
    const [connector] = (await client.listOrganizationConnectors(name)).filter(
      candidate => candidate.credentials.length > 0,
    );
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

  it('asks for a new egress credential, with the origins it is sent to', async () => {
    const { client, credentials, organizationWith } = setup();
    const { namespace } = organizationWith('admin');
    const [policy] = await client.listEgressPolicies(namespace!);
    const [destination] = policy.destinations;

    const operation = preparedCredentialOperation(
      await client.replaceOrganizationCredential({
        namespace: namespace!,
        secret: destination.credentialSecret!,
        key: destination.credentialKey!,
        requestId: 'request-1',
      }),
    )!;
    const { operation: read } = await credentials.getOperation(
      INSTALLATION,
      operation,
    );
    expect(read.references).toEqual([
      {
        kind: 'EgressPolicy',
        name: policy.name,
        key: destination.credentialKey,
        origins: [destination.origin],
      },
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
      name: organization.name,
      confirm: organization.name,
    });
    await expect(
      client.addOrganizationMember({
        organization: organization.name,
        group: 'late',
      }),
    ).rejects.toMatchObject({ code: 'conflict' });

    const steps: (string | undefined)[] = [];
    for (let i = 0; i < ERASURE_STEPS.length; i++) {
      steps.push(
        (await client.getOrganization(organization.name)).organization
          .erasureStep,
      );
      advance(SETTLE_MS);
    }
    expect(steps).toEqual([...ERASURE_STEPS]);
    await expect(
      client.getOrganization(organization.name),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(
      state
        .kubernetesObjectsOf(INSTALLATION)
        .some(object => object.metadata.namespace === organization.namespace),
    ).toBe(false);
  });
});

it('declares the set_organization_model fields the model forms send, except on the installation that predates them', () => {
  const { server } = setup();
  const schema =
    server.inputSchemas?.[AGENT_MANAGER_TOOLS.setOrganizationModel];
  const schemaOf = (installation: string) =>
    (typeof schema === 'function' ? schema(installation) : schema) as {
      properties?: Record<string, unknown>;
    };
  expect(hasModelOperations(schemaOf(INSTALLATION))).toBe(true);
  expect(hasModelOperations(schemaOf(WITHOUT_MODEL_OPERATIONS))).toBe(false);
});

it('adds a Vertex AI model whose key is a service-account JSON of its project', async () => {
  const { client, credentials, organizationWith, state } = setup();
  const namespace = organizationWith('admin').namespace!;
  const result = await client.setOrganizationModel({
    namespace,
    name: 'claude-vertex',
    displayName: 'Claude on Vertex AI',
    provider: 'AnthropicVertexAI',
    model: 'claude-sonnet-4-6',
    projectID: 'fixture-models',
    location: 'europe-west1',
    create: true,
    requestId: 'request-1',
  });
  const operation = preparedCredentialOperation(result)!;
  const read = await credentials.getOperation(INSTALLATION, operation);
  const [pair] = read.operation.result!.credentials!;
  expect(pair).toMatchObject({
    key: 'GOOGLE_APPLICATION_CREDENTIALS',
    inputFormat: 'google-service-account-json',
  });
  expect(read.operation.changes?.[0].object?.spec).toMatchObject({
    apiKeySecret: pair.secret,
    apiKeySecretKey: pair.key,
    anthropicVertexAI: {
      projectID: 'fixture-models',
      location: 'europe-west1',
    },
  });

  const keyOf = (project: string) =>
    JSON.stringify({
      type: 'service_account',
      project_id: project,
      client_email: `portal@${project}.iam.gserviceaccount.com`,
    });
  const notAKey = await credentials
    .saveOperation(INSTALLATION, operation, read.etag, [
      { secret: pair.secret, key: pair.key, value: '{"type":"user"}' },
    ])
    .catch(caught => caught);
  expect(credentialOperationErrorCode(notAKey)).toBe('invalid_request');

  const saved = await credentials.saveOperation(
    INSTALLATION,
    operation,
    read.etag,
    [{ secret: pair.secret, key: pair.key, value: keyOf('central-sa') }],
  );
  expect(saved.note).toBe(
    "the key's service account belongs to project central-sa and the model calls Vertex AI in project fixture-models: it needs Vertex AI access in fixture-models",
  );
  const model = state
    .kubernetesObjectsOf(INSTALLATION)
    .find(
      object =>
        object.kind === 'ModelConfig' &&
        object.metadata.namespace === namespace &&
        object.metadata.name === 'claude-vertex',
    ) as { metadata: { annotations?: Record<string, string> }; spec?: unknown };
  expect(model.metadata.annotations?.['ui.giantswarm.io/display-name']).toBe(
    'Claude on Vertex AI',
  );
  expect(model.spec).toMatchObject({
    anthropicVertexAI: {
      projectID: 'fixture-models',
      location: 'europe-west1',
    },
  });
});

it('refuses a Vertex AI model without a valid location', async () => {
  const { client, organizationWith } = setup();
  await expect(
    client.setOrganizationModel({
      namespace: organizationWith('admin').namespace!,
      name: 'gemini',
      provider: 'GeminiVertexAI',
      model: 'gemini-2.5-flash',
      projectID: 'fixture-models',
      requestId: 'request-1',
    }),
  ).rejects.toMatchObject({ code: 'invalid_request' });
});

it("asks for a Vertex AI model's new key as a service-account JSON", async () => {
  const { client, credentials, organizationWith } = setup();
  const result = await client.replaceOrganizationCredential({
    namespace: organizationWith('admin').namespace!,
    secret: `${UNUSED_VERTEX_MODEL}-model-key`,
    key: 'GOOGLE_APPLICATION_CREDENTIALS',
    requestId: 'request-1',
  });
  const read = await credentials.getOperation(
    INSTALLATION,
    preparedCredentialOperation(result)!,
  );
  expect(read.operation.result?.credentials).toEqual([
    expect.objectContaining({
      state: 'replace',
      inputFormat: 'google-service-account-json',
    }),
  ]);
  expect(read.operation.references).toEqual([
    expect.objectContaining({
      name: UNUSED_VERTEX_MODEL,
      projectID: 'fixture-models',
      location: 'europe-west1',
    }),
  ]);
});

it("writes the installation's models in platform scope", async () => {
  const { client, credentials, state } = setup();
  const result = await client.setOrganizationModel({
    namespace: MODEL_CONFIG_NAMESPACE,
    name: 'claude',
    provider: 'Anthropic',
    model: 'claude-sonnet-4-6',
    endpoint: 'https://llm.example.com',
    create: true,
    requestId: 'request-1',
  });
  const operation = preparedCredentialOperation(result)!;
  const read = await credentials.getOperation(INSTALLATION, operation);
  expect(read.operation.organization).toEqual({
    scope: 'platform',
    namespace: MODEL_CONFIG_NAMESPACE,
  });
  const [pair] = read.operation.result!.credentials!;
  expect(pair.secret).toBe('tenant-credential-claude');
  await credentials.saveOperation(INSTALLATION, operation, read.etag, [
    { secret: pair.secret, key: pair.key, value: 'a value' },
  ]);
  expect(
    state
      .listModelConfigs(INSTALLATION, MODEL_CONFIG_NAMESPACE)
      .map(model => model.name),
  ).toEqual([HELM_PLATFORM_MODEL, 'claude']);

  await expect(
    client.setOrganizationModel({
      namespace: MODEL_CONFIG_NAMESPACE,
      name: 'local',
      provider: 'Ollama',
      model: 'llama3',
      noCredential: true,
      create: true,
      requestId: 'request-2',
    }),
  ).resolves.toMatchObject({ created: true });
  await expect(
    client.deleteModel(MODEL_CONFIG_NAMESPACE, 'claude'),
  ).resolves.toMatchObject({ deleted: true });
});

it('keeps endpoint and noCredential to installation models', async () => {
  const { client, organizationWith } = setup();
  await expect(
    client.setOrganizationModel({
      namespace: organizationWith('admin').namespace!,
      name: 'gpt',
      provider: 'OpenAI',
      model: 'gpt-4.1',
      endpoint: 'https://llm.example.com',
      requestId: 'request-1',
    }),
  ).rejects.toMatchObject({ code: 'invalid_request' });
});

it("refuses to move the default off, edit, delete or replace the key of the installation's Helm-managed model", async () => {
  const { client, state } = setup();
  await client.setOrganizationModel({
    namespace: MODEL_CONFIG_NAMESPACE,
    name: 'local',
    provider: 'Ollama',
    model: 'llama3',
    noCredential: true,
    requestId: 'request-1',
  });
  for (const write of [
    () =>
      client.setOrganizationModel({
        namespace: MODEL_CONFIG_NAMESPACE,
        name: 'local',
        default: true,
        requestId: 'request-2',
      }),
    () =>
      client.setOrganizationModel({
        namespace: MODEL_CONFIG_NAMESPACE,
        name: HELM_PLATFORM_MODEL,
        model: 'gpt-4.1-mini',
        requestId: 'request-3',
      }),
    () => client.deleteModel(MODEL_CONFIG_NAMESPACE, HELM_PLATFORM_MODEL),
  ]) {
    await expect(write()).rejects.toMatchObject({ code: 'gitops_owned' });
  }
  await expect(
    client.replaceOrganizationCredential({
      namespace: MODEL_CONFIG_NAMESPACE,
      secret: 'kagent-openai',
      key: 'OPENAI_API_KEY',
      requestId: 'request-4',
    }),
  ).rejects.toMatchObject({ code: 'invalid_request' });
  const helm = state
    .kubernetesObjectsOf(INSTALLATION)
    .find(object => object.metadata.name === HELM_PLATFORM_MODEL)!;
  expect(helm.metadata.annotations).toMatchObject({
    'meta.helm.sh/release-name': 'kagent',
    'agent-platform.giantswarm.io/is-default-model-config': 'true',
  });
});

it('refuses a create of a model that exists by then', async () => {
  const { client, organizationWith } = setup();
  await expect(
    client.setOrganizationModel({
      namespace: organizationWith('admin').namespace!,
      name: UNUSED_VERTEX_MODEL,
      provider: 'GeminiVertexAI',
      model: 'gemini-2.5-pro',
      create: true,
      requestId: 'request-1',
    }),
  ).rejects.toMatchObject({ code: 'already_exists' });
});

it('deletes a model through delete_organization_object', async () => {
  const { client, state, organizationWith } = setup();
  const namespace = organizationWith('admin').namespace!;
  const [model] = state.listModelConfigs(INSTALLATION, namespace);
  await expect(client.deleteModel(namespace, model.name)).resolves.toEqual(
    expect.objectContaining({ deleted: true, name: model.name }),
  );
  expect(
    state
      .listModelConfigs(INSTALLATION, namespace)
      .map(remaining => remaining.name),
  ).not.toContain(model.name);
  await expect(client.deleteModel(namespace, model.name)).rejects.toThrow(
    'not found',
  );
});

it("answers a delete dry run with the person's permission, deleting nothing", async () => {
  const { client, state, organizationWith } = setup();
  const namespace = organizationWith('admin').namespace!;
  const [model] = state.listModelConfigs(INSTALLATION, namespace);
  await expect(
    client.deleteModel(namespace, model.name, { dryRun: true }),
  ).resolves.toEqual(expect.objectContaining({ deleted: false }));
  expect(
    state
      .listModelConfigs(INSTALLATION, namespace)
      .map(remaining => remaining.name),
  ).toContain(model.name);

  const userNamespace = organizationWith('user').namespace!;
  const [theirs] = state.listModelConfigs(INSTALLATION, userNamespace);
  await expect(
    client.deleteModel(userNamespace, theirs.name, { dryRun: true }),
  ).rejects.toThrow();
});

it('writes and reports the model settings as agent-manager does', async () => {
  const { client, state } = setup();
  const listed = () =>
    state
      .listModelConfigs(INSTALLATION, MODEL_CONFIG_NAMESPACE)
      .find(model => model.name === 'claude');
  await client.setOrganizationModel({
    namespace: MODEL_CONFIG_NAMESPACE,
    name: 'claude',
    provider: 'Anthropic',
    model: 'claude-sonnet-4-6',
    noCredential: true,
    create: true,
    requestId: 'request-1',
  });
  // A new Anthropic model caches its prompts for 5 minutes.
  expect(listed()).toMatchObject({ promptCaching: true, cacheTTL: '5m' });
  expect(listed()).not.toHaveProperty('maxTokens');

  await client.setOrganizationModel({
    namespace: MODEL_CONFIG_NAMESPACE,
    name: 'claude',
    maxTokens: 4096,
    requestId: 'request-2',
  });
  expect(listed()).toMatchObject({ maxTokens: 4096, promptCaching: true });

  await client.setOrganizationModel({
    namespace: MODEL_CONFIG_NAMESPACE,
    name: 'claude',
    maxTokens: 0,
    promptCaching: false,
    requestId: 'request-3',
  });
  expect(listed()).toMatchObject({ promptCaching: false });
  expect(listed()).not.toHaveProperty('maxTokens');
  expect(listed()).not.toHaveProperty('cacheTTL');

  // A refused setting changes nothing, also the settings beside it.
  await expect(
    client.setOrganizationModel({
      namespace: MODEL_CONFIG_NAMESPACE,
      name: 'claude',
      maxTokens: 2048,
      cacheTTL: '2h',
      requestId: 'request-5',
    }),
  ).rejects.toMatchObject({ code: 'invalid_request' });
  expect(listed()).not.toHaveProperty('maxTokens');

  await expect(
    client.setOrganizationModel({
      namespace: MODEL_CONFIG_NAMESPACE,
      name: 'local',
      provider: 'Ollama',
      model: 'llama3',
      noCredential: true,
      maxTokens: 100,
      requestId: 'request-4',
    }),
  ).rejects.toMatchObject({
    code: 'invalid_request',
    message: expect.stringContaining('spec.ollama.maxTokens'),
  });
});

describe('the model whose key Secret is missing', () => {
  it('reads Incomplete and lists no Secret of it to erase', () => {
    const data = createFixtureDataSet({ now: NOW });
    const organization = data.organizations.find(
      candidate =>
        candidate.installation === INCOMPLETE_MODEL_INSTALLATION &&
        candidate.namespace,
    )!;
    organization.role = 'admin';
    const state = new AgentManagerFixtureState(data, () => NOW);

    const model = state
      .kubernetesObjectsOf(INCOMPLETE_MODEL_INSTALLATION)
      .find(
        object =>
          object.kind === 'ModelConfig' &&
          object.metadata?.name === INCOMPLETE_MODEL,
      ) as { status?: { conditions?: { type: string; status: string }[] } };
    expect(model.status?.conditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'Accepted', status: 'True' }),
        expect.objectContaining({ type: 'ResolvedRefs', status: 'False' }),
      ]),
    );

    const { erases } = state.getOrganization(
      INCOMPLETE_MODEL_INSTALLATION,
      organization.name,
    );
    expect(erases?.models).toContain(INCOMPLETE_MODEL);
    expect(erases?.credentials).not.toContain(`${INCOMPLETE_MODEL}-model-key`);
  });
});
