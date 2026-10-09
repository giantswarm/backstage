import type {
  StatusDotTone,
  StatusLabelIntent,
} from '@giantswarm/backstage-plugin-ui-react';
import type { AgentRow } from '../components/AgentsDataProvider';
import type { ModelRow } from '../components/ModelsTable';
import { READINESS_PRESENTATION } from '../components/AgentsTable/readinessStatus';
import { SERVED_MODEL_READINESS } from './serving';
import {
  canonicalRepoUrl,
  canonicalSkillId,
  type DiscoveredSkill,
  repoSlug,
} from './skills';
import { parseSelector, toolsetShape } from './toolset';

/** A state as the shell's Customize screen shows it: a dot and a few words. */
export type CustomizeStatus = { label: string; tone: StatusDotTone };

const INTENT_TONE: Record<StatusLabelIntent, StatusDotTone> = {
  positive: 'success',
  warning: 'warning',
  negative: 'danger',
  info: 'info',
  neutral: 'neutral',
};

export function toneOfIntent(intent: StatusLabelIntent): StatusDotTone {
  return INTENT_TONE[intent];
}

/**
 * An agent's state: its readiness, except that an agent whose model nothing
 * answers for says so, since its turns fail whatever its own readiness.
 */
export function agentStatus(row: AgentRow): CustomizeStatus {
  if (row.modelServing?.readiness === 'notServing') {
    return { label: 'Model not running', tone: 'warning' };
  }
  const { label, intent } = READINESS_PRESENTATION[row.readiness];
  return { label, tone: toneOfIntent(intent) };
}

/**
 * How many connectors (MCP servers) an agent's toolset names, read off its
 * carrier. `undefined` when the toolset does not say: unread, the whole
 * gateway, or presets and single tools whose servers are only known to muster.
 */
export function connectorCount(row: AgentRow): number | undefined {
  const toolset = row.toolset;
  if (!toolset) {
    return undefined;
  }
  if (toolset.state === 'no-gateway') {
    return 0;
  }
  if (toolset.state !== 'declared') {
    return undefined;
  }
  const shape = toolsetShape(toolset.selectors);
  if (shape === 'none') {
    return 0;
  }
  if (shape === 'full') {
    return undefined;
  }
  const selectors = toolset.selectors.map(parseSelector);
  if (selectors.some(selector => selector?.kind !== 'server')) {
    return undefined;
  }
  return new Set(selectors.map(selector => selector?.name)).size;
}

function countNoun(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** "2 skills · 3 connectors", leaving out the connectors when unknown. */
export function agentParts(row: AgentRow): string {
  const connectors = connectorCount(row);
  return [
    countNoun(row.skillCount, 'skill'),
    ...(connectors === undefined ? [] : [countNoun(connectors, 'connector')]),
  ].join(' · ');
}

/**
 * A model's state in the mockup's words: the controller's verdict on the
 * ModelConfig first, then what the serving layer says about the model behind
 * it.
 */
export function modelStatus(row: ModelRow): CustomizeStatus {
  if (row.readiness === 'notAccepted') {
    return { label: 'Not accepted', tone: 'danger' };
  }
  if (row.readiness === 'pending') {
    return { label: 'Pending', tone: 'neutral' };
  }
  const readiness = row.servedBy?.readiness;
  if (readiness === 'notServing') {
    return { label: 'Not running', tone: 'warning' };
  }
  if (
    readiness === undefined ||
    readiness === 'ready' ||
    readiness === 'idle' ||
    readiness === 'available'
  ) {
    return { label: 'Available', tone: 'success' };
  }
  const { label, intent } = SERVED_MODEL_READINESS[readiness];
  return { label, tone: toneOfIntent(intent) };
}

/** "Used by 2 agents", or "Not used yet". */
export function usedByLabel(count: number): string {
  return count === 0 ? 'Not used yet' : `Used by ${countNoun(count, 'agent')}`;
}

/** How many of the agents run on each model, by model row id. */
export function agentsByModel(agents: AgentRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const agent of agents) {
    if (agent.modelConfigId) {
      counts.set(
        agent.modelConfigId,
        (counts.get(agent.modelConfigId) ?? 0) + 1,
      );
    }
  }
  return counts;
}

/** How many of the agents mount each skill, by canonical skill id. */
export function agentsBySkill(agents: AgentRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const agent of agents) {
    for (const id of new Set(agent.skillIds ?? [])) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

function matches(needle: string, fields: (string | undefined)[]): boolean {
  return fields.some(field => field?.toLowerCase().includes(needle));
}

export function searchAgents(rows: AgentRow[], search: string): AgentRow[] {
  const needle = search.trim().toLowerCase();
  return needle
    ? rows.filter(row =>
        matches(needle, [
          row.name,
          row.technicalName,
          row.description,
          row.model,
        ]),
      )
    : rows;
}

export function searchModels(rows: ModelRow[], search: string): ModelRow[] {
  const needle = search.trim().toLowerCase();
  return needle
    ? rows.filter(row =>
        matches(needle, [row.displayName, row.name, row.provider, row.model]),
      )
    : rows;
}

export function searchSkills(
  skills: DiscoveredSkill[],
  search: string,
): DiscoveredSkill[] {
  const needle = search.trim().toLowerCase();
  return needle
    ? skills.filter(skill =>
        matches(needle, [skill.name, skill.description, skillSource(skill)]),
      )
    : skills;
}

/** Where a skill comes from, as `owner/repo`. */
export function skillSource(skill: Pick<DiscoveredSkill, 'repoUrl'>): string {
  return repoSlug(canonicalRepoUrl(skill.repoUrl));
}

/** One entry per skill, however many ways its repository is written. */
export function uniqueSkills(skills: DiscoveredSkill[]): DiscoveredSkill[] {
  const unique = new Map<string, DiscoveredSkill>();
  for (const skill of skills) {
    unique.set(canonicalSkillId(skill), skill);
  }
  return [...unique.values()];
}

/** The skills most used first, then by name; one entry per skill. */
export function rankSkills(
  skills: DiscoveredSkill[],
  usage: Map<string, number>,
): DiscoveredSkill[] {
  return uniqueSkills(skills).sort(
    (a, b) =>
      (usage.get(canonicalSkillId(b)) ?? 0) -
        (usage.get(canonicalSkillId(a)) ?? 0) || a.name.localeCompare(b.name),
  );
}

/** The namespaces of the rows, sorted: the shell's organizations. */
export function organizationsOf(rows: { namespace: string }[]): string[] {
  return [...new Set(rows.map(row => row.namespace).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b),
  );
}

/** The value of the organization select that keeps every row. */
export const ALL_ORGANIZATIONS = 'all';

export function inOrganization<T extends { namespace: string }>(
  rows: T[],
  organization: string,
): T[] {
  return organization === ALL_ORGANIZATIONS
    ? rows
    : rows.filter(row => row.namespace === organization);
}
