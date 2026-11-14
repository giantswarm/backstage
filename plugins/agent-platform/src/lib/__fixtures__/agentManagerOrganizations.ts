/* eslint-disable @backstage/no-mixed-plugin-imports -- The Agent Platform composes installation APIs across plugins. */
import type { KubernetesApi } from '@backstage/plugin-kubernetes-react';
import type { MusterApi } from '@giantswarm/backstage-plugin-muster';

import type { AgentManagerModelConfig } from '../agentManager';
import type {
  AgentPlatformOrganization,
  ListedOrganization,
  MemberResult,
  OrganizationDeleteResult,
  OrganizationErasure,
  OrganizationConnector,
  OrganizationMember,
  OrganizationNamespace,
  OrganizationListing,
} from '../organizations';

/**
 * What agent-manager answers on one installation, `gazelle`, through its
 * muster, as its organization tools shape their answers
 * (giantswarm/agent-manager `internal/organizations`).
 */
export type OrganizationsScenario = {
  /**
   * The organizations the person belongs to, as `list_organizations` lists
   * them for a member; `organization` below is listed as one they manage.
   */
  mine?: { organizations: OrganizationNamespace[]; none?: string };
  /** The status `list_organizations` gives a member with each of `mine`. */
  memberStatus?: Pick<ListedOrganization, 'orphaned' | 'deleting'>;
  /**
   * `permissions.createAgents` of each of `mine`, by organization namespace;
   * left out of the listing for a namespace not named, as an agent-manager
   * older than the field answers.
   */
  createAgents?: Record<string, boolean>;
  /** How many `list_organizations` calls fail first, as a timeout would. */
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
  /**
   * `get_organization`'s organization, as an organizations-admin reads it;
   * without it the call is refused, as for a member.
   */
  organization?: AgentPlatformOrganization;
  /**
   * `false`: the person may read `organization` but not manage it
   * (`permissions.manage` false). The listing still carries its summary, so
   * a test pins that the page decides on `manage`, not on having the object.
   * Managed when left out.
   */
  manage?: boolean;
  /**
   * What the person's access reviews in an organization namespace answer,
   * by resource; an organization admin's (all allowed) when left out.
   */
  access?: Partial<
    Record<'rolebindings' | 'modelconfigs' | 'secrets', boolean>
  >;
  /** The same per namespace, over `access`, for the namespaces named. */
  namespaceAccess?: Record<string, OrganizationsScenario['access']>;
  /** The namespaces `get_info` lists as managed; none when left out. */
  managed?: string[];
  /** `get_organization` answers `not_found`, as once the operator erased it. */
  organizationErased?: boolean;
  /** `get_organization`'s `erases`: what a delete would erase. */
  erases?: OrganizationErasure;
  /**
   * What `delete_organization` answers; `deleted` with `confirm`, the pull
   * request in mode commit, when left out.
   */
  deleteResult?: Partial<OrganizationDeleteResult>;
  /** What `delete_organization` fails with, as muster passes it on. */
  deleteError?: string;
  /** A prepared credential request answered without its operation id. */
  withoutOperation?: boolean;
  /** What `remove_organization_member` fails with, as muster passes it on. */
  removeError?: string;
  /**
   * The key Secret and key each model of the organization reads, as its
   * ModelConfig says (`spec.apiKeySecret`, `spec.apiKeySecretKey`).
   */
  modelKeys?: Record<string, { secret: string; key: string }>;
  /** What `replace_organization_credential` fails with. */
  replaceError?: string;
  /** The Secret a replacement names does not exist yet. */
  secretMissing?: boolean;
  /**
   * `set_organization_model` on a model whose key Secret exists: the write
   * is finished, with no credential request.
   */
  modelKeyPresent?: boolean;
  /** What `set_organization_model` fails with. */
  modelError?: string;
};

/**
 * `list_organizations` for a scenario: the organizations the person belongs
 * to with their status only, and the one `get_organization` answers, if
 * any, as one they manage.
 */
