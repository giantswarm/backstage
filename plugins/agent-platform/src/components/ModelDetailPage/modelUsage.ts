import type { AgentRow } from '../AgentsDataProvider';
import type { LlmDailySeries, LlmUsage } from '../../lib/llmUsage';

/**
 * A dated snapshot suffix providers append to the model a call ran on
 * (`claude-sonnet-4-5-20250929`, `gpt-4o-2024-08-06`): the gateway's
 * `gen_ai_response_model` names the snapshot while the ModelConfig names the
 * alias. Only a date counts — `gpt-4o-mini` is another model, not a snapshot
 * of `gpt-4o`.
 */
const SNAPSHOT_SUFFIX = /^-(\d{8}|\d{4}-\d{2}-\d{2})$/;

/**
 * Whether a model the gateway reported (`gen_ai_response_model`) is the one a
 * ModelConfig configures (`spec.model`): the same name, or that name with a
 * dated snapshot suffix. Case-insensitive.
 */
export function isGatewayModelOf(
  configModel: string | undefined,
  gatewayModel: string,
): boolean {
  if (!configModel || !gatewayModel) {
    return false;
  }
  const configured = configModel.toLowerCase();
  const reported = gatewayModel.toLowerCase();
  if (reported === configured) {
    return true;
  }
  return (
    reported.startsWith(configured) &&
    SNAPSHOT_SUFFIX.test(reported.slice(configured.length))
  );
}

/** One agent's traffic on the model. */
export type ModelAgentUsage = {
  tokens: number;
  calls: number;
  /** `undefined` when nothing of it was priced. */
  costUsd: number | undefined;
};

/** The Usage screen's reductions, narrowed to one model. */
export type ModelUsageSlice = {
  /** `undefined` when the gateway priced none of the model's calls. */
  costUsd: number | undefined;
  tokens: number;
  calls: number;
  /** The gateway's names for the model that matched, e.g. a dated snapshot. */
  gatewayModels: string[];
  /** Spend per day on the model, one series named `label`; no series without calls. */
  costPerDay: LlmDailySeries;
  /** Per agent, keyed `<namespace>/<name>`. */
  byAgent: Map<string, ModelAgentUsage>;
};

function addCost(
  total: number | undefined,
  cost: number | undefined,
): number | undefined {
  if (cost === undefined) {
    return total;
  }
  return (total ?? 0) + cost;
}

/**
 * Everything the gateway reported for one model over the window: the totals
 * of its by-model rows, its bars of the cost-per-day series, and its split by
 * agent — the same reductions the Usage screen renders, filtered rather than
 * recomputed, so the two can never disagree.
 *
 * The gateway keys its metrics by the model a call ran on, not by the
 * ModelConfig that sent it: two configurations of the same model on one
 * installation share these figures.
 */
export function modelUsageSlice(
  usage: LlmUsage,
  configModel: string | undefined,
  label: string,
): ModelUsageSlice {
  const matches = (model: string) => isGatewayModelOf(configModel, model);

  let costUsd: number | undefined;
  let tokens = 0;
  let calls = 0;
  const gatewayModels: string[] = [];
  for (const row of usage.byModel) {
    if (!matches(row.model)) {
      continue;
    }
    gatewayModels.push(row.model);
    tokens += row.tokens;
    calls += row.calls;
    costUsd = addCost(costUsd, row.costUsd);
  }

  const byAgent = new Map<string, ModelAgentUsage>();
  for (const row of usage.byAgentModel) {
    if (!matches(row.model)) {
      continue;
    }
    const key = `${row.namespace}/${row.agent}`;
    const entry = byAgent.get(key) ?? {
      tokens: 0,
      calls: 0,
      costUsd: undefined,
    };
    entry.tokens += row.tokens;
    entry.calls += row.calls;
    entry.costUsd = addCost(entry.costUsd, row.costUsd);
    byAgent.set(key, entry);
  }

  const seriesKeys = usage.costPerDay.series.filter(matches);
  const costPerDay: LlmDailySeries =
    seriesKeys.length === 0
      ? { rows: [], series: [] }
      : {
          series: [label],
          rows: usage.costPerDay.rows.map(row => ({
            day: row.day,
            [label]: seriesKeys.reduce((sum, key) => {
              const value = row[key];
              return sum + (typeof value === 'number' ? value : 0);
            }, 0),
          })),
        };

  return { costUsd, tokens, calls, gatewayModels, costPerDay, byAgent };
}

/** A context window for people: `200k tokens`, `1M tokens`. */
export function describeContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${Number((tokens / 1_000_000).toFixed(1))}M tokens`;
  }
  if (tokens >= 1000) {
    return `${Math.round(tokens / 1000)}k tokens`;
  }
  return `${tokens} tokens`;
}

/** `<installation>/<namespace>/<name>`: the id a model row and an agent's `modelConfigId` share. */
export function modelConfigIdOf(
  installation: string,
  namespace: string,
  name: string,
): string {
  return `${installation}/${namespace}/${name}`;
}

/**
 * The agents whose spec references the ModelConfig, by name: the list behind
 * the Customize screen's "Used by" count, so the two always agree.
 */
export function agentsUsingModel(
  agents: AgentRow[],
  modelConfigId: string,
): AgentRow[] {
  return agents
    .filter(agent => agent.modelConfigId === modelConfigId)
    .sort((a, b) => a.name.localeCompare(b.name));
}
