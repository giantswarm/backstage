import type { AgentSkillEntry, AgentSpec } from './agentManager';
import type { DiscoveredSkill } from './skills';
import type { NewAgentFormState } from '../components/NewAgentFormProvider';

/**
 * A selected skill as the create contract carries it: the repository and the
 * commit the skills step showed, never the branch. The pin is what is written,
 * so agent-manager's own resolution cannot move it.
 */
export function skillEntryOf(skill: DiscoveredSkill): AgentSkillEntry {
  return {
    name: skill.name,
    ...(skill.path ? { path: skill.path } : {}),
    git: { url: skill.repoUrl, commit: skill.commit },
  };
}

/**
 * The create-form model as agent-manager's contract. Empty optional fields are
 * left out so the chart's defaults apply (an empty system prompt is the chart's
 * default prompt, not an empty one).
 */
export function agentSpecOf(
  state: NewAgentFormState,
  options: {
    /** What the release declares: the selection, or `preset:none` for none. */
    toolset: string[];
    /** The canonical avatar URL for the technical name, when resolvable. */
    iconUrl?: string;
  },
): AgentSpec {
  const spec: AgentSpec = {
    namespace: state.modelConfigNamespace ?? '',
    name: state.slug,
    displayName: state.name,
    modelConfig: state.modelConfigName ?? '',
    toolset: options.toolset,
  };
  if (state.description.trim()) {
    spec.description = state.description;
  }
  if (state.systemMessage.trim()) {
    spec.systemMessage = state.systemMessage;
  }
  if (options.iconUrl) {
    spec.iconUrl = options.iconUrl;
  }
  if (state.selectedSkills.length > 0) {
    spec.skills = state.selectedSkills.map(skillEntryOf);
  }
  return spec;
}
