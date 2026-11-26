// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- fixture MCP servers are muster's.
import type { FixtureMcpServer } from '@giantswarm/backstage-plugin-muster';

import {
  AGENT_MANAGER_SERVER,
  AGENT_MANAGER_TOOLS,
  EGRESS_POLICIES_CAPABILITY,
  TAGS_CAPABILITY,
  type AgentManagerInfo,
  type AgentSpec,
  type AgentUpdate,
  type StartSessionRequest,
} from '../../../lib/agentManager';
import {
  MODEL_OPERATION_FIELDS,
  ORGANIZATIONS_CAPABILITY,
  type MemberRequest,
  type OrganizationCredentialReplacement,
  type OrganizationModelRequest,
} from '../../../lib/organizations';
import { DEFAULT_WORKSPACE_CAPABILITY } from '../../../lib/defaultWorkspace';
import { MODEL_SETTINGS_FIELDS } from '../../../lib/modelSettings';
import { PLATFORM_TENANT_NAMESPACE } from '../../../lib/tenants';
import { TOOLCHAINS_CAPABILITY } from '../../../lib/toolchainManager';
import type { ListModelConfigsAnswer } from '../../AgentManagerClient';
import {
  agentManagerFixtureState,
  type AgentManagerFixtureState,
} from '../agentManagerFixtureState';
import { FIXTURE_HARNESS } from '../agentPlatformFixtureData';
import { asJson, text } from './jsonTools';
import {
  ACCESS_ARGS,
  DESCRIBING_ARGS,
  takesToolApproval,
} from '../agentApprovalFixtures';

/**
 * The installation whose agent-manager predates model credential operations:
 * its `set_organization_model` takes none of {@link MODEL_OPERATION_FIELDS},
 * so the portal refuses every model write there.
 */
export const WITHOUT_MODEL_OPERATIONS = 'fennel';

/**
 * The installation whose agent-manager predates `connectors` (3.2 and
 * earlier): its `create_agent` and `update_agent` do not take them, so the
 * Tools step does not offer the organization's connectors there. The same
 * older agent-manager as {@link WITHOUT_MODEL_OPERATIONS}.
 */
export const WITHOUT_CONNECTORS = WITHOUT_MODEL_OPERATIONS;

/** The write tools' arguments as agent-manager 3.3 declares them, in part. */
const agentWriteSchema = (installation: string) => ({
  type: 'object',
  properties: Object.fromEntries(
    [
      'namespace',
      'name',
      ...(takesToolApproval(installation)
        ? ['tools', 'default', 'toolset']
        : ['toolset']),
      'egressPolicyRefs',
      ...(installation === WITHOUT_CONNECTORS ? [] : ['connectors']),
    ].map(field => [field, {}]),
  ),
});

/**
 * `update_agent`'s arguments: everything on the older agent-manager, what an
 * agent is once it has tool approval (the rest is `update_agent_access`'s).
 */
const updateSchema = (installation: string) =>
  takesToolApproval(installation)
    ? {
        type: 'object',
        properties: Object.fromEntries(
          ['namespace', 'name', ...DESCRIBING_ARGS].map(field => [field, {}]),
        ),
      }
    : agentWriteSchema(installation);

const accessSchema = (installation: string) => ({
  type: 'object',
  properties: Object.fromEntries(
    ['namespace', 'name', ...ACCESS_ARGS]
      .filter(
        field => field !== 'connectors' || installation !== WITHOUT_CONNECTORS,
      )
      .map(field => [field, {}]),
  ),
});

/** The tools an agent-manager before tool approval does not serve. */
const APPROVAL_TOOLS = [
  AGENT_MANAGER_TOOLS.updateAgentAccess,
  AGENT_MANAGER_TOOLS.setAgentApproval,
  AGENT_MANAGER_TOOLS.listApprovalGrants,
];

