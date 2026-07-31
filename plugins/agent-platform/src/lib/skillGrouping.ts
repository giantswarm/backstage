import { DiscoveredSkill, repoSlug } from './skills';

// Directory segments that are structural containers, not meaningful group
// names, and are skipped when deriving a skill's subgroup — e.g. the `skills`
// folder each plugin uses under the `claude-code` repo's convention
// (`plugins/<plugin>/skills/<skill>`). Extend this set if another configured
// repo introduces a different structural-container name.
const NOISE_SEGMENTS = new Set(['skills']);

/**
 * The subgroup label for a skill's path, e.g.
 * `plugins/gs-base/skills/registries` -> `gs-base`. Returns undefined when the
 * skill sits at (or, once noise segments are stripped, effectively at) the
 * repo root — it has no meaningful subgroup and should render flush under its
 * repo rather than under a synthetic "General" heading.
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
  return segments.length > 0 ? segments[segments.length - 1] : undefined;
}

export interface SkillSubgroup {
  key: string;
  skills: DiscoveredSkill[];
}

export interface RepoSkillGroup {
  repoUrl: string;
  repoSlug: string;
  /** Skills with no meaningful subgroup — render flush, no subheading. */
  ungrouped: DiscoveredSkill[];
  /** Subgroups sorted alphabetically by key. */
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

    const subgroups = Array.from(subgroupMap.entries())
      .map(([key, groupSkills]) => ({ key, skills: groupSkills }))
      .sort((a, b) => a.key.localeCompare(b.key));

    return {
      repoUrl,
      repoSlug: repoSlug(repoUrl),
      ungrouped,
      subgroups,
    };
  });
}