export function listedOrganizations(
  scenario: OrganizationsScenario,
): OrganizationListing {
  const managed = scenario.organization;
  const isManaged = (parent: string, name: string) =>
    managed?.parent === parent && managed?.name === name;
  const manages = scenario.manage ?? true;
  const listed: ListedOrganization[] = (scenario.mine?.organizations ?? []).map(
    organization => {
      const readable = isManaged(
        organization.parent,
        organization.organization,
      );
      const manage = readable && manages;
      const createAgents = scenario.createAgents?.[organization.namespace];
      return {
        name: organization.organization,
        parent: organization.parent,
        namespace: organization.namespace,
        ...(readable
          ? {
              displayName: managed?.displayName,
              orphaned: managed?.orphaned,
              deleting: managed?.deleting,
              organization: managed,
            }
          : scenario.memberStatus),
        permissions: {
          manage,
          member: true,
          ...(createAgents === undefined ? {} : { createAgents }),
        },
      };
    },
  );
  if (
    managed &&
    !listed.some(organization =>
      isManaged(organization.parent, organization.name),
    )
  ) {
    listed.push({
      name: managed.name,
      parent: managed.parent,
      displayName: managed.displayName,
      namespace: managed.namespace,
      orphaned: managed.orphaned,
      deleting: managed.deleting,
      permissions: { manage: manages, member: false },
      organization: managed,
    });
  }
  return {
    organizations: listed,
    ...(scenario.mine?.none ? { none: scenario.mine.none } : {}),
  };
}

/**
 * The Kubernetes proxy answering only the person's SelfSubjectAccessReviews,
 * as `access` and, for the namespaces it names, `namespaceAccess` say.
 */
export function fakeOrganizationAccess(
  access: OrganizationsScenario['access'] = {},
  modelKeys: OrganizationsScenario['modelKeys'] = {},
  namespaceAccess: OrganizationsScenario['namespaceAccess'] = {},
) {
  const proxy = jest.fn(
    async ({ path, init }: { path: string; init?: RequestInit }) => {
      // The organization's ModelConfigs, as the person reads them: only
      // their key references matter here.
      const models = path.match(
        /\/namespaces\/([^/]+)\/modelconfigs\/?(?:\?|$)/,
      );
      if (models) {
        return new Response(
          JSON.stringify({
            items: Object.entries(modelKeys).map(([name, ref]) => ({
              apiVersion: 'kagent.dev/v1alpha2',
              kind: 'ModelConfig',
              metadata: { name, namespace: models[1] },
              spec: {
                provider: 'Anthropic',
                model: 'claude',
                apiKeySecret: ref.secret,
                apiKeySecretKey: ref.key,
              },
            })),
          }),
          { status: 200 },
        );
      }
      if (!path.endsWith('/selfsubjectaccessreviews')) {
        throw new Error(`unexpected Kubernetes request ${path}`);
      }
      const { namespace, resource } = JSON.parse(String(init?.body)).spec
        .resourceAttributes as {
        namespace: string;
        resource: keyof NonNullable<OrganizationsScenario['access']>;
      };
      const allowed =
        namespaceAccess[namespace]?.[resource] ?? access[resource] ?? true;
      return new Response(JSON.stringify({ status: { allowed } }), {
        status: 201,
      });
    },
  );
  return { proxy } as unknown as KubernetesApi;
}

/** The operation id the fake's credential requests link to. */
export const CREDENTIAL_OPERATION = 'b2'.repeat(24);

/**
 * A credential-request tool's call that declares URL elicitation is asked to
 * open the form's page instead (MCP input_required); the portal's muster
 * client puts it to the person as an external page and, after the save,
 * fails with agent-manager's message. The portal declares none for them.
 */
function requireNoUrlElicitation(
  name: string,
  args: Record<string, unknown>,
  options: { urlElicitation?: boolean } | undefined,
) {
  if (options?.urlElicitation !== false) {
    throw new Error(
      `[agent-manager] Enter the value in the credential UI (${name} for ${String(args.secret ?? args.name)} declared URL elicitation).`,
    );
  }
}

