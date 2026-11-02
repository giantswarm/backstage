import { useMemo, useState, type ReactNode } from 'react';
import {
  Button,
  Checkbox,
  DialogTrigger,
  Flex,
  Popover,
  SearchField,
  Text,
  ToggleButton,
  ToggleButtonGroup,
} from '@backstage/ui';

import type { SourceDraft } from '../../lib/workspaceDraft';
import type { FacetCount, RepositoriesPage } from '../../lib/workspaceManager';
import { repositoryNoun } from './repositoryNoun';

/** How many of the most used topics show before the topic search narrows them. */
const MOST_USED_SHOWN = 6;

/** How many languages show before the language search narrows them. */
const LANGUAGES_SHOWN = 8;

/**
 * The owner's languages or topics with their counts, most used first: the
 * manager's counts, else the names alone (a manager before facet counts).
 */
function facets(
  counts: FacetCount[] | undefined,
  names: string[] | undefined,
): FacetCount[] {
  if (counts && counts.length > 0) {
    return [...counts].sort((a, b) => b.count - a.count);
  }
  return (names ?? []).map(name => ({ name, count: Number.NaN }));
}

function narrow(list: FacetCount[], query: string): FacetCount[] {
  const q = query.trim().toLowerCase();
  return q ? list.filter(f => f.name.toLowerCase().includes(q)) : list;
}

function toggle(list: string[], value: string, on: boolean): string[] {
  const without = list.filter(item => item !== value);
  return on ? [...without, value] : without;
}

/** A ticked facet with its count, when the manager reports one. */
function FacetOption({
  facet,
  isSelected,
  onChange,
}: {
  facet: FacetCount;
  isSelected: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <Flex justify="between" align="center" gap="3">
      <Checkbox isSelected={isSelected} onChange={onChange}>
        {facet.name}
      </Checkbox>
      {!Number.isNaN(facet.count) && (
        <Text variant="body-small" color="secondary">
          {facet.count}
        </Text>
      )}
    </Flex>
  );
}

/** A filter's dropdown: its name and current value on the button. */
function FilterDropdown({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <DialogTrigger>
      <Button
        variant="secondary"
        size="small"
        aria-label={`${label}: ${value}`}
      >
        <Text variant="body-small" color="secondary" as="span">
          {label}
        </Text>{' '}
        {value}
      </Button>
      <Popover placement="bottom start">
        <div style={{ width: 280, maxHeight: 420, overflowY: 'auto' }}>
          <Flex direction="column" gap="2">
            {children}
          </Flex>
        </div>
      </Popover>
    </DialogTrigger>
  );
}

export type SourceFilterBoxProps = {
  source: SourceDraft;
  onChange: (source: SourceDraft) => void;
  /** The owner's facets: one unfiltered page of its repositories. */
  facetsPage: RepositoriesPage | undefined;
  /** How many of the owner's repositories the filters take, when known. */
  matchTotal: number | undefined;
  providerKind: string | undefined;
};

/**
 * Select by filter: a source's language, topic and including filters, each
 * a dropdown with the owner's counts, and how many repositories they take.
 * Every repository a filter takes now or later belongs to the workspace.
 */
