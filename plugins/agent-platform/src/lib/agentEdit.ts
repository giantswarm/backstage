import type {
  AgentManagerAgent,
  AgentPluginEntry,
  AgentSkillEntry,
  AgentUpdate,
} from './agentManager';
import { declaredToolset, normalizeSelection } from './toolset';
import { egressTextOf, parseEgressText, sameEgress } from './egress';
import { skillEntryOf } from './agentSpec';
import {
  defaultWorkspaceName,
  qualifiedDefaultWorkspace,
} from './defaultWorkspace';
import { canonicalSkillId, type DiscoveredSkill } from './skills';
import {
  pluginEntryKey,
  pluginEntryOf,
  pluginEntryPlace,
  pluginId,
  type DiscoveredPlugin,
  type SelectedPlugin,
} from './plugins';
import type { NewAgentFormState } from '../components/NewAgentFormProvider';

/**
 * The model of an edit: the fields of an agent a person changes through the
 * edit wizard (the create wizard prefilled, see {@link formStateOfAgent}). Everything the 1.x values carry for an agent and nothing else —
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
  /** The plugins as pinned, each with its skill selection. */
  plugins: AgentPluginEntry[];
  /** Extra HTTP(S) origins the agent may reach, one per line as typed. */
  egressText: string;
  /** The EgressPolicies of its namespace it picks, in order. */
  egressPolicyRefs: string[];
  /** The default workspace's name; `''` for none. */
  defaultWorkspace: string;
  /**
   * The Tools step's *Nothing outside the chat* was picked: an empty `toolset`
   * then declares `preset:none` even for an agent that declares no toolset
   * (whose untouched empty selection is no change).
   */
  chatOnly?: boolean;
};

