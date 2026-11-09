import type { MusterApi } from '@giantswarm/backstage-plugin-muster';

import type { AgentManagerModelConfig } from '../agentManager';
import type {
  MemberResult,
  MyOrganizations,
  OrganizationConnector,
  OrganizationMember,
} from '../organizations';

/**
 * What agent-manager answers on one installation, `gazelle`, through its
 * muster, as its organization tools shape their answers
 * (giantswarm/agent-manager `internal/organizations`).
 */
export type OrganizationsScenario = {
  /** `list_my_organizations`. */
  mine?: MyOrganizations;
  /** How many `list_my_organizations` calls fail first, as a timeout would. */
  mineFailures?: number;
  /** `list_organization_members`. */
  members?: OrganizationMember[];
  /** `list_model_configs`, per namespace. */
  models?: Record<string, AgentManagerModelConfig[]>;
  /** `list_organization_connectors`. */
  connectors?: OrganizationConnector[];
  /** `list_egress_policies`' policies. */
  egressPolicies?: {
    name: string;
    namespace: string;
    destinations: { origin: string; credentialHeader?: string }[];
  }[];
  /** What `remove_organization_member` fails with, as muster passes it on. */
  removeError?: string;
};

/** The operation id the fake's credential requests link to. */
export const CREDENTIAL_OPERATION = 'b2'.repeat(24);

/** muster's `/installations` and server list with agent-manager on gazelle. */
export function fakeOrganizationsMuster(scenario: OrganizationsScenario) {
  let mineFailures = scenario.mineFailures ?? 0;
  const callTool = jest.fn(
    async (name: string, args: Record<string, unknown>): Promise<unknown> => {
      switch (name) {
        case 'x_agent-manager_get_info':
          return {
            namespaces: { default: 'kagent', managed: [] },
            capabilities: { organizations: true, egressPolicies: true },
          };
        case 'x_agent-manager_list_my_organizations':
          if (mineFailures > 0) {
            mineFailures -= 1;
            throw new Error(
              'backend_error: the API server did not answer in time',
            );
          }
          return scenario.mine ?? { organizations: [] };
        case 'x_agent-manager_get_organization':
          // A member may not read the AgentPlatformOrganization itself.
          throw new Error(
            'forbidden: you may not get agentplatformorganizations in org-acme: agent-platform:organizations-admin grants it',
          );
        case 'x_agent-manager_list_organization_members':
          return { namespace: args.namespace, members: scenario.members ?? [] };
        case 'x_agent-manager_add_organization_member':
        case 'x_agent-manager_remove_organization_member': {
          if (
            name === 'x_agent-manager_remove_organization_member' &&
            scenario.removeError
          ) {
            throw new Error(scenario.removeError);
          }
          const result: MemberResult = {
            namespace: String(args.namespace),
            member: {
              kind: args.group ? 'Group' : 'User',
              name: String(args.group ?? args.user),
              role: (args.role as OrganizationMember['role']) ?? 'user',
              binding: `organization-${String(args.role ?? 'user')}s`,
            },
            changed: true,
          };
          return result;
        }
        case 'x_agent-manager_list_model_configs':
          return {
            modelConfigs: scenario.models?.[String(args.namespace)] ?? [],
          };
        case 'x_agent-manager_list_organization_connectors':
          return { connectors: scenario.connectors ?? [] };
        case 'x_agent-manager_list_egress_policies':
          return { egressPolicies: scenario.egressPolicies ?? [] };
        case 'x_agent-manager_set_organization_model':
        case 'x_agent-manager_set_organization_connector': {
          // A new model, or a replaced credential: agent-manager prepares a
          // credential request and answers its form link.
          const kind =
            name === 'x_agent-manager_set_organization_model'
              ? 'ModelConfig'
              : 'RemoteMCPServer';
          return {
            namespace: args.namespace,
            kind,
            name: args.name,
            pending: true,
            credentials: [
              {
                secret: `tenant-credential-${String(args.name)}`,
                key: kind === 'ModelConfig' ? 'apiKey' : 'token',
                state: args.replaceCredential ? 'replace' : 'missing',
                formUrl: `https://portal.example.com/organizations/gazelle/org-acme/payments/credentials?operation=${CREDENTIAL_OPERATION}`,
              },
            ],
          };
        }
        default:
          throw new Error(`unexpected tool ${name}`);
      }
    },
  );
  const api = {
    callTool,
    listInstallations: jest.fn(async () => ({
      installations: [{ name: 'gazelle', requiresAuth: true }],
    })),
    listServers: jest.fn(async () => ({
      mcpServers: [{ name: 'agent-manager' }],
    })),
  } as unknown as MusterApi;
  return { api, callTool };
}

/** The arguments of every call of one agent-manager tool. */
export function toolCalls(callTool: jest.Mock, tool: string) {
  return callTool.mock.calls
    .filter(([name]) => name === `x_agent-manager_${tool}`)
    .map(([, args]) => args);
}
