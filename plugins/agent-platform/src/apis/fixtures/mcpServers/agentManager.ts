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
  ORGANIZATIONS_CAPABILITY,
  type MemberRequest,
  type OrganizationCredentialReplacement,
  type OrganizationModelRequest,
} from '../../../lib/organizations';
import type { ListModelConfigsAnswer } from '../../AgentManagerClient';
import {
  agentManagerFixtureState,
  type AgentManagerFixtureState,
} from '../agentManagerFixtureState';
import { FIXTURE_HARNESS } from '../agentPlatformFixtureData';

/** What the fixture agent-manager of an installation composes and can do. */
const infoOf = (installation: string): AgentManagerInfo => ({
  version: '1.0.0-fixture',
  chart: {
    ociUrl: 'oci://registry.example.com/charts/agent',
    semver: '1.x',
    latestVersion: '1.0.0',
    schemaVersion: '1.0.0',
    schemaSource: 'registry',
  },
  namespaces: { default: 'kagent', managed: ['kagent'] },
  capabilities: {
    create: true,
    validate: true,
    commit: false,
    [TAGS_CAPABILITY]: true,
    [EGRESS_POLICIES_CAPABILITY]: true,
    [ORGANIZATIONS_CAPABILITY]: true,
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

type Args = Record<string, unknown>;

/** A value as JSON carries it: a tool call never shares objects. */
function copied<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

const text = (args: Args, key: string): string => String(args[key] ?? '');

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
      infoOf(installation),
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
      connectors: state().listConnectors(installation, text(args, 'namespace')),
    }),
    [AGENT_MANAGER_TOOLS.setOrganizationModel]: (args, { installation }) =>
      state().setOrganizationModel(
        installation,
        args as OrganizationModelRequest,
      ),
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
    // Arguments and answers cross as JSON, as over MCP: no caller shares
    // the state's objects.
    tools: Object.fromEntries(
      Object.entries(tools).map(([name, handler]) => [
        name,
        (args, context) => copied(handler(copied(args), context)),
      ]),
    ),
  };
}

/** agent-manager's tools in fixture mode. */
export const agentManager: FixtureMcpServer = agentManagerFixtureServer();