/** The fields an update can carry, in the order the form shows them. */
export const AGENT_EDIT_FIELDS = [
  'displayName',
  'description',
  'systemMessage',
  'modelConfig',
  'toolset',
  'skills',
  'plugins',
  'egress',
  'egressPolicyRefs',
  'defaultWorkspace',
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
    plugins: [...(agent.plugins ?? [])],
    egressText: egressTextOf(agent.egress),
    egressPolicyRefs: [...(agent.egressPolicyRefs ?? [])],
    defaultWorkspace: defaultWorkspaceName(agent.defaultWorkspace),
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

function samePlugins(a: AgentPluginEntry[], b: AgentPluginEntry[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (plugin, index) => pluginEntryKey(plugin) === pluginEntryKey(b[index]),
    )
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
  if (
    declared
      ? !sameList(selection, declared)
      : selection.length > 0 || Boolean(edit.chatOnly)
  ) {
    changed.push('toolset');
  }
  if (!sameSkills(edit.skills, baseline.skills)) {
    changed.push('skills');
  }
  if (!samePlugins(edit.plugins, baseline.plugins)) {
    changed.push('plugins');
  }
  if (!sameEgress(parseEgressText(edit.egressText), agent.egress ?? [])) {
    changed.push('egress');
  }
  // The set matters, not the order picked.
  if (
    !sameList(
      [...edit.egressPolicyRefs].sort(),
      [...baseline.egressPolicyRefs].sort(),
    )
  ) {
    changed.push('egressPolicyRefs');
  }
  if (edit.defaultWorkspace !== baseline.defaultWorkspace) {
    changed.push('defaultWorkspace');
  }
  return changed;
}

/**
 * The `update_agent` arguments for an edit: only the fields that changed.
 *
 * A string field the person emptied is sent as `""`, which agent-manager reads
 * as "back to the chart's default" (an omitted field would mean "unchanged").
 * `toolset`, `skills`, `egress` and `egressPolicyRefs` replace their whole
 * list (an empty `egress` or `egressPolicyRefs` clears it); an emptied default workspace is sent as `""`, which
 * removes it; the empty selection is sent
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
      case 'plugins':
        update.plugins = edit.plugins;
        break;
      case 'egress':
        update.egress = parseEgressText(edit.egressText);
        break;
      case 'egressPolicyRefs':
        update.egressPolicyRefs = edit.egressPolicyRefs;
        break;
      case 'defaultWorkspace':
        update.defaultWorkspace = qualifiedDefaultWorkspace(
          agent.namespace,
          edit.defaultWorkspace,
        );
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

/** How the review names a changed field: the wizard's own words. */
export const EDIT_FIELD_LABELS: Record<AgentEditField, string> = {
  displayName: 'Name',
  description: "What it's for",
  systemMessage: 'Instructions',
  modelConfig: 'Model',
  toolset: 'Tools',
  skills: 'Skills',
  plugins: 'Plugins',
  egress: 'Extra egress origins',
  egressPolicyRefs: 'EgressPolicies',
  defaultWorkspace: 'Default workspace',
};

/** Where a git skill entry lives, in the catalog's canonical shape. */
function placeOfEntry(entry: AgentSkillEntry): string | undefined {
  return 'git' in entry
    ? canonicalSkillId({ repoUrl: entry.git.url, path: entry.path ?? '' })
    : undefined;
}

/**
 * The create wizard's state prefilled from an agent, for the edit wizard.
 *
 * - The name is the display name, else the technical name (the wizard
 *   requires one); {@link editStateOfForm} reads an untouched technical name
 *   back as "no display name", so prefilling it is not a change.
 * - The technical name, installation, namespace and Harness are the agent's
 *   and fixed: an update cannot move them. The Harness is left undefined when
 *   it is the platform's, as the create wizard leaves it.
 * - Each mounted git skill the catalog lists is selected as the catalog's
 *   skill but at the commit the agent is pinned to, so its card reads
 *   "pinned at" and an untouched skill is written back unmoved. Every other
 *   skill (another repository, an OCI digest) is kept as it is.
 */
export function formStateOfAgent(
  agent: AgentManagerAgent,
  options: {
    installation: string;
    /** The configured repositories' skills, each at its head commit. */
    catalog: DiscoveredSkill[];
    /** The plugins found in the same repositories, at the same commits. */
    pluginCatalog?: DiscoveredPlugin[];
    /** agent-manager's platform Harness (`get_info`), when known. */
    platformHarness?: string;
  },
): NewAgentFormState {
  const baseline = editStateOf(agent);
  const listed = new Map(
    options.catalog.map(skill => [canonicalSkillId(skill), skill]),
  );
  const selectedSkills: DiscoveredSkill[] = [];
  const keptSkills: AgentSkillEntry[] = [];
  for (const entry of agent.skills ?? []) {
    const place = placeOfEntry(entry);
    const skill = place ? listed.get(place) : undefined;
    if (skill && 'git' in entry) {
      selectedSkills.push({ ...skill, commit: entry.git.commit });
    } else {
      keptSkills.push(entry);
    }
  }
  const listedPlugins = new Map(
    (options.pluginCatalog ?? []).map(plugin => [pluginId(plugin), plugin]),
  );
  const selectedPlugins: SelectedPlugin[] = [];
  const keptPlugins: AgentPluginEntry[] = [];
  for (const entry of agent.plugins ?? []) {
    const place = pluginEntryPlace(entry);
    const plugin = place ? listedPlugins.get(place) : undefined;
    if (plugin && entry.git?.commit) {
      selectedPlugins.push({
        plugin: { ...plugin, commit: entry.git.commit },
        skills: [...(entry.skills ?? [])],
      });
    } else {
      keptPlugins.push(entry);
    }
  }
  const harness =
    agent.harness && agent.harness !== options.platformHarness
      ? { name: agent.harness }
      : undefined;
  return {
    name: baseline.displayName || agent.name,
    slug: agent.name,
    description: baseline.description,
    installation: options.installation,
    modelConfigName: baseline.modelConfig || undefined,
    modelConfigNamespace: agent.namespace,
    modelDisplayName: undefined,
    harness,
    droppedHarness: undefined,
    systemMessage: baseline.systemMessage,
    egressText: baseline.egressText,
    egressPolicyRefs: baseline.egressPolicyRefs,
    defaultWorkspace: baseline.defaultWorkspace,
    selectedSkills,
    keptSkills,
    selectedPlugins,
    keptPlugins,
    toolset: baseline.toolset,
    // An agent declaring no tools is *Nothing outside the chat* on the Tools
    // step; one declaring no toolset at all (implicit full access) is not.
    toolsChatOnly: agent.toolset !== undefined && baseline.toolset.length === 0,
  };
}

/**
 * The skills an edit writes: the agent's entries still selected or kept, in
 * the agent's order and exactly as pinned, then the newly selected ones,
 * pinned to the commit their card showed. An untouched list is the agent's
 * own, so it is no change.
 */
function skillEntriesOfForm(
  agent: AgentManagerAgent,
  form: Pick<NewAgentFormState, 'selectedSkills' | 'keptSkills'>,
): AgentSkillEntry[] {
  const selected = new Map(
    form.selectedSkills.map(skill => [canonicalSkillId(skill), skill]),
  );
  const kept = new Set(form.keptSkills.map(skillEntryKey));
  const written = new Set<string>();
  const entries: AgentSkillEntry[] = [];
  for (const entry of agent.skills ?? []) {
    const place = placeOfEntry(entry);
    if (kept.has(skillEntryKey(entry))) {
      entries.push(entry);
    } else if (place && selected.has(place) && !written.has(place)) {
      entries.push(entry);
      written.add(place);
    }
  }
  for (const [place, skill] of selected) {
    if (!written.has(place)) {
      entries.push(skillEntryOf(skill));
      written.add(place);
    }
  }
  return entries;
}

/**
 * The plugins an edit writes, as {@link skillEntriesOfForm} does for skills:
 * the agent's entries still picked or kept, in the agent's order — exactly as
 * pinned unless the selection changed —, then the newly picked ones.
 */
function pluginEntriesOfForm(
  agent: AgentManagerAgent,
  form: Pick<NewAgentFormState, 'selectedPlugins' | 'keptPlugins'>,
): AgentPluginEntry[] {
  const selected = new Map(
    form.selectedPlugins.map(picked => [pluginId(picked.plugin), picked]),
  );
  const kept = new Set(form.keptPlugins.map(pluginEntryKey));
  const written = new Set<string>();
  const entries: AgentPluginEntry[] = [];
  for (const entry of agent.plugins ?? []) {
    const place = pluginEntryPlace(entry);
    const picked = place ? selected.get(place) : undefined;
    if (kept.has(pluginEntryKey(entry))) {
      entries.push(entry);
    } else if (place && picked && !written.has(place)) {
      const { skills: pinnedSkills = [], ...source } = entry;
      const skills = picked.skills;
      if (skills.join(',') === pinnedSkills.join(',')) {
        entries.push(entry);
      } else {
        entries.push(skills.length > 0 ? { ...source, skills } : source);
      }
      written.add(place);
    }
  }
  for (const [place, picked] of selected) {
    if (!written.has(place)) {
      entries.push(pluginEntryOf(picked));
      written.add(place);
    }
  }
  return entries;
}

/** The edit the wizard's state amounts to, for {@link updateOf}. */
export function editStateOfForm(
  agent: AgentManagerAgent,
  form: NewAgentFormState,
): AgentEditState {
  const untouchedTechnicalName =
    !agent.displayName && form.name.trim() === agent.name;
  return {
    displayName: untouchedTechnicalName ? '' : form.name,
    description: form.description,
    systemMessage: form.systemMessage,
    modelConfig: form.modelConfigName ?? '',
    toolset: form.toolset,
    skills: skillEntriesOfForm(agent, form),
    plugins: pluginEntriesOfForm(agent, form),
    egressText: form.egressText,
    egressPolicyRefs: form.egressPolicyRefs,
    defaultWorkspace: form.defaultWorkspace,
    chatOnly: Boolean(form.toolsChatOnly),
  };
}