export function SourceFilterBox({
  source,
  onChange,
  facetsPage,
  matchTotal,
  providerKind,
}: SourceFilterBoxProps) {
  const [languageSearch, setLanguageSearch] = useState('');
  const [topicSearch, setTopicSearch] = useState('');
  const languages = useMemo(
    () => facets(facetsPage?.languageCounts, facetsPage?.languages),
    [facetsPage?.languageCounts, facetsPage?.languages],
  );
  const topics = useMemo(
    () => facets(facetsPage?.topicCounts, facetsPage?.topics),
    [facetsPage?.topicCounts, facetsPage?.topics],
  );
  const countOf = (list: FacetCount[], name: string) =>
    list.find(f => f.name === name)?.count ?? Number.NaN;

  const hasFilters = source.languages.length > 0 || source.topics.length > 0;
  const including = [
    source.includeArchived ? 'Archived' : undefined,
    source.includeForks ? 'Forks' : undefined,
  ].filter(Boolean);
  const ownerTotal = facetsPage?.ownerTotal;
  const withTopics = facetsPage?.withTopics;
  const topicsCoverage =
    withTopics !== undefined &&
    ownerTotal !== undefined &&
    withTopics < ownerTotal
      ? `Only ${withTopics} of ${ownerTotal} ${repositoryNoun(
          providerKind,
          ownerTotal,
        )} have topics.`
      : undefined;
  const matchesNoun = repositoryNoun(providerKind, matchTotal ?? 0);

  const languageOptions = narrow(languages, languageSearch);
  const shownLanguages = [
    ...source.languages.map(name => ({
      name,
      count: countOf(languages, name),
    })),
    ...languageOptions
      .filter(f => !source.languages.includes(f.name))
      .slice(0, LANGUAGES_SHOWN),
  ];
  const topicOptions = narrow(topics, topicSearch).filter(
    f => !source.topics.includes(f.name),
  );
  const matchLabel = source.topicMatch === 'all' ? 'all of' : 'any of';

  return (
    <section
      aria-label="Select by filter"
      style={{
        border: '1px solid var(--bui-border-1)',
        borderRadius: 8,
        padding: 12,
      }}
    >
      <Flex direction="column" gap="2">
        <Flex justify="between" align="center" gap="2">
          <Text variant="body-small" weight="bold">
            Select by filter
          </Text>
          {hasFilters && matchTotal !== undefined && (
            <Text
              variant="body-small"
              color="secondary"
              data-testid="filter-match-total"
            >
              {matchTotal} {matchesNoun} match
            </Text>
          )}
        </Flex>
        <Flex gap="2" align="center" style={{ flexWrap: 'wrap' }}>
          <FilterDropdown
            label="Language"
            value={source.languages.join(', ') || 'any'}
          >
            <SearchField
              aria-label="Search languages"
              placeholder="Search languages"
              size="small"
              value={languageSearch}
              onChange={setLanguageSearch}
            />
            {shownLanguages.length === 0 && (
              <Text variant="body-small" color="secondary">
                No languages reported.
              </Text>
            )}
            {shownLanguages.map(facet => (
              <FacetOption
                key={facet.name}
                facet={facet}
                isSelected={source.languages.includes(facet.name)}
                onChange={on =>
                  onChange({
                    ...source,
                    languages: toggle(source.languages, facet.name, on),
                  })
                }
              />
            ))}
            <Text variant="body-small" color="secondary">
              Matches any of the ticked languages
            </Text>
            <div>
              <Button
                variant="tertiary"
                size="small"
                isDisabled={source.languages.length === 0}
                onPress={() => onChange({ ...source, languages: [] })}
              >
                Clear
              </Button>
            </div>
          </FilterDropdown>

          <FilterDropdown
            label="Topics"
            value={
              source.topics.length > 0
                ? `${matchLabel} ${source.topics.join(', ')}`
                : 'any'
            }
          >
            <Flex gap="2" align="center">
              <Text variant="body-small">Match</Text>
              <ToggleButtonGroup
                aria-label="Topics match"
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={[source.topicMatch]}
                onSelectionChange={keys => {
                  const next = [...keys][0];
                  if (next === 'any' || next === 'all') {
                    onChange({ ...source, topicMatch: next });
                  }
                }}
              >
                <ToggleButton id="any" size="small">
                  Any of
                </ToggleButton>
                <ToggleButton id="all" size="small">
                  All of
                </ToggleButton>
              </ToggleButtonGroup>
            </Flex>
            <SearchField
              aria-label="Search topics"
              placeholder="Search topics"
              size="small"
              value={topicSearch}
              onChange={setTopicSearch}
            />
            {source.topics.length > 0 && (
              <>
                <Text variant="body-small" color="secondary">
                  Selected
                </Text>
                {source.topics.map(name => (
                  <FacetOption
                    key={name}
                    facet={{ name, count: countOf(topics, name) }}
                    isSelected
                    onChange={on =>
                      onChange({
                        ...source,
                        topics: toggle(source.topics, name, on),
                      })
                    }
                  />
                ))}
              </>
            )}
            <Text variant="body-small" color="secondary">
              {topicSearch ? 'Matching topics' : 'Most used'}
            </Text>
            {topicOptions.length === 0 && (
              <Text variant="body-small" color="secondary">
                No topics reported.
              </Text>
            )}
            {topicOptions.slice(0, MOST_USED_SHOWN).map(facet => (
              <FacetOption
                key={facet.name}
                facet={facet}
                isSelected={false}
                onChange={on =>
                  onChange({
                    ...source,
                    topics: toggle(source.topics, facet.name, on),
                  })
                }
              />
            ))}
            <Text variant="body-small" color="secondary">
              {source.topics.length === 0
                ? 'No topic picked: every topic counts'
                : topicsCoverage}
            </Text>
            <div>
              <Button
                variant="tertiary"
                size="small"
                isDisabled={source.topics.length === 0}
                onPress={() => onChange({ ...source, topics: [] })}
              >
                Clear
              </Button>
            </div>
          </FilterDropdown>

          <FilterDropdown label="Including" value={including.join(', ') || '—'}>
            <Checkbox
              isSelected={source.includeArchived}
              onChange={on => onChange({ ...source, includeArchived: on })}
            >
              Archived {repositoryNoun(providerKind, 2)}
            </Checkbox>
            <Checkbox
              isSelected={source.includeForks}
              onChange={on => onChange({ ...source, includeForks: on })}
            >
              Forks
            </Checkbox>
          </FilterDropdown>

          <Button
            variant="tertiary"
            size="small"
            isDisabled={!hasFilters && including.length === 0}
            onPress={() =>
              onChange({
                ...source,
                languages: [],
                topics: [],
                topicMatch: 'any',
                includeArchived: false,
                includeForks: false,
              })
            }
          >
            Clear all
          </Button>
        </Flex>
        {source.topics.length > 0 && topicsCoverage && (
          <Text variant="body-small" color="secondary">
            {topicsCoverage} To catch the rest, combine with a language or pick{' '}
            {repositoryNoun(providerKind, 2)} by name.
          </Text>
        )}
        {hasFilters && (
          <Text variant="body-small" color="secondary">
            New {repositoryNoun(providerKind, 2)} that match these filters are
            added automatically.
          </Text>
        )}
      </Flex>
    </section>
  );
}
