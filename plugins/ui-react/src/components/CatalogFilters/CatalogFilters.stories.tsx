import { useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Flex, SearchField, Text } from '@backstage/ui';
import { CatalogFilterBar, CatalogNoMatch } from './CatalogFilterBar';
import type { CatalogFacet } from './catalogFilters';
import { useCatalogFilters } from './useCatalogFilters';
import { componentDocs } from '../../storybook/docs';

type Skill = { name: string; source: string; usage: string };

const SKILLS: Skill[] = [
  { name: 'ticket-triage', source: 'Giant Swarm', usage: 'Used' },
  { name: 'release-notes', source: 'Giant Swarm', usage: 'Used' },
  { name: 'incident-summary', source: 'Your team', usage: 'Unused' },
  { name: 'pr-review', source: 'Your team', usage: 'Used' },
  { name: 'docs-lint', source: 'Community', usage: 'Unused' },
];

const FACETS: CatalogFacet<Skill>[] = [
  { id: 'source', label: 'Source', value: skill => skill.source },
  {
    id: 'usage',
    label: 'Usage',
    value: skill => skill.usage,
    order: ['Used', 'Unused'],
  },
];

/** A searchable catalog list: the search narrows first, the facets after it. */
function SkillCatalog() {
  const [search, setSearch] = useState('');
  const searched = useMemo(
    () =>
      SKILLS.filter(skill => skill.name.includes(search.trim().toLowerCase())),
    [search],
  );
  const filters = useCatalogFilters({
    items: SKILLS,
    searched,
    facets: FACETS,
  });
  return (
    <Flex direction="column" gap="3">
      <Flex align="end" gap="3" style={{ flexWrap: 'wrap' }}>
        <SearchField
          aria-label="Search skills"
          value={search}
          onChange={setSearch}
        />
        <CatalogFilterBar
          dimensions={filters.dimensions}
          onSelect={filters.select}
          onClear={filters.clear}
        />
      </Flex>
      {filters.filtered.length > 0 ? (
        <ul>
          {filters.filtered.map(skill => (
            <li key={skill.name}>
              <Text>{skill.name}</Text>
            </li>
          ))}
        </ul>
      ) : (
        <CatalogNoMatch
          plural="skills"
          search={search}
          isFiltered={filters.isFiltered}
          onClearFilters={filters.clear}
        />
      )}
    </Flex>
  );
}

const meta = {
  title: 'Components/CatalogFilters',
  component: CatalogFilterBar,
  tags: ['autodocs'],
  args: { dimensions: [], onSelect: () => {} },
  render: () => <SkillCatalog />,
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'Facet filters for a catalog list: `useCatalogFilters` derives the options and counts from the items, `CatalogFilterBar` renders a dropdown per facet, and `CatalogNoMatch` says what emptied the list.',
          whenToUse:
            'For a searchable list of things a person browses (agents, skills, models) that has a few categorical facets. Each option counts the items it would leave, given the search and the other facets.',
          migration: 'bui',
        }),
      },
    },
  },
} satisfies Meta<typeof CatalogFilterBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SearchAndFacets: Story = {};
