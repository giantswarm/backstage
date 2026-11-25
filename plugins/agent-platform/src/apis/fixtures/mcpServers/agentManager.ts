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
  type OrganizationAdminsUpdate,
  type OrganizationCreateRequest,
  type OrganizationCredentialReplacement,
  type OrganizationModelRequest,
} from '../../../lib/organizations';
import { DEFAULT_WORKSPACE_CAPABILITY } from '../../../lib/defaultWorkspace';
import { MODEL_CONFIG_NAMESPACE } from '../../../lib/modelConfigs';
import { MODEL_SETTINGS_FIELDS } from '../../../lib/modelSettings';
import { PLATFORM_TENANT_NAMESPACE } from '../../../lib/tenants';
import { TOOLCHAINS_CAPABILITY } from '../../../lib/toolchainManager';
import type { ListModelConfigsAnswer } from '../../AgentManagerClient';
import {
  agentManagerFixtureState,
  ORGANIZATION_PULL_REQUEST_INSTALLATION,
  refusal,
  type AgentManagerFixtureState,
  type FixtureMemberRequest,
} from '../agentManagerFixtureState';
import { FIXTURE_HARNESS } from '../agentPlatformFixtureData';
import { asJson, text } from './jsonTools';

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
      'organization',
      'namespace',
      'name',
      'toolset',
      'egressPolicyRefs',
      ...(installation === WITHOUT_CONNECTORS ? [] : ['connectors']),
    ].map(field => [field, {}]),
  ),
});

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
    commit: installation === ORGANIZATION_PULL_REQUEST_INSTALLATION,
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

/** A tool's arguments without `organization` and `namespace`, and the namespace found. */
type Placed = {
  rest: Record<string, unknown>;
  namespace: string;
  /** The organization the call addressed, which the answer names. */
  organization?: string;
};

/** Splits off the two arguments that say where a tool acts. */
function split(args: Record<string, unknown>) {
  const { organization, namespace, ...rest } = args;
  return {
    rest,
    organization: typeof organization === 'string' ? organization : '',
    namespace: typeof namespace === 'string' ? namespace : '',
  };
}

/**
 * Where an agent tool acts, as agent-manager places it: `organization`
 * alone is the organization's namespace; without it `namespace` is an
 * installation namespace, and an organization's namespace is refused with
 * the organization to pass.
 */
function agentPlace(
  state: AgentManagerFixtureState,
  installation: string,
  args: Record<string, unknown>,
): Placed {
  const { rest, organization, namespace } = split(args);
  if (organization) {
    if (namespace) {
      throw refusal(
        'invalid_request',
        `namespace ${namespace} with organization ${organization}: the organization decides the namespace; pass organization alone`,
      );
    }
    return {
      rest,
      namespace: state.organizationNamespace(installation, organization),
      organization,
    };
  }
  const owner = state.organizationOfNamespace(installation, namespace);
  if (owner) {
    throw refusal(
      'invalid_request',
      `namespace ${namespace} is the namespace of organization ${owner}: pass organization "${owner}" instead of namespace`,
    );
  }
  return { rest, namespace };
}

/**
 * Where an organization tool acts: the organization, by its name. The tools
 * bind their arguments strictly, so the namespace they once took is
 * refused. With `optional` (the model tools), no organization is the
 * installation's models.
 */
function organizationPlace(
  state: AgentManagerFixtureState,
  installation: string,
  args: Record<string, unknown>,
  optional = false,
): Placed {
  if (Object.hasOwn(args, 'namespace')) {
    throw refusal(
      'invalid_request',
      'unknown argument namespace: pass organization, the name of the Organization',
    );
  }
  const { rest, organization } = split(args);
  if (!organization) {
    if (optional) {
      return { rest, namespace: MODEL_CONFIG_NAMESPACE };
    }
    throw refusal('invalid_request', 'organization is required');
  }
  return {
    rest,
    namespace: state.organizationNamespace(installation, organization),
    organization,
  };
}

