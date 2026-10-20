import type { AgentPluginEntry } from './agentManager';
import { canonicalRepoUrl } from './skills';

/**
 * The two plugin formats an agent loads. An Agent Plugins package
 * (`plugin.json` at its root) materialises only the skills selected by name,
 * so it needs a selection; a Claude Code plugin (`.claude-plugin/plugin.json`)
 * loads whole — commands, hooks, subagents and skills — with none.
 */
export type PluginFormat = 'agent-plugins' | 'claude-code';

/**
 * A plugin discovered in a configured skill repository, at the commit its
 * skills were read at. Mirrors the backend's `DiscoveredPlugin` (gs-backend
 * `/agent-skills`).
 */
export interface DiscoveredPlugin {
  /** The plugin directory's name (the repository's at its root). */
  name: string;
  repoUrl: string;
  /** The plugin root within the repository; '' at the repository root. */
  path: string;
  ref: string;
  /** The commit the agent is pinned to, as the skills step shows it. */
  commit: string;
  format: PluginFormat;
  /** An Agent Plugins package's skills, by the name a selection carries. */
  skills: { name: string; description: string }[];
}

/**
 * A plugin the person picked: the discovered plugin (at the commit an edited
 * agent is pinned to) and, for an Agent Plugins package, the skills it
 * enables — never empty for one, always empty for a Claude Code plugin.
 */
export type SelectedPlugin = {
  plugin: DiscoveredPlugin;
  skills: string[];
};

/** Stable identity of a plugin: its repository and directory. */
export function pluginId(plugin: Pick<DiscoveredPlugin, 'repoUrl' | 'path'>) {
  const path = plugin.path.replace(/^\.?\/+/, '').replace(/\/+$/, '');
  return `${canonicalRepoUrl(plugin.repoUrl)}#${path}`;
}

/** The identity of a plugin entry's place, for a git entry; else undefined. */
export function pluginEntryPlace(entry: AgentPluginEntry): string | undefined {
  return entry.git
    ? pluginId({ repoUrl: entry.git.url, path: entry.path ?? '' })
    : undefined;
}

/** A plugin entry's identity for comparison: its source, place and selection. */
export function pluginEntryKey(entry: AgentPluginEntry): string {
  const source = entry.git
    ? `git:${entry.git.url}#${entry.path ?? ''}@${entry.git.commit ?? ''}`
    : `oci:${entry.oci ?? ''}#${entry.path ?? ''}`;
  return `${source}[${(entry.skills ?? []).join(',')}]`;
}

/**
 * A picked plugin as the create contract carries it: the repository and the
 * commit the skills step showed, and the selection when there is one.
 */
export function pluginEntryOf(selected: SelectedPlugin): AgentPluginEntry {
  const { plugin, skills } = selected;
  return {
    ...(plugin.path ? { path: plugin.path } : {}),
    git: { url: plugin.repoUrl, commit: plugin.commit },
    ...(skills.length > 0 ? { skills } : {}),
  };
}

/** How a plugin entry is named in a list: its directory, else its source. */
export function pluginEntryName(entry: AgentPluginEntry): string {
  const dir = (entry.path ?? '').split('/').filter(Boolean).pop();
  if (dir) {
    return dir;
  }
  const source = entry.git?.url ?? entry.oci ?? '';
  const last = source.split('/').filter(Boolean).pop() ?? source;
  return last.replace(/[@:].*$/, '').replace(/\.git$/, '') || source;
}

/**
 * The skill names used more than once across the standalone skills and the
 * plugins' selections. agent-manager refuses such an agent, since each name is
 * one directory of the agent's skills.
 */
export function repeatedSkillNames(
  skillNames: string[],
  plugins: { skills?: string[] }[],
): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const name of [
    ...skillNames,
    ...plugins.flatMap(plugin => plugin.skills ?? []),
  ]) {
    if (seen.has(name)) {
      repeated.add(name);
    }
    seen.add(name);
  }
  return [...repeated];
}

/**
 * A plugin entry in a plain summary: its name and what of it loads — the
 * enabled skills, or the whole plugin when it carries no selection.
 */
export function pluginSummary(entry: AgentPluginEntry): string {
  const skills = entry.skills ?? [];
  return `${pluginEntryName(entry)} (${
    skills.length > 0 ? skills.join(', ') : 'whole plugin'
  })`;
}
