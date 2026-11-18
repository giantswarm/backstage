import { matchesQuery } from '@giantswarm/backstage-plugin-ui-react';

import type { AgentPluginEntry } from './agentManager';
import { canonicalRepoUrl, type DiscoveredSkill } from './skills';

/**
 * The two plugin formats an agent loads. An Agent Plugins package
 * (`plugin.json` at its root) materialises only the skills selected by name,
 * so it needs a selection; a Claude Code plugin (`.claude-plugin/plugin.json`)
 * loads whole — commands, hooks, subagents and skills — with none, and only on
 * the `claude` Harness. A directory with both manifests is an Agent Plugins
 * package on every Harness, `claude` included: kagent reads the root manifest
 * first (giantswarm/giantswarm#38695).
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
  /**
   * An Agent Plugins package's skills, by the name a selection carries. Empty
   * for a Claude Code plugin: discovery lists no skills for one, and
   * {@link pluginSkillsOf} reads them from the skill catalogue.
   */
  skills: PluginSkill[];
}

/** A skill of a plugin: its directory under `skills/` and its description. */
export type PluginSkill = { name: string; description: string };

/**
 * A plugin the person picked: the discovered plugin (at the commit an edited
 * agent is pinned to) and, for an Agent Plugins package, the skills it
 * enables — never empty for one, always empty for a Claude Code plugin.
 */
export type SelectedPlugin = {
  plugin: DiscoveredPlugin;
  skills: string[];
};

/**
 * A plugin's or skill's directory as one form: no leading `./` or `/`, no
 * trailing `/`, so a prefix match and a plugin's identity read paths alike.
 */
export function normalizePluginPath(path: string): string {
  return path.replace(/^\.?\/+/, '').replace(/\/+$/, '');
}

/**
 * The skill catalogue by canonical repository, so each plugin reads only its
 * own repository's skills ({@link pluginSkillsOf}).
 */
export function skillsByRepo<T extends Pick<DiscoveredSkill, 'repoUrl'>>(
  catalog: T[],
): Map<string, T[]> {
  const byRepo = new Map<string, T[]>();
  for (const skill of catalog) {
    const repo = canonicalRepoUrl(skill.repoUrl);
    const list = byRepo.get(repo);
    if (list) {
      list.push(skill);
    } else {
      byRepo.set(repo, [skill]);
    }
  }
  return byRepo;
}

/**
 * The skills a plugin brings. An Agent Plugins package's are the ones
 * discovery listed for it. A Claude Code plugin's are not listed (it loads
 * whole, so nothing selects them), but each is a `SKILL.md` directly under its
 * `skills/` directory, which the skill catalogue lists like any other skill:
 * they are read from there, to be shown, never selected.
 *
 * @param repoSkills the catalogue's skills of the plugin's repository
 *   ({@link skillsByRepo})
 */
export function pluginSkillsOf(
  plugin: DiscoveredPlugin,
  repoSkills: Pick<DiscoveredSkill, 'path' | 'description'>[],
): PluginSkill[] {
  if (plugin.format === 'agent-plugins' || plugin.skills.length > 0) {
    return plugin.skills;
  }
  const root = normalizePluginPath(plugin.path);
  const prefix = root ? `${root}/skills/` : 'skills/';
  const skills = new Map<string, PluginSkill>();
  for (const skill of repoSkills) {
    const path = normalizePluginPath(skill.path);
    const name = path.startsWith(prefix) ? path.slice(prefix.length) : '';
    if (name && !name.includes('/') && !skills.has(name)) {
      skills.set(name, { name, description: skill.description ?? '' });
    }
  }
  return [...skills.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Every skill name an Agent Plugins package lists; none for Claude Code. */
export function allSkillNamesOf(plugin: DiscoveredPlugin): string[] {
  return plugin.format === 'agent-plugins'
    ? plugin.skills.map(skill => skill.name)
    : [];
}

/**
 * What of an Agent Plugins package the agent gets, as its row shows it:
 *
 * - `none`: not picked.
 * - `some`: some of its skills, by name.
 * - `all`: every skill it lists at the commit shown. Stored as the list of
 *   names, since agent-manager and kagent take no "whole package" marker
 *   (giantswarm/giantswarm#39190): a skill added to the package later is not
 *   picked up until it is picked.
 * - `whole`: an edited agent's entry without a selection, pinned to an older
 *   commit than the one discovered: picked while the directory was a Claude
 *   Code plugin at that commit, where it loads whole. The portal never writes
 *   a selection-less entry for an Agent Plugins package.
 * - `empty`: an entry without a selection at the discovered commit itself,
 *   where the directory is an Agent Plugins package: it loads nothing (an
 *   entry written elsewhere, through the API say).
 */
export type PluginSelection = 'none' | 'some' | 'all' | 'whole' | 'empty';

/** A package's selection as its row shows it. */
export type PluginPickState = {
  selection: PluginSelection;
  /** The picked names the package lists at the discovered commit. */
  listed: string[];
  /**
   * The picked names it no longer lists there: skills of the pinned commit
   * the row has no card for, named so the selection is not hidden.
   */
  stale: string[];
};

export function pluginSelectionOf(
  plugin: DiscoveredPlugin,
  pick: SelectedPlugin | undefined,
): PluginPickState {
  if (!pick) {
    return { selection: 'none', listed: [], stale: [] };
  }
  if (pick.skills.length === 0) {
    return {
      selection: pick.plugin.commit === plugin.commit ? 'empty' : 'whole',
      listed: [],
      stale: [],
    };
  }
  const names = new Set(plugin.skills.map(skill => skill.name));
  const listed = pick.skills.filter(name => names.has(name));
  const stale = pick.skills.filter(name => !names.has(name));
  return {
    selection: names.size > 0 && listed.length === names.size ? 'all' : 'some',
    listed,
    stale,
  };
}

/** A plugin row as a search leaves it: the plugin and the skills it shows. */
export type PluginMatch<P> = {
  plugin: P;
  skills: PluginSkill[];
  /** Whether a search found any of its skills, which opens the row. */
  hasSkillMatch: boolean;
};

/**
 * The plugins a search keeps, with the skills each shows: the same
 * token-boundary search as the skill catalogue (`matchesQuery`). A plugin
 * whose name, directory or repository matches keeps every skill; any other
 * keeps the skills whose name or description match, and is dropped without
 * one. A blank query keeps everything, and opens nothing.
 */
export function searchPlugins<
  P extends Pick<DiscoveredPlugin, 'name' | 'path' | 'repoUrl'>,
>(
  plugins: { plugin: P; skills: PluginSkill[] }[],
  search: string,
): PluginMatch<P>[] {
  const query = search.trim();
  if (!query) {
    return plugins.map(row => ({ ...row, hasSkillMatch: false }));
  }
  const matches: PluginMatch<P>[] = [];
  for (const { plugin, skills } of plugins) {
    const found = skills.filter(skill =>
      matchesQuery(query, `${skill.name} ${skill.description}`),
    );
    if (
      matchesQuery(query, `${plugin.name} ${plugin.path} ${plugin.repoUrl}`)
    ) {
      matches.push({ plugin, skills, hasSkillMatch: found.length > 0 });
    } else if (found.length > 0) {
      matches.push({ plugin, skills: found, hasSkillMatch: true });
    }
  }
  return matches;
}

/** Stable identity of a plugin: its repository and directory. */
export function pluginId(plugin: Pick<DiscoveredPlugin, 'repoUrl' | 'path'>) {
  return `${canonicalRepoUrl(plugin.repoUrl)}#${normalizePluginPath(
    plugin.path,
  )}`;
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
