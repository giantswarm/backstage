import type {
  AgentManagerAgent,
  AgentSkillEntry,
  AgentUpdate,
} from './agentManager';
import { declaredToolset, normalizeSelection } from './toolset';

/**
 * The edit form's model: the fields of an agent a person changes from the
 * detail page. Everything the 1.x values carry for an agent and nothing else —
 * no runtime (every agent runs on the platform Harness), no per-skill
 * credential, no avatar (the icon URL follows the technical name).
 */
export type AgentEditState = {
  displayName: string;
  description: string;
  systemMessage: string;
  /** Name of a ModelConfig in the agent's namespace. */
  modelConfig: string;
  /**
   * The toolset as selected: inline selectors in order, without `preset:none`
   * — the empty selection *is* no tools and is declared as `preset:none` when
   * sent (the same convention as the create flow's Tools step).
   */
  toolset: string[];
  /** The skills as pinned; adding one pins it to the commit chosen at selection. */
  skills: AgentSkillEntry[];
};

/** The fields an update can carry, in the order the form shows them. */
export const AGENT_EDIT_FIELDS = [
  'displayName',
  'description',
  'systemMessage',
  'modelConfig',
  'toolset',
  'skills',
] as const;

export type AgentEditField = (typeof AGENT_EDIT_FIELDS)[number];

/** What the form is pre-filled with: `get_agent`'s reading of the agent. */
export function editStateOf(agent: AgentManagerAgent): AgentEditState {
  return {
    displayName: agent.displayName ?? '',
    description: agent.description ?? '',
    systemMessage: agent.systemMessage ?? '',
    modelConfig: agent.modelConfig ?? '',
    toolset: normalizeSelection(agent.toolset ?? []),
    skills: [...(agent.skills ?? [])],
  };
}

/** The identity of a skill entry for comparison: its source and place. */
export function skillEntryKey(skill: AgentSkillEntry): string {
  return 'git' in skill
    ? `git:${skill.git.url}#${skill.path ?? ''}@${skill.git.commit}`
    : `oci:${skill.oci}`;
}

function sameSkills(a: AgentSkillEntry[], b: AgentSkillEntry[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every(
    (skill, index) => skillEntryKey(skill) === skillEntryKey(b[index]),
  );
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/**
 * The toolset an agent declares, for comparison with an edit: the selectors
 * without `preset:none`, or `undefined` for an agent that declares none (it
 * predates toolsets and has implicit full access — a different state from an
 * agent with `preset:none`).
 */
function declaredSelection(agent: AgentManagerAgent): string[] | undefined {
  return agent.toolset ? normalizeSelection(agent.toolset) : undefined;
}

/**
 * The fields of `edit` that differ from what the agent has now — the review
 * lists them, and {@link updateOf} sends exactly these.
 */
export function changedFields(
  agent: AgentManagerAgent,
  edit: AgentEditState,
): AgentEditField[] {
  const baseline = editStateOf(agent);
  const changed: AgentEditField[] = [];
  for (const field of [
    'displayName',
    'description',
    'systemMessage',
  ] as const) {
    if (edit[field].trim() !== baseline[field].trim()) {
      changed.push(field);
    }
  }
  if (edit.modelConfig && edit.modelConfig !== baseline.modelConfig) {
    changed.push('modelConfig');
  }
  // An agent without a declared toolset keeps its implicit full access until
  // the person selects something: an untouched empty selection is not a
  // change to `preset:none`.
  const declared = declaredSelection(agent);
  const selection = normalizeSelection(edit.toolset);
  if (declared ? !sameList(selection, declared) : selection.length > 0) {
    changed.push('toolset');
  }
  if (!sameSkills(edit.skills, baseline.skills)) {
    changed.push('skills');
  }
  return changed;
}

/**
 * The `update_agent` arguments for an edit: only the fields that changed.
 *
 * A string field the person emptied is sent as `""`, which agent-manager reads
 * as "back to the chart's default" (an omitted field would mean "unchanged").
 * `toolset` and `skills` replace their whole list; the empty selection is sent
 * as `preset:none`, never as an empty list (agent-manager refuses that).
 * Nothing else is ever sent — no `force`, no runtime.
 */
export function updateOf(
  agent: AgentManagerAgent,
  edit: AgentEditState,
): AgentUpdate {
  const update: AgentUpdate = { namespace: agent.namespace, name: agent.name };
  for (const field of changedFields(agent, edit)) {
    switch (field) {
      case 'displayName':
      case 'description':
      case 'systemMessage':
        update[field] = edit[field].trim() === '' ? '' : edit[field];
        break;
      case 'modelConfig':
        update.modelConfig = edit.modelConfig;
        break;
      case 'toolset':
        update.toolset = declaredToolset(edit.toolset);
        break;
      case 'skills':
        update.skills = edit.skills;
        break;
      default:
        break;
    }
  }
  return update;
}

/** Whether an update carries anything beyond the agent's identity. */
export function hasChanges(update: AgentUpdate): boolean {
  return Object.keys(update).some(key => key !== 'namespace' && key !== 'name');
}

/** How the review names a changed field. */
export const EDIT_FIELD_LABELS: Record<AgentEditField, string> = {
  displayName: 'Display name',
  description: 'Description',
  systemMessage: 'System prompt',
  modelConfig: 'Model',
  toolset: 'Toolset',
  skills: 'Skills',
};
