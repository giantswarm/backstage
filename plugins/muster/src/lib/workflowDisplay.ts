import type {
  ToolAnnotations,
  WorkflowExecutionStatus,
  WorkflowExecutionStep,
} from '../apis/types';
import { toolEffect, ToolEffect } from './toolAnnotations';
import { WorkflowCondition } from './k8s';
import { matchServers, ServerPrefixInfo } from './toolGrouping';
import { WORKFLOW_TOOL_PREFIX } from './workflowReferences';

/**
 * Plain-language helpers for the read-only workflow pages: who answers a
 * step's tool, what a condition gates on, and how a run went. Pure functions,
 * so the step/run renderers stay presentational.
 */

const CORE_TOOL_PREFIX = 'core_';

/**
 * Where a step's tool lives, in words a reader knows: the connector that
 * answers it, muster itself for a `core_*` tool, or the workflow it calls.
 * `unknown` keeps the full tool name — no connector on this installation
 * matches it, so there is nothing friendlier to say.
 */
export type ToolDisplay =
  | { kind: 'workflow'; workflow: string }
  | { kind: 'connector'; connector: string; tool: string }
  | { kind: 'core'; tool: string }
  | { kind: 'unknown'; tool: string };

export function toolDisplay(
  tool: string,
  prefixes: ServerPrefixInfo[],
): ToolDisplay {
  if (tool.startsWith(WORKFLOW_TOOL_PREFIX)) {
    return {
      kind: 'workflow',
      workflow: tool.slice(WORKFLOW_TOOL_PREFIX.length),
    };
  }
  if (tool.startsWith(CORE_TOOL_PREFIX)) {
    return { kind: 'core', tool: tool.slice(CORE_TOOL_PREFIX.length) };
  }
  const matches = matchServers(tool, prefixes);
  const match = matches.find(m => m.family) ?? matches[0];
  if (match) {
    const short = tool.startsWith(`${match.prefix}_`)
      ? tool.slice(match.prefix.length + 1)
      : tool;
    return {
      kind: 'connector',
      connector: match.displayName ?? match.family ?? match.serverName,
      tool: short,
    };
  }
  return { kind: 'unknown', tool };
}

/**
 * Every main-lane step's number by its id, at any depth (`2`, `1.2.3`): how
 * a reference to a step — a `fromStep` condition, a loop over a step's
 * result — names it.
 */
export type StepNumbers = ReadonlyMap<string, string>;

/**
 * A condition as one plain "Only if …" sentence. A false condition skips the
 * step (there is no else-branch), so the sentence is a gate, not a fork.
 * `stepNumbers` resolves a `fromStep` reference to its step number, a nested
 * step's too.
 */
export function conditionSummary(
  condition: WorkflowCondition,
  stepNumbers: StepNumbers = new Map(),
): string {
  const expectsFailure =
    condition.expect?.success === false ||
    condition.expectNot?.success === true;
  const hasJsonPath = Boolean(
    condition.expect?.jsonPath || condition.expectNot?.jsonPath,
  );

  if (condition.fromStep) {
    const number = stepNumbers.get(condition.fromStep);
    const stepName =
      number !== undefined
        ? `step ${number} (${condition.fromStep})`
        : `step “${condition.fromStep}”`;
    if (!hasJsonPath && expectsFailure) {
      return `Only if ${stepName} failed`;
    }
    if (!hasJsonPath && condition.expect?.success === true) {
      return `Only if ${stepName} succeeded`;
    }
    return `Only if the result of ${stepName} matches what is expected`;
  }
  if (condition.tool) {
    return `Only if a check with ${condition.tool} ${
      expectsFailure ? 'fails' : 'passes'
    }`;
  }
  if (condition.template) {
    return `Only if ${condition.template}`;
  }
  return 'Only if a condition holds';
}

/** A workflow's `workflow_<name>` tool in a tool list, if listed. */
export function workflowToolOf<
  T extends { name: string; annotations?: ToolAnnotations },
>(name: string, tools: T[] | null | undefined): T | undefined {
  return tools?.find(t => t.name === `${WORKFLOW_TOOL_PREFIX}${name}`);
}

/**
 * The derived effect of one workflow's `workflow_<name>` tool: muster marks it
 * read-only only when every tool the workflow's steps can reach is, so a
 * workflow reads only when all its steps do.
 */
export function workflowEffect(
  name: string,
  tools: { name: string; annotations?: ToolAnnotations }[] | null | undefined,
): ToolEffect | undefined {
  const tool = workflowToolOf(name, tools);
  return tool ? toolEffect(tool) : undefined;
}

/** The tone and label a run (or step) outcome renders with. */
export function executionOutcome(status: WorkflowExecutionStatus): {
  label: string;
  tone: 'success' | 'danger' | 'info' | 'neutral';
} {
  switch (status) {
    case 'completed':
      return { label: 'Succeeded', tone: 'success' };
    case 'failed':
      return { label: 'Failed', tone: 'danger' };
    case 'inprogress':
      return { label: 'Running', tone: 'info' };
    case 'skipped':
    default:
      return { label: 'Skipped', tone: 'neutral' };
  }
}

/**
 * The first failed step of a run's per-step trace, with its 1-based position —
 * the honest "Failed at step N" the run summaries alone cannot carry (they
 * only have the run-level error string).
 */
export function failedStep(
  steps: WorkflowExecutionStep[] | undefined,
): { number: number; step: WorkflowExecutionStep } | undefined {
  if (!steps) {
    return undefined;
  }
  const index = steps.findIndex(step => step.status === 'failed');
  return index === -1 ? undefined : { number: index + 1, step: steps[index] };
}

/** An argument value for a definition list: objects as compact JSON. */
export function formatArgValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}
