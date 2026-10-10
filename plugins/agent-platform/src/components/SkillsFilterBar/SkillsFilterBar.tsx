import { useMemo } from 'react';
import {
  type CatalogFacet,
  CatalogFilterBar,
  type CatalogFilters,
  useCatalogFilters,
} from '@giantswarm/backstage-plugin-ui-react';
import { skillSource } from '../../lib/customize';
import { canonicalSkillId, type DiscoveredSkill } from '../../lib/skills';

export const SKILL_USAGE_LABELS = {
  used: 'Used by agents',
  unused: 'Not used',
} as const;

/**
 * The skill catalog's facets: the repository a skill comes from, and — once
 * the agents are read — whether any agent mounts it. `usage` is the agents per
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
 * The skill catalog's filter state — Source and Usage — for the Customize
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
 * The skill catalog's filters, in the shell's chip idiom: a Source row once
 * the skills come from more than one repository, a Usage row once some but
 * not all of them are used. Draws nothing when neither would change the list.
 */
export function SkillsFilterBar({ filters }: SkillsFilterBarProps) {
  return (
    <CatalogFilterBar
      dimensions={filters.dimensions}
      onSelect={filters.select}
    />
  );
}
