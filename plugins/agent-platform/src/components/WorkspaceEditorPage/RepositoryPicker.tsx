import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Flex,
  SearchField,
  Skeleton,
  Switch,
  Text,
} from '@backstage/ui';

import type { WorkspaceManagerClient } from '../../apis/WorkspaceManagerClient';
import {
  EDITOR_PAGE_SIZE,
  useRepositoriesPage,
} from '../../hooks/useWorkspaceEditor';
import type { SourceDraft } from '../../lib/workspaceDraft';
import { shortAge } from '../../lib/shortAge';
import {
  classifyWorkspaceManagerError,
  type ListRepositoriesInput,
  type ProviderRepository,
} from '../../lib/workspaceManager';
import {
  hasFilters,
  includesName,
  keptPicks,
  sameName,
  uniqueNames,
} from '../../lib/workspaceSelection';
import { repositoryNoun } from './repositoryNoun';
import {
  countSummary,
  type FilterMatches,
  type SourceCount,
} from './sourceCount';

/** `list_repositories`' largest page, for "select all matches". */
export const SELECT_ALL_PAGE_SIZE = 200;

/** Whether the source's filters take a repository (by language and topics). */
export function matchesFilters(
  source: SourceDraft,
  repository: ProviderRepository,
): boolean {
  if (!hasFilters(source)) {
    return false;
  }
  if (repository.archived && !source.includeArchived) {
    return false;
  }
  if (repository.fork && !source.includeForks) {
    return false;
  }
  const language =
    source.languages.length === 0 ||
    (repository.language !== undefined &&
      source.languages.some(
        l => l.toLowerCase() === repository.language!.toLowerCase(),
      ));
  const topics = source.topics.map(t => t.toLowerCase());
  const repoTopics = repository.topics.map(t => t.toLowerCase());
  let topic = true;
  if (topics.length > 0) {
    topic =
      source.topicMatch === 'all'
        ? topics.every(t => repoTopics.includes(t))
        : topics.some(t => repoTopics.includes(t));
  }
  return language && topic;
}

/** The listing's filter for what the source's filters take. */
export function filterInput(
  source: SourceDraft,
): Partial<ListRepositoriesInput> {
  return {
    ...(source.languages.length > 0 ? { languages: source.languages } : {}),
    // The listing's topic filter is "any of"; "all of" is narrowed by row.
    ...(source.topics.length > 0 ? { topics: source.topics } : {}),
    ...(source.includeArchived ? {} : { archived: false }),
    ...(source.includeForks ? {} : { fork: false }),
  };
}

function withMembership(
  source: SourceDraft,
  name: string,
  on: boolean,
  byFilter: boolean,
): SourceDraft {
  let repositories = withoutName(source.repositories, name);
  if (on) {
    repositories =
      byFilter || includesName(source.repositories, name)
        ? source.repositories
        : [...source.repositories, name];
  }
  return {
    ...source,
    exclude:
      !on && byFilter
        ? [...withoutName(source.exclude, name), name]
        : withoutName(source.exclude, name),
    repositories,
  };
}

/** How a repository is in the workspace, or why not. */
type Membership = 'by filter' | 'by name' | 'excluded' | undefined;

/** An exclusion wins over a pick by name too, as the manager selects. */
function membership(
  source: SourceDraft,
  repository: ProviderRepository,
): Membership {
  const picked = includesName(source.repositories, repository.name);
  if (picked || matchesFilters(source, repository)) {
    if (includesName(source.exclude, repository.name)) {
      return 'excluded';
    }
    return picked ? 'by name' : 'by filter';
  }
  return undefined;
}

/** `names` without `name`, compared without case. */
function withoutName(names: string[], name: string): string[] {
  return names.filter(n => !sameName(n, name));
}

export type RepositoryPickerProps = {
  client: WorkspaceManagerClient;
  organization: string;
  source: SourceDraft;
  onChange: (source: SourceDraft) => void;
  /** The filtered listing's total, for its pages, when known. */
  matchTotal: number | undefined;
  /** How many of the owner's repositories the filters take, for the count. */
  filterMatches: FilterMatches;
  /** How many repositories the source selects, exclusions applied. */
  count: SourceCount;
  providerKind: string | undefined;
  /** Opens on "selected only", the picks and exclusions, instead of the listing. */
  startsOnPicks?: boolean;
};

