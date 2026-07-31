import { DiscoveredSkill, repoSlug } from './skills';

// Directory segments that are structural containers, not meaningful group
// names, and are skipped when deriving a skill's subgroup — e.g. the `skills`
// folder each plugin uses under the `claude-code` repo's convention
// (`plugins/<plugin>/skills/<skill>`). Extend this set if another configured
// repo introduces a different structural-container name.
const NOISE_SEGMENTS = new Set(['skills']);

/**
 * The subgroup *key* for a skill's path: the skill's parent directory with any
 * trailing container segments removed, e.g.
 * `plugins/gs-base/skills/registries` -> `plugins/gs-base`. Returns undefined
 * when the skill sits at (or, once container segments are stripped, effectively
 * at) the repo root — it has no meaningful subgroup and should render flush
 * under its repo rather than under a synthetic "General" heading.
 *
 * The key is the whole remaining path, not just its last segment, so skills
 * that share a directory *name* under different parents (`plugins/a/skills/x`
 * vs `docs/a/skills/y`) stay in separate groups instead of silently merging.
 * `subgroupLabel` renders only the last segment, which is the part that carries
 * meaning for the reader.
 *
 * Known limitation: only the skill's immediate parent is treated as structural.
 * A skill nested one level deeper than the repo's convention
 * (`plugins/gs-base/skills/registries/aws`) therefore groups under
 * `…/skills/registries` and appears as a sibling of the plugin groups rather
 * than inside `gs-base`. Neither configured repository nests that way today;
 * revisit (by joining segments, or extending `NOISE_SEGMENTS`) if one starts to.
 */
export function skillSubgroup(path: string): string | undefined {
  const segments = path.split('/').filter(Boolean);
  segments.pop(); // the skill's own directory
  while (
    segments.length > 0 &&
    NOISE_SEGMENTS.has(segments[segments.length - 1])
  ) {
    segments.pop();
  }
  return segments.length > 0 ? segments.join('/') : undefined;
}

/** The human-facing part of a subgroup key (its last path segment). */
export function subgroupLabel(key: string): string {
  return key.split('/').pop() ?? key;
}

export interface SkillSubgroup {
  /** Unique key — the full remaining parent path (see `skillSubgroup`). */
  key: string;
  /** What the reader sees: the last segment of `key`. */
  label: string;
  skills: DiscoveredSkill[];
}

export interface RepoSkillGroup {
  repoUrl: string;
  repoSlug: string;
  /** Skills with no meaningful subgroup — render flush, no subheading. */
  ungrouped: DiscoveredSkill[];
  /** Subgroups sorted alphabetically by the label the reader sees. */
  subgroups: SkillSubgroup[];
}

/**
 * Groups skills by repository (preserving first-seen order — the configured
 * repository order), then by subgroup within each repo.
 */
export function groupSkillsByRepo(skills: DiscoveredSkill[]): RepoSkillGroup[] {
  const byRepo = new Map<string, DiscoveredSkill[]>();
  for (const skill of skills) {
    const existing = byRepo.get(skill.repoUrl);
    if (existing) {
      existing.push(skill);
    } else {
      byRepo.set(skill.repoUrl, [skill]);
    }
  }

  return Array.from(byRepo.entries()).map(([repoUrl, repoSkills]) => {
    const ungrouped: DiscoveredSkill[] = [];
    const subgroupMap = new Map<string, DiscoveredSkill[]>();

    for (const skill of repoSkills) {
      const key = skillSubgroup(skill.path);
      if (key === undefined) {
        ungrouped.push(skill);
        continue;
      }
      const existing = subgroupMap.get(key);
      if (existing) {
        existing.push(skill);
      } else {
        subgroupMap.set(key, [skill]);
      }
    }

    // Sorted by label (what the reader scans), falling back to the key so two
    // subgroups sharing a label keep a stable order.
    const subgroups = Array.from(subgroupMap.entries())
      .map(([key, groupSkills]) => ({
        key,
        label: subgroupLabel(key),
        skills: groupSkills,
      }))
      .sort(
        (a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key),
      );

    return {
      repoUrl,
      repoSlug: repoSlug(repoUrl),
      ungrouped,
      subgroups,
    };
  });
}