/** muster's `/installations` and server list with agent-manager on gazelle. */
export function fakeOrganizationsMuster(scenario: OrganizationsScenario) {
  let mineFailures = scenario.mineFailures ?? 0;
  const callTool = jest.fn(
    async (
      name: string,
      args: Record<string, unknown>,
      _installation?: string,
      options?: { urlElicitation?: boolean },
    ): Promise<unknown> => {
      switch (name) {
        case 'x_agent-manager_get_info':
          return {
            namespaces: { default: 'kagent', managed: scenario.managed ?? [] },
            capabilities: { organizations: true, egressPolicies: true },
          };
        case 'x_agent-manager_list_organizations':
          if (mineFailures > 0) {
            mineFailures -= 1;
            throw new Error(
              'backend_error: the API server did not answer in time',
            );
          }
          return listedOrganizations(scenario);
        case 'x_agent-manager_get_organization':
          if (scenario.organizationErased) {
            throw new Error(
              'not_found: get AgentPlatformOrganization org-acme/payments',
            );
          }
          // agent-manager answers the organization's fields and `erases`
          // side by side.
          if (scenario.organization) {
            return {
              ...scenario.organization,
              ...(scenario.erases ? { erases: scenario.erases } : {}),
            };
          }
          // A member may not read the AgentPlatformOrganization itself.
          throw new Error(
            'forbidden: you may not get agentplatformorganizations in org-acme: agent-platform:organizations-admin grants it',
          );
        case 'x_agent-manager_delete_organization': {
          if (scenario.deleteError) {
            throw new Error(scenario.deleteError);
          }
          const confirmed =
            args.confirm === `${String(args.namespace)}/${String(args.name)}`;
          const result: OrganizationDeleteResult = {
            organization: scenario.organization!,
            ...(scenario.erases ? { erases: scenario.erases } : {}),
            deleted: confirmed,
            ...(args.mode === 'commit' && !args.confirm
              ? {
                  commit: {
                    repository: 'giantswarm/gazelle-configs',
                    base: 'main',
                    branch: 'agent-manager/delete-payments',
                    pullRequest:
                      'https://github.com/giantswarm/gazelle-configs/pull/42',
                    number: 42,
                    review: 'the platform team reviews it',
                  },
                }
              : {}),
            ...scenario.deleteResult,
          };
          return result;
        }
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
          requireNoUrlElicitation(name, args, options);
          if (scenario.modelError) {
            throw new Error(scenario.modelError);
          }
          if (scenario.modelKeyPresent) {
            // A change of a model whose key exists: written at once.
            return {
              namespace: args.namespace,
              kind: 'model',
              name: args.name,
              ...(args.default ? { defaultModel: args.name } : {}),
              credentials: [
                {
                  secret: `tenant-credential-${String(args.name)}`,
                  key: 'apiKey',
                  state: 'present',
                },
              ],
            };
          }
          // A new model: agent-manager prepares a credential request for
          // its missing key and answers its operation id and form link.
          return {
            namespace: args.namespace,
            kind: 'model',
            name: args.name,
            pending: true,
            ...(scenario.withoutOperation
              ? {}
              : { credentialOperation: CREDENTIAL_OPERATION }),
            credentials: [
              {
                secret: `tenant-credential-${String(args.name)}`,
                key: 'apiKey',
                state: 'missing',
                formUrl: `https://portal.example.com/credentials?operation=${CREDENTIAL_OPERATION}`,
              },
            ],
          };
        case 'x_agent-manager_replace_organization_credential':
          // A new value for one key of a Secret: the operation writes the
          // Secret only.
          requireNoUrlElicitation(name, args, options);
          if (scenario.replaceError) {
            throw new Error(scenario.replaceError);
          }
          return {
            namespace: args.namespace,
            kind: 'credential',
            name: args.secret,
            pending: true,
            ...(scenario.withoutOperation
              ? {}
              : { credentialOperation: CREDENTIAL_OPERATION }),
            credentials: [
              {
                secret: args.secret,
                key: args.key,
                state: scenario.secretMissing ? 'missing' : 'replace',
              },
            ],
          };
        default:
          throw new Error(`unexpected tool ${name}`);
      }
    },
  );
  const api = {
    describeTool: jest.fn(async () => ({
      inputSchema: {
        properties: Object.fromEntries(
          [
            'projectID',
            'location',
            'endpoint',
            'displayName',
            'noCredential',
          ].map(key => [key, {}]),
        ),
      },
    })),
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
