/**
 * Plugins in a skill repository, found in the same read as its skills.
 *
 * An agent loads a plugin as a chart `plugins[]` entry pinned to a commit
 * (`{ path, git: { url, commit }, skills }`). Two formats exist, told apart by
 * where the manifest sits, as kagent's materialisation and agent-manager tell
 * them apart:
 *
 * - **Agent Plugins**: `plugin.json` at the plugin root. Only the skills the
 *   entry selects are enabled, by their directory name under `skills/`.
 * - **Claude Code**: `.claude-plugin/plugin.json` and no root `plugin.json`.
 *   The plugin loads whole (commands, hooks, subagents and skills), so it
 *   takes no selection.
 */

/** A plugin's manifest location decides its format. */
export type PluginFormat = 'agent-plugins' | 'claude';

/** One skill a plugin carries: `skills/<name>/SKILL.md` below its root. */
export interface PluginSkill {
  /** The skill's directory name: what a selection names. */
  name: string;
  /** Frontmatter `description` of its `SKILL.md` (empty when unread). */
  description: string;
}

/** A plugin discovered in a repository, read at the listing's commit. */
export interface DiscoveredPlugin {
  /** Manifest `name`, falling back to the directory (or repo) basename. */
  name: string;
  /** Manifest `description` (empty string when absent). */
  description: string;
  /** Canonical repository URL the plugin lives in. */
  repoUrl: string;
  /** The plugin's root directory within the repo; '' at the repo root. */
  path: string;
  /** Git ref (branch) the plugin was discovered on. */
  ref: string;
  /** The full commit id the listing was read at: the pin an agent carries. */
  commit: string;
  format: PluginFormat;
  /** The skills under `skills/`, by directory name. */
  skills: PluginSkill[];
  /** Whether the portal read the manifest at `commit`. */
  manifestReadable: boolean;
}

const AGENT_PLUGINS_MANIFEST = 'plugin.json';
const CLAUDE_MANIFEST = '.claude-plugin/plugin.json';

/** A plugin root found in a file listing, with the manifest to read. */
export interface PluginRoot {
  path: string;
  format: PluginFormat;
  /** Repository-relative path of the manifest. */
  manifest: string;
}

function join(dir: string, file: string): string {
  return dir ? `${dir}/${file}` : file;
}

/**
 * The plugin roots among a repository's file paths: every directory holding a
 * `plugin.json` (Agent Plugins) or a `.claude-plugin/plugin.json` without one
 * (Claude Code). A `plugin.json` inside a `.claude-plugin` directory is that
 * directory's parent's Claude manifest, never a root of its own.
 */
export function pluginRootsFromPaths(paths: string[]): PluginRoot[] {
  const files = new Set(paths);
  const roots = new Map<string, PluginRoot>();
  for (const file of paths) {
    if (file === CLAUDE_MANIFEST || file.endsWith(`/${CLAUDE_MANIFEST}`)) {
      const dir = file.slice(0, -CLAUDE_MANIFEST.length).replace(/\/$/, '');
      if (!files.has(join(dir, AGENT_PLUGINS_MANIFEST)) && !roots.has(dir)) {
        roots.set(dir, { path: dir, format: 'claude', manifest: file });
      }
    } else if (
      file === AGENT_PLUGINS_MANIFEST ||
      file.endsWith(`/${AGENT_PLUGINS_MANIFEST}`)
    ) {
      const dir = file
        .slice(0, -AGENT_PLUGINS_MANIFEST.length)
        .replace(/\/$/, '');
      if (dir === '.claude-plugin' || dir.endsWith('/.claude-plugin')) {
        continue;
      }
      roots.set(dir, { path: dir, format: 'agent-plugins', manifest: file });
    }
  }
  return [...roots.values()].sort((a, b) => a.path.localeCompare(b.path));
}

/** A manifest's `name` and `description`; empty when it is not JSON. */
export function parsePluginManifest(raw: string): {
  name?: string;
  description?: string;
} {
  try {
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, '')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const { name, description } = parsed as Record<string, unknown>;
    return {
      name: typeof name === 'string' ? name : undefined,
      description: typeof description === 'string' ? description : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Builds the discovered plugins of one listing: each root with its manifest
 * (by repository-relative path, absent when unread) and the skills directly
 * under its `skills/` directory, taken from the skills the same listing found.
 */
export function discoveredPlugins(options: {
  roots: PluginRoot[];
  manifests: Map<string, string>;
  skills: Array<{ path: string; description: string }>;
  repoUrl: string;
  repoName: string;
  ref: string;
  commit: string;
}): DiscoveredPlugin[] {
  const { roots, manifests, skills, repoUrl, repoName, ref, commit } = options;
  return roots.map(root => {
    const raw = manifests.get(root.manifest);
    const manifest = raw === undefined ? {} : parsePluginManifest(raw);
    const skillsDir = join(root.path, 'skills');
    const pluginSkills = skills
      .filter(skill => {
        const rest = skill.path.startsWith(`${skillsDir}/`)
          ? skill.path.slice(skillsDir.length + 1)
          : '';
        return rest !== '' && !rest.includes('/');
      })
      .map(skill => ({
        name: skill.path.slice(skillsDir.length + 1),
        description: skill.description,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      name: manifest.name?.trim() || root.path.split('/').pop() || repoName,
      description: manifest.description?.trim() ?? '',
      repoUrl,
      path: root.path,
      ref,
      commit,
      format: root.format,
      skills: pluginSkills,
      manifestReadable: raw !== undefined,
    };
  });
}
