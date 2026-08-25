import { dump } from 'js-yaml';
import {
  Agent,
  AgentMcpServerRef,
} from '@giantswarm/backstage-plugin-kubernetes-react';

/**
 * Name of the `RemoteMCPServer` the `agent` chart points every agent at for its
 * tools (`muster.enabled: true` by default, referencing `muster` in
 * `agent-platform`). Matching on the name alone, not the namespace, because the
 * namespace is a chart value and installations may place the gateway elsewhere.
 *
 * A name match is a heuristic, so it only ever *adds* a link to the Tool
 * Explorer; a server we don't recognise is still listed, just without one.
 */
export const MUSTER_MCP_SERVER_NAME = 'muster';

export function isMusterServerRef(ref: AgentMcpServerRef): boolean {
  return ref.name === MUSTER_MCP_SERVER_NAME;
}

/** `<namespace>/<name>` for an MCP server reference, namespace omitted when unset. */
export function mcpServerRefId(ref: AgentMcpServerRef): string {
  return ref.namespace ? `${ref.namespace}/${ref.name}` : ref.name;
}

/**
 * How the agent's access to a server is scoped, in words.
 *
 * `toolNames` is an allowlist; an absent or empty one means the agent may call
 * everything the server exposes, which is worth stating rather than leaving to be
 * inferred from a missing value.
 */
export function describeToolScope(ref: AgentMcpServerRef): string {
  const toolNames = ref.toolNames ?? [];
  if (toolNames.length === 0) {
    return 'All tools from this server';
  }

  return `${toolNames.length} tool${toolNames.length === 1 ? '' : 's'}: ${toolNames.join(', ')}`;
}

type SkillRef = ReturnType<Agent['getSkillRefs']>[number];

/**
 * Display label for a mounted skill: the explicit `name` when the manifest sets
 * one, else the last segment of the path it is mounted from, else the repository
 * itself. Never empty, because a row with no label is unusable.
 */
export function skillLabel(ref: SkillRef): string {
  if (ref.name) {
    return ref.name;
  }

  const fromPath = (ref.path ?? '').split('/').filter(Boolean).pop();
  if (fromPath) {
    return fromPath;
  }

  const fromUrl = ref.url
    .replace(/\.git$/, '')
    .split('/')
    .filter(Boolean)
    .pop();

  return fromUrl ?? ref.url;
}

/**
 * The agent as the YAML a reader would compare against `kubectl get -o yaml`.
 *
 * Two fields are dropped first:
 *
 * - `metadata.managedFields`, which is server-side-apply bookkeeping and, on a
 *   reconciled Agent, the bulk of the object. Nobody debugging an agent reads it,
 *   and it pushes the spec off the screen. (`kubectl get` hides it too.)
 * - the `last-applied-configuration` annotation, which is a JSON copy of the
 *   whole object on one line — the same information, rendered unreadably.
 *
 * Everything else is shown verbatim, `status` included: the point of this view is
 * to see the fields the page does not surface.
 */
export function toAgentManifestYaml(agent: Agent): string {
  const { apiVersion, kind, metadata, ...rest } = agent.jsonData;
  const {
    managedFields: _managedFields,
    annotations,
    ...restMetadata
  } = metadata ?? {};

  const {
    'kubectl.kubernetes.io/last-applied-configuration': _lastApplied,
    ...restAnnotations
  } = annotations ?? {};

  return dump(
    // Key order is `apiVersion, kind, metadata, spec, status`, matching what
    // `kubectl get -o yaml` prints — this view exists to be compared against that,
    // and object spread order is what decides it (`sortKeys` is off deliberately:
    // alphabetical would put `status` before `spec`).
    {
      apiVersion,
      kind,
      metadata: {
        ...restMetadata,
        ...(Object.keys(restAnnotations).length > 0
          ? { annotations: restAnnotations }
          : {}),
      },
      ...rest,
    },
    // Long system messages and controller messages are the reason to open this,
    // so don't let js-yaml fold them at 80 columns.
    { lineWidth: -1, noRefs: true, sortKeys: false },
  );
}
