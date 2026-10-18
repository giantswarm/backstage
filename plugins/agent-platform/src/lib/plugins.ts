import type { AgentPluginEntry, AgentSkillEntry } from './agentManager';
import { type HarnessChoice, runtimeLabel } from './harnesses';
import { canonicalRepoUrl } from './skills';

/**
 * A plugin's format, from where its manifest sits: `agent-plugins` has
 * `plugin.json` at its root and enables only the skills an agent selects;
 * `claude` (Claude Code's `.claude-plugin/plugin.json`) loads whole.
 */
export type PluginFormat = 'agent-plugins' | 'claude';

/** One skill under a plugin's `skills/` directory. */
export interface PluginSkill {
  /** The skill's directory name: what a selection names. */
  name: string;
  description: string;
}

/**
 * A plugin discovered in a configured repository. Mirrors the backend's
 * `DiscoveredPlugin` (gs-backend `/agent-skills`, `plugins`): read at one
 * commit, the pin an agent carries.
 */
export interface DiscoveredPlugin {
  name: string;
  description: string;
  repoUrl: string;
  /** The plugin's root directory within the repo; '' at the repo root. */
  path: string;
  ref: string;
  commit: string;
  format: PluginFormat;
  skills: PluginSkill[];
  manifestReadable?: boolean;
}

function cleanPath(path: string | undefined): string {
  return (path ?? '').replace(/^\.?\/+/, '').replace(/\/+$/, '');
}

/**
 * Where a plugin lives, whatever its pin: the canonical repository and
 * directory of a git plugin, the repository of an OCI one. A discovered plugin
 * and an agent's entry of it share it.
 */
export function pluginPlace(
  plugin:
    | Pick<DiscoveredPlugin, 'repoUrl' | 'path'>
    | Pick<AgentPluginEntry, 'path' | 'git' | 'oci'>,
): string {
  if ('repoUrl' in plugin) {
    return `${canonicalRepoUrl(plugin.repoUrl)}#${cleanPath(plugin.path)}`;
  }
  if (plugin.git) {
    return `${canonicalRepoUrl(plugin.git.url)}#${cleanPath(plugin.path)}`;
  }
  return `oci:${(plugin.oci ?? '').replace(/[@:][^/]*$/, '')}#${cleanPath(
    plugin.path,
  )}`;
}

/** The identity of an entry for comparison: its place, pin and selection. */
export function pluginEntryKey(entry: AgentPluginEntry): string {
  const pin = entry.git ? entry.git.commit : entry.oci;
  return `${pluginPlace(entry)}@${pin}[${(entry.skills ?? []).join(',')}]`;
}

/** The pin an entry carries: a commit or an OCI reference. */
export function pluginPin(entry: AgentPluginEntry): string {
  return entry.git ? entry.git.commit : (entry.oci ?? '');
}

/**
 * A discovered plugin as the contract carries it, pinned to the commit the
 * step showed. A Claude Code plugin takes no selection; an Agent Plugins one
 * starts with `skills` (empty enables none).
 */
export function pluginEntryOf(
  plugin: DiscoveredPlugin,
  skills: string[] = [],
): AgentPluginEntry {
  return {
    ...(plugin.path ? { path: plugin.path } : {}),
    git: { url: plugin.repoUrl, commit: plugin.commit },
    ...(plugin.format === 'agent-plugins' && skills.length > 0
      ? { skills }
      : {}),
  };
}

/** A plugin's name for the person: its directory, else its repository. */
export function pluginLabel(
  entry: Pick<AgentPluginEntry, 'path' | 'git' | 'oci'>,
): string {
  const dir = cleanPath(entry.path).split('/').pop();
  if (dir) {
    return dir;
  }
  const source = entry.git?.url ?? entry.oci ?? '';
  return (
    source
      .replace(/[@:][^/]*$/, '')
      .replace(/\.git$/, '')
      .split('/')
      .pop() || source
  );
}

/**
 * A plugin entry in the review's words: its name, and the skills it enables
 * when it selects any.
 */
export function pluginSummary(entry: AgentPluginEntry): string {
  const skills = entry.skills ?? [];
  return skills.length > 0
    ? `${pluginLabel(entry)} (${skills.join(', ')})`
    : pluginLabel(entry);
}

/** The name a skill entry mounts under, as agent-manager derives it. */
function mountName(skill: AgentSkillEntry): string {
  if (skill.name) {
    return skill.name;
  }
  return 'path' in skill && skill.path
    ? (skill.path.split('/').pop() ?? '')
    : '';
}

/**
 * Why the selection cannot be written: every skill name used twice across the
 * skills and the plugins' selections, which agent-manager and the chart
 * refuse (the runtime mounts every enabled skill by its name in one
 * directory). Empty when there is none.
 */
export function skillNameClashes(
  skills: AgentSkillEntry[],
  plugins: AgentPluginEntry[],
): string[] {
  const owner = new Map<string, string>();
  for (const skill of skills) {
    owner.set(mountName(skill), `the skill ${mountName(skill)}`);
  }
  const problems: string[] = [];
  for (const plugin of plugins) {
    for (const name of plugin.skills ?? []) {
      const previous = owner.get(name);
      if (previous) {
        problems.push(
          `Plugin ${pluginLabel(plugin)} enables the skill ${name}, which ${previous} already provides. Keep one of them.`,
        );
      } else {
        owner.set(name, `plugin ${pluginLabel(plugin)}`);
      }
    }
  }
  return problems;
}

/**
 * Why a Claude Code plugin cannot load on the agent's Harness, or undefined
 * when it can or the runtime is not known. Only the Claude Code runtime passes
 * such a plugin whole to Claude (`--plugin-dir`); the Go ADK and Codex read
 * the Agent Plugins format only and fail the agent at boot. No Harness picked
 * is the platform Harness, the Go ADK.
 */
export function claudePluginProblem(
  harness: HarnessChoice | undefined,
): string | undefined {
  const runtime = harness ? harness.runtime : 'kagent';
  if (runtime !== 'kagent' && runtime !== 'codex') {
    return undefined;
  }
  return `Loads on a Claude Code runtime only; this agent runs on ${runtimeLabel(
    runtime,
  )}.`;
}

/**
 * The plugin entries that cannot load on the agent's Harness, by the formats
 * the catalogue knows: one problem per Claude Code plugin on a runtime that
 * reads Agent Plugins only.
 */
export function pluginRuntimeProblems(
  entries: AgentPluginEntry[],
  catalog: DiscoveredPlugin[],
  harness: HarnessChoice | undefined,
): string[] {
  const reason = claudePluginProblem(harness);
  if (!reason) {
    return [];
  }
  const claude = new Set(
    catalog.filter(p => p.format === 'claude').map(pluginPlace),
  );
  return entries
    .filter(entry => claude.has(pluginPlace(entry)))
    .map(entry => `Plugin ${pluginLabel(entry)}: ${reason}`);
}
