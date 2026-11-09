import type { DiscoveredSkill } from './discoverAgentSkills';

/**
 * The two plugin formats an agent loads (kagent's `agentplugins` package):
 *
 * - `agent-plugins`: an Agent Plugins package, `plugin.json` at its root and
 *   its skills in `skills/<name>/SKILL.md`. Only the skills an agent selects
 *   by name are materialised, so a selection is required.
 * - `claude-code`: a Claude Code plugin, `.claude-plugin/plugin.json`. It is
 *   kept whole and passed to Claude Code as `--plugin-dir` (its commands,
 *   hooks, subagents and skills), so nothing is selected.
 *
 * A directory with both manifests is an Agent Plugins package, as kagent reads
 * the root `plugin.json` first.
 */
export type PluginFormat = 'agent-plugins' | 'claude-code';

/** A skill of an Agent Plugins package, as an agent selects it. */
export interface DiscoveredPluginSkill {
  /** The skill's directory under `skills/`: the name a selection carries. */
  name: string;
  /** The SKILL.md frontmatter `description` (may be empty). */
  description: string;
}

/**
 * A plugin discovered in a skill repository, at the commit the repository's
 * skills were read at. An agent loads it as a chart `plugins[]` entry pinned
 * to that commit (`{ path, git: { url, commit }, skills }`).
 */
export interface DiscoveredPlugin {
  /** The plugin directory's name (the repository's at its root). */
  name: string;
  repoUrl: string;
  /** The plugin root within the repository; '' at the repository root. */
  path: string;
  ref: string;
  commit: string;
  format: PluginFormat;
  /** The selectable skills, by name; always empty for `claude-code`. */
  skills: DiscoveredPluginSkill[];
}

const AGENT_PLUGINS_MANIFEST = 'plugin.json';
const CLAUDE_MANIFEST = '.claude-plugin/plugin.json';

/** The directory a manifest at `path` makes a plugin root, if it is one. */
function manifestRoot(path: string, manifest: string): string | undefined {
  if (path === manifest) {
    return '';
  }
  return path.endsWith(`/${manifest}`)
    ? path.slice(0, -(manifest.length + 1))
    : undefined;
}

/**
 * The plugins of a repository from its file paths (a git tree or a checkout
 * walk, repository-relative) and the skills discovery found in it — no read
 * beyond the listing the skills came from. An Agent Plugins package's skills
 * are the discovered skills directly under its `skills/` directory.
 */
export function pluginsOf(
  filePaths: string[],
  skills: Pick<DiscoveredSkill, 'path' | 'description'>[],
  at: { repoUrl: string; ref: string; commit: string; repoName: string },
): DiscoveredPlugin[] {
  const formats = new Map<string, PluginFormat>();
  for (const path of filePaths) {
    const claudeRoot = manifestRoot(path, CLAUDE_MANIFEST);
    if (claudeRoot !== undefined && !formats.has(claudeRoot)) {
      formats.set(claudeRoot, 'claude-code');
    }
    const root = manifestRoot(path, AGENT_PLUGINS_MANIFEST);
    // `.claude-plugin/plugin.json` also ends in `/plugin.json`: its root is
    // the Claude plugin's, never a `.claude-plugin` package.
    if (root !== undefined && !root.endsWith('.claude-plugin')) {
      formats.set(root, 'agent-plugins');
    }
  }
  return [...formats]
    .map(([path, format]): DiscoveredPlugin => {
      const prefix = path ? `${path}/skills/` : 'skills/';
      return {
        name: path.split('/').pop() || at.repoName,
        repoUrl: at.repoUrl,
        path,
        ref: at.ref,
        commit: at.commit,
        format,
        skills:
          format === 'agent-plugins'
            ? skills
                .filter(
                  skill =>
                    skill.path.startsWith(prefix) &&
                    !skill.path.slice(prefix.length).includes('/'),
                )
                .map(skill => ({
                  name: skill.path.slice(prefix.length),
                  description: skill.description,
                }))
                .sort((a, b) => a.name.localeCompare(b.name))
            : [],
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}