/** What the fixture agent-manager of an installation composes and can do. */
const infoOf = (installation: string, managed: string[]): AgentManagerInfo => ({
  version: installation === WITHOUT_CONNECTORS ? '3.2.0' : '3.3.4',
  chart: {
    ociUrl: 'oci://registry.example.com/charts/agent',
    semver: '1.x',
    latestVersion: '1.0.0',
    schemaVersion: '1.0.0',
    schemaSource: 'registry',
  },
  namespaces: { default: PLATFORM_TENANT_NAMESPACE, managed },
  capabilities: {
    create: true,
    validate: true,
    commit: false,
    [TAGS_CAPABILITY]: true,
    [EGRESS_POLICIES_CAPABILITY]: true,
    [ORGANIZATIONS_CAPABILITY]: true,
    [TOOLCHAINS_CAPABILITY]: true,
    [DEFAULT_WORKSPACE_CAPABILITY]: true,
  },
  identity: 'caller',
  apiVersions: {
    agent: 'api.kagent.dev/v1alpha3',
    agentTemplate: 'api.kagent.dev/v1alpha3',
    harness: 'api.kagent.dev/v1alpha3',
    remoteMcpServer: 'api.kagent.dev/v1alpha3',
    modelConfig: 'api.kagent.dev/v1alpha3',
    helmRelease: 'helm.toolkit.fluxcd.io/v2',
    ociRepository: 'source.toolkit.fluxcd.io/v1',
  },
  flux: { helmReleaseInterval: '10m', ociRepositoryInterval: '30m' },
  harness: { name: FIXTURE_HARNESS },
  muster: { url: `https://muster.${installation}.example.com/mcp` },
  skillsRepositories: [],
});

/**
 * agent-manager's tools in fixture mode, on `state` (the shared one by
 * default): the organizations and agents of the data set, and every write
 * kept in memory until the page reloads.
 */
