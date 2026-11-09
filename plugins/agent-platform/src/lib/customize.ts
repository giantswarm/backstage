import { ModelConfigConditionType } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  countNoun,
  matchesQuery,
  type StatusDotTone,
  type StatusLabelIntent,
} from '@giantswarm/backstage-plugin-ui-react';
import type { AgentRow } from '../components/AgentsDataProvider';
import {
  newestFirst,
  timestampValue,
} from '../components/SessionsDataProvider/helpers';
import type { ModelRow } from '../components/ModelsTable';
import { READINESS_PRESENTATION } from '../components/AgentsTable/readinessStatus';
import { matches } from './search';
import { SERVED_MODEL_READINESS } from './serving';
import {
  canonicalSkillId,
  normalizedRepoUrl,
  type DiscoveredSkill,
  repoSlug,
  skillTags,
} from './skills';

/** A state as the shell's Customize screen shows it: a dot and a few words. */
export type CustomizeStatus = {
  label: string;
  tone: StatusDotTone;
  /** Why it is in that state, in the controller's words, for a hint beside it. */
  detail?: string;
};

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
    return { label: 'Model not serving', tone: 'warning' };
  }
  const { label, intent } = READINESS_PRESENTATION[row.readiness];
  return { label, tone: toneOfIntent(intent) };
}

/**
 * The Harnesses the agents run on, by name, each with the title the first of
 * its agents carries. An inline Harness has no name and is not counted.
 */
export function agentHarnesses(
  rows: readonly AgentRow[],
): Map<string, string | undefined> {
  const titles = new Map<string, string | undefined>();
  for (const row of rows) {
    if (row.harness !== undefined && !titles.get(row.harness)) {
      titles.set(row.harness, row.harnessTitle);
    }
  }
  return titles;
}

/** "Claude Code (claude-code)", or the name alone before the title is read. */
export function harnessLabel(name: string, title?: string): string {
  return title ? `${title} (${name})` : name;
}

/** Why a model whose latest change the controller has not reconciled is Pending. */
export const STALE_MODEL_DETAIL =
  'The controller has not reconciled the latest change yet.';

/**
 * A model's state: the controller's verdict on the ModelConfig first, then
 * what the serving layer says about the model behind it — in the Running
 * models table's words, so one served model reads the same everywhere (UX
 * review M14). A model nothing here serves (a provider's) is Ready once
 * accepted. A verdict short of accepted carries the controller's message
 * (which Secret is missing, say) as its detail.
 *
 * A failure is named by the condition that failed: "Not accepted" when kagent
 * rejects the settings (`Accepted`), "Incomplete" when it accepts them but
 * cannot find what they refer to, such as the key Secret (`ResolvedRefs`).
 */
export function modelStatus(row: ModelRow): CustomizeStatus {
  if (row.readiness === 'notAccepted') {
    return {
      label:
        row.failedCondition === ModelConfigConditionType.ResolvedRefs
          ? 'Incomplete'
          : 'Not accepted',
      tone: 'danger',
      detail: row.readinessMessage,
    };
  }
  if (row.readiness === 'pending') {
    return {
      label: 'Pending',
      tone: 'neutral',
      // A stale status is pending for that reason alone; its conditions, and
      // so its message, describe the previous spec.
      detail: row.isStale ? STALE_MODEL_DETAIL : row.readinessMessage,
    };
  }
  const readiness = row.servedBy?.readiness;
  if (readiness === undefined) {
    return { label: SERVED_MODEL_READINESS.ready.label, tone: 'success' };
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

export function searchAgents(rows: AgentRow[], search: string): AgentRow[] {
  const needle = search.trim().toLowerCase();
  return needle
    ? rows.filter(row =>
        matches(needle, [
          row.name,
          row.technicalName,
          row.description,
          row.model,
          row.harness,
          row.harnessTitle,
          ...row.tags,
        ]),
      )
    : rows;
}

/** How the Agents list is ordered. */
export type AgentSort = 'lastUsed' | 'recent' | 'name';

export const AGENT_SORTS: ReadonlyArray<{ id: AgentSort; label: string }> = [
  { id: 'lastUsed', label: 'Last used' },
  { id: 'recent', label: 'Recently added' },
  { id: 'name', label: 'Name' },
];

/**
 * The rows in the list's order: by when the person last used each agent
 * (`lastUsedAt`, epoch ms by row id; an agent never used goes last), by
 * creation, newest first, or by name. The name breaks every tie.
 */
export function sortAgents(
  rows: readonly AgentRow[],
  sort: AgentSort,
  lastUsedAt: ReadonlyMap<string, number> = new Map(),
): AgentRow[] {
  const byName = (a: AgentRow, b: AgentRow) => a.name.localeCompare(b.name);
  return [...rows].sort((a, b) => {
    let order = 0;
    if (sort === 'lastUsed') {
      order = newestFirst(lastUsedAt.get(a.id), lastUsedAt.get(b.id));
    } else if (sort === 'recent') {
      order = newestFirst(
        timestampValue(a.createdAt),
        timestampValue(b.createdAt),
      );
    }
    return order || byName(a, b);
  });
}

export function searchModels(rows: ModelRow[], search: string): ModelRow[] {
  const needle = search.trim().toLowerCase();
  return needle
    ? rows.filter(row =>
        matches(needle, [row.displayName, row.name, row.provider, row.model]),
      )
    : rows;
}

/**
 * The skill catalog's one search, for Customize › Skills and the agent
 * wizard's skill step alike: token-boundary matching (`matchesQuery`) over the
 * name, description, path, source and tags, so one query finds the same
 * skills in both places.
 */
export function searchSkills<T extends DiscoveredSkill>(
  skills: T[],
  search: string,
): T[] {
  const query = search.trim();
  return query
    ? skills.filter(skill =>
        matchesQuery(
          query,
          [
            skill.name,
            skill.description,
            skill.path,
            skillSource(skill),
            ...skillTags(skill),
          ].join(' '),
        ),
      )
    : skills;
}

/** Where a skill comes from, as `owner/repo` in the case it is written in. */
export function skillSource(skill: Pick<DiscoveredSkill, 'repoUrl'>): string {
  return repoSlug(normalizedRepoUrl(skill.repoUrl));
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
