import { useMemo } from 'react';
import {
  type CatalogFacet,
  CatalogFilterBar,
  type CatalogFilters,
  tagsFacet,
  useCatalogFilters,
} from '@giantswarm/backstage-plugin-ui-react';
import { skillSource } from '../../lib/customize';
import {
  canonicalSkillId,
  type DiscoveredSkill,
  skillTags,
} from '../../lib/skills';

export const SKILL_USAGE_LABELS = {
  used: 'Used by agents',
  unused: 'Not used',
} as const;

/**
 * The skill catalog's facets: the repository a skill comes from, whether any
 * agent mounts it (once the agents are read), and its tags (drawn only once
 * some skill has one). `usage` is the agents per
 * canonical skill id (`agentsBySkill`); without it there is no usage facet,
 * rather than one that calls every skill unused while the agents load.
 */
export function skillFacets(
  usage: Map<string, number> | undefined,
): CatalogFacet<DiscoveredSkill>[] {
  return [
    { id: 'source', label: 'Source', value: skill => skillSource(skill) },
    ...(usage
      ? [
          {
            id: 'usage',
            label: 'Usage',
            value: (skill: DiscoveredSkill) =>
              (usage.get(canonicalSkillId(skill)) ?? 0) > 0 ? 'used' : 'unused',
            optionLabel: (value: string) =>
              SKILL_USAGE_LABELS[value as keyof typeof SKILL_USAGE_LABELS] ??
              value,
            order: ['used', 'unused'],
          },
        ]
      : []),
    tagsFacet(skillTags),
  ];
}

export type UseSkillFiltersOptions = {
  /** The whole catalog, one entry per skill (`uniqueSkills`). */
  skills: readonly DiscoveredSkill[];
  /** The catalog narrowed by the search. */
  searched: readonly DiscoveredSkill[];
  /** Agents per canonical skill id; undefined while the agents load. */
  usage: Map<string, number> | undefined;
};

export type SkillFilters = CatalogFilters<DiscoveredSkill>;

/**
 * The skill catalog's filter state — Source, Usage and Tags — for the Customize
 * Skills tab and the agent wizard's skill step alike (T49, T60). Draw it with
 * {@link SkillsFilterBar}; `filtered` is what the picks leave of `searched`.
 */
export function useSkillFilters({
  skills,
  searched,
  usage,
}: UseSkillFiltersOptions): SkillFilters {
  const facets = useMemo(() => skillFacets(usage), [usage]);
  return useCatalogFilters({ items: skills, searched, facets });
}

export type SkillsFilterBarProps = {
  filters: SkillFilters;
};

/**
 * The skill catalog's filters: a Source dropdown, a Usage dropdown once the
 * agents are read, and a Tags dropdown once a skill has tags — each a
 * multi-select (one repository is a Source dropdown of one option, T64), with
 * "Clear filters" while anything is picked.
 */
export function SkillsFilterBar({ filters }: SkillsFilterBarProps) {
  return (
    <CatalogFilterBar
      dimensions={filters.dimensions}
      onSelect={filters.select}
      onClear={filters.clear}
    />
  );
}