/**
 * An owner's repositories in one table, as the server pages them: a tick
 * picks one by name, unticking a filter match excludes it. With filters the
 * matches come first, then the rest of the owner's repositories. Search by
 * name, "select all n matches" of a search, and "selected only", the picks
 * and exclusions alone. The owner's full listing never reaches the browser:
 * every view is one page, and "select all" reads only the matching pages.
 */
export function RepositoryPicker({
  client,
  organization,
  source,
  onChange,
  matchTotal,
  filterMatches,
  count,
  providerKind,
  startsOnPicks = false,
}: RepositoryPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  // The page, back to the first whenever the filters change.
  const filterKey = JSON.stringify(filterInput(source));
  const [paging, setPaging] = useState({ filterKey, page: 1 });
  const page = paging.filterKey === filterKey ? paging.page : 1;
  const setPage = useCallback(
    (next: number) => setPaging({ filterKey, page: next }),
    [filterKey],
  );
  const [selectedOnly, setSelectedOnly] = useState(startsOnPicks);
  const [selectAll, setSelectAll] = useState<{
    busy: boolean;
    error?: string;
  }>({ busy: false });

  const owner = source.owner.trim();
  const filtered = hasFilters(source);
  // Matches first: the filters' pages, then the owner's listing without them.
  const matchesFirst = filtered && !search;
  const matchPages = matchesFirst
    ? Math.ceil((matchTotal ?? 0) / EDITOR_PAGE_SIZE)
    : 0;
  const inMatches = matchesFirst && page <= matchPages;

  const browse = useMemo<ListRepositoriesInput | undefined>(() => {
    if (!owner || !source.provider || selectedOnly) {
      return undefined;
    }
    return {
      organization,
      provider: source.provider,
      owner,
      page: inMatches ? page : page - matchPages,
      pageSize: EDITOR_PAGE_SIZE,
      ...(search ? { search } : {}),
      ...(inMatches ? filterInput(source) : {}),
    };
  }, [
    organization,
    source,
    owner,
    page,
    search,
    selectedOnly,
    inMatches,
    matchPages,
  ]);
  const listing = useRepositoriesPage(client, browse);
  const data = listing.data;
  const rows = useMemo(
    () =>
      (data?.repositories ?? []).filter(repository =>
        // The rest of the owner's listing leaves out what the matches showed.
        matchesFirst && !inMatches ? !matchesFilters(source, repository) : true,
      ),
    [data, matchesFirst, inMatches, source],
  );

  const onSearch = useCallback(
    (value: string) => {
      setSearch(value);
      setPage(1);
    },
    [setPage],
  );

  // A tick takes a repository in: out of the exclusions, and picked by name
  // unless a filter takes it. Unticking a filter match excludes it; unticking
  // a pick drops the pick.
  const onTick = useCallback(
    (repository: ProviderRepository, on: boolean) => {
      onChange(
        withMembership(
          source,
          repository.name,
          on,
          matchesFilters(source, repository),
        ),
      );
    },
    [onChange, source],
  );

  // Every match of the search, read page by page at the largest page size:
  // only the matches, never the owner's whole listing.
  const selectAllMatches = useCallback(async () => {
    if (!browse || !data) {
      return;
    }
    setSelectAll({ busy: true });
    try {
      const names: string[] = [];
      const pages = Math.ceil(data.total / SELECT_ALL_PAGE_SIZE);
      for (let next = 1; next <= pages; next++) {
        const result = await client.listRepositories({
          ...browse,
          page: next,
          pageSize: SELECT_ALL_PAGE_SIZE,
        });
        names.push(...result.repositories.map(repository => repository.name));
      }
      onChange({
        ...source,
        repositories: uniqueNames([...source.repositories, ...names]),
        exclude: source.exclude.filter(name => !includesName(names, name)),
      });
      setSelectAll({ busy: false });
    } catch (cause) {
      setSelectAll({
        busy: false,
        error: classifyWorkspaceManagerError(cause).message,
      });
    }
  }, [browse, data, client, onChange, source]);

  const ownerTotal = data?.ownerTotal;
  let pageCount = data
    ? Math.max(1, Math.ceil(data.total / EDITOR_PAGE_SIZE))
    : 1;
  if (matchesFirst && ownerTotal !== undefined) {
    pageCount = matchPages + Math.ceil(ownerTotal / EDITOR_PAGE_SIZE);
  }
  const byName = source.repositories.length;
  // The rows "selected only" lists: an excluded pick shows once.
  const listed = keptPicks(source).length + source.exclude.length;

  return (
    <Flex
      ref={pickerRef}
      direction="column"
      gap="2"
      data-testid="repository-picker"
    >
      <Flex
        justify="between"
        align="center"
        gap="3"
        style={{ flexWrap: 'wrap' }}
      >
        <Flex direction="column" gap="1">
          <Text variant="body-small" weight="bold">
            {repositoryNoun(providerKind, 2).replace(/^./, c =>
              c.toUpperCase(),
            )}{' '}
            of {owner || 'the owner'}
            {ownerTotal !== undefined && (
              <Text variant="body-small" color="secondary" as="span">
                {' '}
                ({ownerTotal.toLocaleString('en')})
              </Text>
            )}
          </Text>
          <Text variant="body-small" color="secondary">
            Tick to pick one by name; untick a filter match to exclude it.
          </Text>
        </Flex>
        <Switch
          isSelected={selectedOnly}
          onChange={setSelectedOnly}
          label={`Show selected only (${listed})`}
        />
      </Flex>

      {!selectedOnly && (
        <SearchField
          aria-label={`Search ${repositoryNoun(providerKind, 2)} by name`}
          placeholder={`Search ${repositoryNoun(providerKind, 2)} by name`}
          size="small"
          value={search}
          onChange={onSearch}
        />
      )}

      {selectedOnly ? (
        <SelectedOnly
          source={source}
          onChange={onChange}
          onEmptied={() =>
            pickerRef.current
              ?.querySelector<HTMLElement>('[role="switch"]')
              ?.focus()
          }
        />
      ) : (
        <>
          {!owner && (
            <Text variant="body-small" color="secondary">
              Choose the owner to browse its {repositoryNoun(providerKind, 2)}.
            </Text>
          )}
          {listing.isLoading && <Skeleton width="100%" height={120} />}
          {listing.error && (
            <Alert
              status="warning"
              title={`Could not list the ${repositoryNoun(providerKind, 2)}`}
              description={classifyWorkspaceManagerError(listing.error).message}
            />
          )}
          {data && (
            <>
              {search && data.total > 0 && (
                <Flex gap="2" align="center" style={{ flexWrap: 'wrap' }}>
                  <Text variant="body-small" color="secondary">
                    {data.total} of {data.ownerTotal} match the search
                  </Text>
                  <Button
                    variant="secondary"
                    size="small"
                    isDisabled={selectAll.busy}
                    onPress={selectAllMatches}
                  >
                    {selectAll.busy
                      ? 'Selecting…'
                      : `Select all ${data.total} matches`}
                  </Button>
                </Flex>
              )}
              {selectAll.error && (
                <Text variant="body-small" color="danger">
                  Could not select all matches: {selectAll.error}
                </Text>
              )}
              <table
                aria-label={`Repositories of ${owner}`}
                style={{ width: '100%', borderCollapse: 'collapse' }}
              >
                {rows.length > 0 && <RepositoryColumns />}
                <tbody>
                  {rows.map(repository => (
                    <RepositoryRow
                      key={repository.name}
                      repository={repository}
                      state={membership(source, repository)}
                      onTick={on => onTick(repository, on)}
                    />
                  ))}
                </tbody>
              </table>
              {data.total === 0 && (
                <Text variant="body-small" color="secondary">
                  No {repositoryNoun(providerKind, 1)} matches.
                </Text>
              )}
            </>
          )}
        </>
      )}

      <Text variant="body-small" data-testid="repository-summary">
        {countSummary({
          byFilter: filterMatches,
          byName,
          count,
          providerKind,
        })}
      </Text>
      {!selectedOnly && data && (
        <Flex gap="2" align="center">
          <Button
            variant="tertiary"
            size="small"
            isDisabled={page <= 1}
            onPress={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <Text variant="body-small">
            Page {page} of {pageCount}
            {matchesFirst ? ', matches first' : ''}
          </Text>
          <Button
            variant="tertiary"
            size="small"
            isDisabled={page >= pageCount}
            onPress={() => setPage(page + 1)}
          >
            Next
          </Button>
        </Flex>
      )}
    </Flex>
  );
}

const CELL = { padding: '4px 8px 4px 0', verticalAlign: 'middle' } as const;

/** The listing's column names, which a screen reader reads with each cell. */
function RepositoryColumns() {
  const columns = [
    'Repository',
    'Language',
    'Topics',
    'Last push',
    'Selection',
  ];
  return (
    <thead>
      <tr style={{ borderBottom: '1px solid var(--bui-border-1)' }}>
        {columns.map((column, index) => (
          <th
            key={column}
            scope="col"
            style={{
              ...CELL,
              textAlign: index === columns.length - 1 ? 'right' : 'left',
            }}
          >
            <Text variant="body-small" color="secondary" weight="bold">
              {column}
            </Text>
          </th>
        ))}
      </tr>
    </thead>
  );
}

function RepositoryRow({
  repository,
  state,
  onTick,
}: {
  repository: ProviderRepository;
  state: Membership;
  onTick: (on: boolean) => void;
}) {
  const ticked = state === 'by filter' || state === 'by name';
  const details = [
    repository.archived ? 'archived' : undefined,
    repository.fork ? 'fork' : undefined,
  ].filter(Boolean);
  return (
    <tr style={{ borderBottom: '1px solid var(--bui-border-1)' }}>
      <td style={CELL}>
        <Checkbox isSelected={ticked} onChange={onTick}>
          {repository.name}
        </Checkbox>
      </td>
      <td style={CELL}>
        <Text variant="body-small" color="secondary">
          {repository.language ?? '—'}
        </Text>
      </td>
      <td style={CELL}>
        <Text variant="body-small" color="secondary">
          {[repository.topics.join(', ') || '—', ...details].join(' · ')}
        </Text>
      </td>
      <td style={CELL}>
        <Text variant="body-small" color="secondary">
          {shortAge(repository.lastPush)}
        </Text>
      </td>
      <td style={{ ...CELL, textAlign: 'right' }}>
        {state && (
          <Text
            variant="body-small"
            color={state === 'excluded' ? 'secondary' : 'primary'}
            weight={state === 'excluded' ? undefined : 'bold'}
          >
            {state}
          </Text>
        )}
      </td>
    </tr>
  );
}

/**
 * The picks by name and the exclusions, from the draft alone. A pick that is
 * excluded shows once, as excluded: the exclusion wins.
 */
function SelectedOnly({
  source,
  onChange,
  onEmptied,
}: {
  source: SourceDraft;
  onChange: (source: SourceDraft) => void;
  onEmptied: () => void;
}) {
  const tableRef = useRef<HTMLTableElement>(null);
  const focusAt = useRef<{ name: string; index: number }>();
  const names = uniqueNames([...keptPicks(source), ...source.exclude]);
  useEffect(() => {
    const pending = focusAt.current;
    if (!pending) {
      return;
    }
    focusAt.current = undefined;
    const checkboxes = tableRef.current?.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    const remaining = names.findIndex(name => sameName(name, pending.name));
    const target =
      checkboxes?.[
        remaining >= 0
          ? remaining
          : Math.min(pending.index, checkboxes.length - 1)
      ];
    if (target) {
      target.focus();
    } else {
      onEmptied();
    }
  }, [names, onEmptied]);
  if (source.repositories.length === 0 && source.exclude.length === 0) {
    return (
      <Text variant="body-small" color="secondary">
        Nothing picked by name or excluded.
      </Text>
    );
  }
  return (
    <table
      ref={tableRef}
      aria-label="Selected repositories"
      style={{ width: '100%', borderCollapse: 'collapse' }}
    >
      <thead>
        <tr>
          {['Repository', 'Selection'].map(column => (
            <th
              key={column}
              scope="col"
              style={{
                ...CELL,
                textAlign: column === 'Selection' ? 'right' : 'left',
              }}
            >
              <Text variant="body-small" color="secondary" weight="bold">
                {column}
              </Text>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {names.map((name, index) => {
          const excluded = includesName(source.exclude, name);
          return (
            <tr key={name.toLowerCase()}>
              <td style={CELL}>
                <Checkbox
                  isSelected={!excluded}
                  aria-label={excluded ? `Include ${name}` : name}
                  onChange={on => {
                    focusAt.current = { name, index };
                    // Without repository metadata, an exclusion prevents a filter
                    // from retaining a removed pick; inclusion pins the name.
                    onChange(
                      withMembership(
                        source,
                        name,
                        on,
                        !on && hasFilters(source),
                      ),
                    );
                  }}
                >
                  {name}
                </Checkbox>
              </td>
              <td style={{ ...CELL, textAlign: 'right' }}>
                <Text
                  variant="body-small"
                  color={excluded ? 'secondary' : 'primary'}
                  weight={excluded ? undefined : 'bold'}
                >
                  {excluded ? 'excluded' : 'by name'}
                </Text>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