export function agentManagerFixtureServer(
  state: () => AgentManagerFixtureState = agentManagerFixtureState,
): FixtureMcpServer {
  const tools: FixtureMcpServer['tools'] = {
    [AGENT_MANAGER_TOOLS.getInfo]: (_, { installation }) =>
      infoOf(installation, state().managedNamespaces(installation)),
    [AGENT_MANAGER_TOOLS.listOrganizations]: (_, { installation }) =>
      state().listOrganizations(installation),
    [AGENT_MANAGER_TOOLS.getOrganization]: (args, { installation }) => {
      const { organization, erases } = state().getOrganization(
        installation,
        text(args, 'namespace'),
        text(args, 'name'),
      );
      return { ...organization, ...(erases && { erases }) };
    },
    [AGENT_MANAGER_TOOLS.deleteOrganization]: (args, { installation }) =>
      state().deleteOrganization(installation, {
        parent: text(args, 'namespace'),
        name: text(args, 'name'),
        ...(typeof args.confirm === 'string' && { confirm: args.confirm }),
      }),
    [AGENT_MANAGER_TOOLS.listOrganizationMembers]: (
      args,
      { installation },
    ) => ({
      members: state().listMembers(installation, text(args, 'namespace')),
    }),
    [AGENT_MANAGER_TOOLS.addOrganizationMember]: (args, { installation }) =>
      state().addMember(installation, args as MemberRequest),
    [AGENT_MANAGER_TOOLS.removeOrganizationMember]: (args, { installation }) =>
      state().removeMember(installation, args as MemberRequest),
    [AGENT_MANAGER_TOOLS.listOrganizationConnectors]: (
      args,
      { installation },
    ) => ({
      connectors: state()
        .listConnectors(installation, text(args, 'namespace'))
        // An agent-manager older than 3.3.4 does not mark the muster bindings.
        .map(({ musterBindingOf, ...connector }) =>
          installation === WITHOUT_CONNECTORS
            ? connector
            : { ...connector, ...(musterBindingOf && { musterBindingOf }) },
        ),
    }),
    [AGENT_MANAGER_TOOLS.setOrganizationModel]: (args, { installation }) =>
      state().setOrganizationModel(
        installation,
        args as OrganizationModelRequest,
      ),
    [AGENT_MANAGER_TOOLS.deleteOrganizationObject]: (args, { installation }) =>
      state().deleteOrganizationObject(installation, {
        namespace: text(args, 'namespace'),
        name: text(args, 'name'),
        kind: text(args, 'kind'),
        dryRun: args.dryRun === true,
      }),
    [AGENT_MANAGER_TOOLS.replaceOrganizationCredential]: (
      args,
      { installation },
    ) =>
      state().replaceCredential(
        installation,
        args as OrganizationCredentialReplacement,
      ),
    [AGENT_MANAGER_TOOLS.listModelConfigs]: (
      args,
      { installation },
    ): ListModelConfigsAnswer => ({
      modelConfigs: state().listModelConfigs(
        installation,
        text(args, 'namespace'),
      ),
    }),
    [AGENT_MANAGER_TOOLS.listEgressPolicies]: (args, { installation }) => ({
      egressPolicies: state().listEgressPolicies(
        installation,
        text(args, 'namespace'),
      ),
    }),
    [AGENT_MANAGER_TOOLS.validateAgent]: (args, { installation }) =>
      args.update === true
        ? state().validateUpdate(
            installation,
            args as AgentUpdate & { mode?: string },
          )
        : state().validateAgent(installation, args as AgentSpec),
    [AGENT_MANAGER_TOOLS.createAgent]: (args, { installation }) =>
      state().createAgent(installation, args as AgentSpec & { mode?: string }),
    [AGENT_MANAGER_TOOLS.getAgent]: (args, { installation }) =>
      state().getAgent(
        installation,
        text(args, 'namespace'),
        text(args, 'name'),
      ),
    [AGENT_MANAGER_TOOLS.getAgentStatus]: (args, { installation }) =>
      state().getAgentStatus(
        installation,
        text(args, 'namespace'),
        text(args, 'name'),
      ),
    [AGENT_MANAGER_TOOLS.updateAgent]: (args, { installation }) =>
      state().updateAgent(
        installation,
        args as AgentUpdate & { mode?: string },
      ),
    [AGENT_MANAGER_TOOLS.updateAgentAccess]: (args, { installation }) =>
      state().updateAgent(
        installation,
        args as AgentUpdate & { mode?: string },
        'update_agent_access',
      ),
    [AGENT_MANAGER_TOOLS.setAgentApproval]: (args, { installation }) =>
      state().setAgentApproval(
        installation,
        args as Parameters<AgentManagerFixtureState['setAgentApproval']>[1],
      ),
    [AGENT_MANAGER_TOOLS.listApprovalGrants]: (args, { installation }) =>
      state().listApprovalGrants(
        installation,
        typeof args.namespace === 'string' ? args.namespace : undefined,
        typeof args.server === 'string' ? args.server : undefined,
      ),
    [AGENT_MANAGER_TOOLS.deleteAgent]: (args, { installation }) =>
      state().deleteAgent(
        installation,
        text(args, 'namespace'),
        text(args, 'name'),
        typeof args.mode === 'string' ? args.mode : undefined,
      ),
    [AGENT_MANAGER_TOOLS.startSession]: (args, { installation }) =>
      state().startSession(
        installation,
        args as StartSessionRequest & { noWorkspace?: boolean },
      ),
  };
  return {
    server: AGENT_MANAGER_SERVER,
    tools: asJson(tools),
    unservedTools: installation =>
      takesToolApproval(installation) ? [] : APPROVAL_TOOLS,
    inputSchemas: {
      [AGENT_MANAGER_TOOLS.createAgent]: agentWriteSchema,
      [AGENT_MANAGER_TOOLS.updateAgent]: updateSchema,
      [AGENT_MANAGER_TOOLS.updateAgentAccess]: accessSchema,
      [AGENT_MANAGER_TOOLS.setOrganizationModel]: installation => ({
        type: 'object',
        properties: Object.fromEntries(
          [
            'namespace',
            'name',
            'provider',
            'model',
            'create',
            'default',
            'requestId',
            'insecureSkipTLSVerify',
            ...(installation === WITHOUT_MODEL_OPERATIONS
              ? []
              : [...MODEL_OPERATION_FIELDS, ...MODEL_SETTINGS_FIELDS]),
          ].map(field => [field, {}]),
        ),
      }),
    },
  };
}

/** agent-manager's tools in fixture mode. */
export const agentManager: FixtureMcpServer = agentManagerFixtureServer();
