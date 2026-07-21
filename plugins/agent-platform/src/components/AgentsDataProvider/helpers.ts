import {
  Agent,
  ModelConfig,
} from '@giantswarm/backstage-plugin-kubernetes-react';

/**
 * A single agent flattened into a plain row for the table. Plain objects (not
 * `Agent` instances) so default sorting/rendering is trivial and the table
 * layer stays decoupled from the resource classes.
 */
export type AgentRow = {
  /** Stable unique key: installation + namespace + resource name. */
  id: string;
  installation: string;
  namespace: string;
  /** Display name (annotation) falling back to the resource name. */
  name: string;
  /**
   * Technical (DNS-1123) resource name. Seeds the deterministic avatar — the
   * avatar derives from the technical name, not the display name.
   */
  technicalName: string;
  description: string;
  /**
   * Human-readable model label resolved from the referenced ModelConfig, or
   * `undefined` when the agent references no model (e.g. BYO agents).
   */
  model?: string;
  skillCount: number;
};

/**
 * Resolve an agent's `spec.declarative.modelConfig` reference to a
 * human-readable label by joining against the ModelConfigs on the same
 * installation. ModelConfigs are namespaced and must live in the agent's
 * namespace, so we match on both name and namespace.
 *
 * Falls back to the raw reference name when the ModelConfig can't be found
 * (unreadable, not yet loaded, or on another installation), and to `undefined`
 * when the agent references no model at all.
 */
export function resolveModelLabel(
  agent: Agent,
  modelConfigs: ModelConfig[],
): string | undefined {
  const ref = agent.getModelConfigName();
  if (!ref) {
    return undefined;
  }

  const namespace = agent.getNamespace();
  const match = modelConfigs.find(
    mc => mc.getName() === ref && mc.getNamespace() === namespace,
  );

  return match?.getDisplayName() ?? ref;
}

/** Flatten an `Agent` resource into a plain {@link AgentRow}. */
export function toAgentRow(
  agent: Agent,
  modelConfigs: ModelConfig[],
): AgentRow {
  const installation = agent.cluster;
  const namespace = agent.getNamespace() ?? '';
  const name = agent.getName();

  return {
    id: `${installation}/${namespace}/${name}`,
    installation,
    namespace,
    name: agent.getDisplayName(),
    technicalName: name,
    description: agent.getDescription() ?? '',
    model: resolveModelLabel(agent, modelConfigs),
    skillCount: agent.getSkillCount(),
  };
}

/** Stable ordering: by installation, then display name. */
export function sortAgentRows(rows: AgentRow[]): AgentRow[] {
  return [...rows].sort(
    (a, b) =>
      a.installation.localeCompare(b.installation) ||
      a.name.localeCompare(b.name),
  );
}