/** An answer naming the organization the call addressed, as agent-manager's do. */
function naming<T>(answer: T, organization: string | undefined): T {
  return organization && answer && typeof answer === 'object'
    ? { organization, ...answer }
    : answer;
}

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
        text(args, 'name'),
      );
      return { ...organization, ...(erases && { erases }) };
    },
    [AGENT_MANAGER_TOOLS.deleteOrganization]: (args, { installation }) =>
      state().deleteOrganization(installation, {
        name: text(args, 'name'),
        ...(typeof args.confirm === 'string' && { confirm: args.confirm }),
      }),
    [AGENT_MANAGER_TOOLS.createOrganization]: (args, { installation }) =>
      state().createOrganization(
        installation,
        args as OrganizationCreateRequest,
      ),
    [AGENT_MANAGER_TOOLS.updateOrganization]: (args, { installation }) =>
      state().updateOrganizationAdmins(
        installation,
        args as OrganizationAdminsUpdate,
      ),
    [AGENT_MANAGER_TOOLS.listOrganizationMembers]: (args, { installation }) => {
      const at = organizationPlace(state(), installation, args);
      return naming(
        { members: state().listMembers(installation, at.namespace) },
        at.organization,
      );
    },
    [AGENT_MANAGER_TOOLS.addOrganizationMember]: (args, { installation }) => {
      const at = organizationPlace(state(), installation, args);
      return state().addMember(installation, {
        ...at.rest,
        namespace: at.namespace,
      } as FixtureMemberRequest);
    },
    [AGENT_MANAGER_TOOLS.removeOrganizationMember]: (
      args,
      { installation },
    ) => {
      const at = organizationPlace(state(), installation, args);
      return state().removeMember(installation, {
        ...at.rest,
        namespace: at.namespace,
      } as FixtureMemberRequest);
    },
    [AGENT_MANAGER_TOOLS.listOrganizationConnectors]: (
      args,
      { installation },
    ) => {
      const at = organizationPlace(state(), installation, args);
      return {
        organization: at.organization,
        connectors: state()
          .listConnectors(installation, at.namespace)
          // An agent-manager older than 3.3.4 does not mark the muster bindings.
          .map(({ musterBindingOf, ...connector }) =>
            installation === WITHOUT_CONNECTORS
              ? connector
              : { ...connector, ...(musterBindingOf && { musterBindingOf }) },
          ),
      };
    },
    [AGENT_MANAGER_TOOLS.setOrganizationModel]: (args, { installation }) => {
      const at = organizationPlace(state(), installation, args, true);
      return naming(
        state().setOrganizationModel(installation, {
          ...at.rest,
          namespace: at.namespace,
        } as OrganizationModelRequest),
        at.organization,
      );
    },
    [AGENT_MANAGER_TOOLS.deleteOrganizationObject]: (
      args,
      { installation },
    ) => {
      const at = organizationPlace(state(), installation, args, true);
      return naming(
        state().deleteOrganizationObject(installation, {
          namespace: at.namespace,
          name: text(args, 'name'),
          kind: text(args, 'kind'),
          dryRun: args.dryRun === true,
        }),
        at.organization,
      );
    },
    [AGENT_MANAGER_TOOLS.replaceOrganizationCredential]: (
      args,
      { installation },
    ) => {
      const at = organizationPlace(state(), installation, args, true);
      return naming(
        state().replaceCredential(installation, {
          ...at.rest,
          namespace: at.namespace,
        } as OrganizationCredentialReplacement),
        at.organization,
      );
    },
    [AGENT_MANAGER_TOOLS.listModelConfigs]: (
      args,
      { installation },
    ): ListModelConfigsAnswer => {
      const at = agentPlace(state(), installation, args);
      return naming(
        {
          modelConfigs: state().listModelConfigs(installation, at.namespace),
        },
        at.organization,
      );
    },
    [AGENT_MANAGER_TOOLS.listEgressPolicies]: (args, { installation }) => {
      const at = agentPlace(state(), installation, args);
      return naming(
        {
          egressPolicies: state().listEgressPolicies(
            installation,
            at.namespace,
          ),
        },
        at.organization,
      );
    },
    [AGENT_MANAGER_TOOLS.validateAgent]: (args, { installation }) => {
      const at = agentPlace(state(), installation, args);
      const placed = { ...at.rest, namespace: at.namespace };
      return naming(
        args.update === true
          ? state().validateUpdate(
              installation,
              placed as AgentUpdate & { mode?: string },
            )
          : state().validateAgent(installation, placed as AgentSpec),
        at.organization,
      );
    },
    [AGENT_MANAGER_TOOLS.createAgent]: (args, { installation }) => {
      const at = agentPlace(state(), installation, args);
      return naming(
        state().createAgent(installation, {
          ...at.rest,
          namespace: at.namespace,
        } as AgentSpec & { mode?: string }),
        at.organization,
      );
    },
    [AGENT_MANAGER_TOOLS.getAgent]: (args, { installation }) => {
      const at = agentPlace(state(), installation, args);
      return naming(
        state().getAgent(installation, at.namespace, text(args, 'name')),
        at.organization,
      );
    },
    [AGENT_MANAGER_TOOLS.getAgentStatus]: (args, { installation }) => {
      const at = agentPlace(state(), installation, args);
      return naming(
        state().getAgentStatus(installation, at.namespace, text(args, 'name')),
        at.organization,
      );
    },
    [AGENT_MANAGER_TOOLS.updateAgent]: (args, { installation }) => {
      const at = agentPlace(state(), installation, args);
      return naming(
        state().updateAgent(installation, {
          ...at.rest,
          namespace: at.namespace,
        } as AgentUpdate & { mode?: string }),
        at.organization,
      );
    },
    [AGENT_MANAGER_TOOLS.deleteAgent]: (args, { installation }) => {
      const at = agentPlace(state(), installation, args);
      return naming(
        state().deleteAgent(
          installation,
          at.namespace,
          text(args, 'name'),
          typeof args.mode === 'string' ? args.mode : undefined,
        ),
        at.organization,
      );
    },
    [AGENT_MANAGER_TOOLS.startSession]: (args, { installation }) => {
      const at = agentPlace(state(), installation, args);
      return naming(
        state().startSession(installation, {
          ...at.rest,
          namespace: at.namespace,
        } as StartSessionRequest & { noWorkspace?: boolean }),
        at.organization,
      );
    },
  };
  return {
    server: AGENT_MANAGER_SERVER,
    tools: asJson(tools),
    inputSchemas: {
      [AGENT_MANAGER_TOOLS.createAgent]: agentWriteSchema,
      [AGENT_MANAGER_TOOLS.updateAgent]: agentWriteSchema,
      [AGENT_MANAGER_TOOLS.setOrganizationModel]: installation => ({
        type: 'object',
        properties: Object.fromEntries(
          [
            'organization',
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
