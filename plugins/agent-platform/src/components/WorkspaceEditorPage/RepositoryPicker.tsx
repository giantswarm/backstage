import { useCallback, useMemo, useState } from 'react';
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
import {
  classifyWorkspaceManagerError,
  type ListRepositoriesInput,
  type ProviderRepository,
} from '../../lib/workspaceManager';

/** `list_repositories`' largest page, for "select all matches". */
export const SELECT_ALL_PAGE_SIZE = 200;

/** Whether the source's filters take a repository (by language and topics). */
export function matchesFilters(
  source: SourceDraft,
  repository: ProviderRepository,
): boolean {
  if (source.languages.length === 0 && source.topics.length === 0) {
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

function toggle(list: string[], value: string, on: boolean): string[] {
  const without = list.filter(item => item !== value);
  return on ? [...without, value] : without;
}

export type RepositoryPickerProps = {
  client: WorkspaceManagerClient;
  organization: string;
  source: SourceDraft;
  onChange: (source: SourceDraft) => void;
};

/**
 * An owner's repositories as the server pages them: search by name, only
 * those the source's filters take, pick by name, exclude one the filters
 * take, "select all n matches", and a "selected only" view of the picks and
 * exclusions. The owner's full listing never reaches the browser: every view
 * is one page, and "select all" reads only the matching pages.
 */
export function RepositoryPicker({
  client,
  organization,
  source,
  onChange,
}: RepositoryPickerProps) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [filteredOnly, setFilteredOnly] = useState(false);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [selectAll, setSelectAll] = useState<{
    busy: boolean;
    error?: string;
  }>({ busy: false });

  const hasFilters = source.languages.length > 0 || source.topics.length > 0;
  const browse = useMemo<ListRepositoriesInput | undefined>(() => {
    const owner = source.owner.trim();
    if (!owner || !source.provider || selectedOnly) {
      return undefined;
    }
    const filtered = filteredOnly && hasFilters;
    return {
      organization,
      provider: source.provider,
      owner,
      page,
      pageSize: EDITOR_PAGE_SIZE,
      ...(search ? { search } : {}),
      ...(filtered && source.languages.length > 0
        ? { languages: source.languages }
        : {}),
      // The listing's topic filter is "any of"; "all of" is narrowed below.
      ...(filtered && source.topics.length > 0
        ? { topics: source.topics }
        : {}),
      ...(filtered && !source.includeArchived ? { archived: false } : {}),
      ...(filtered && !source.includeForks ? { fork: false } : {}),
    };
  }, [
    organization,
    source.provider,
    source.owner,
    source.languages,
    source.topics,
    source.includeArchived,
    source.includeForks,
    page,
    search,
    filteredOnly,
    hasFilters,
    selectedOnly,
  ]);
  const listing = useRepositoriesPage(client, browse);
  const data = listing.data;

  const onSearch = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const pick = useCallback(
    (name: string, on: boolean) =>
      onChange({
        ...source,
        repositories: toggle(source.repositories, name, on),
      }),
    [onChange, source],
  );
  const exclude = useCallback(
    (name: string, on: boolean) =>
      onChange({ ...source, exclude: toggle(source.exclude, name, on) }),
    [onChange, source],
  );

  // Every match of the search and filters, read page by page at the largest
  // page size: only the matches, never the owner's whole listing.
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
        repositories: [...new Set([...source.repositories, ...names])],
        exclude: source.exclude.filter(name => !names.includes(name)),
      });
      setSelectAll({ busy: false });
    } catch (cause) {
      setSelectAll({
        busy: false,
        error: classifyWorkspaceManagerError(cause).message,
      });
    }
  }, [browse, data, client, onChange, source]);

  const pageCount = data
    ? Math.max(1, Math.ceil(data.total / data.pageSize))
    : 1;
  const narrowed = Boolean(search) || (filteredOnly && hasFilters);

  return (
    <Flex direction="column" gap="2" data-testid="repository-picker">
      <Flex gap="3" align="end" style={{ flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 220px' }}>
          <SearchField
            aria-label="Search repositories by name"
            placeholder="Search repositories by name"
            size="small"
            value={search}
            onChange={onSearch}
            isDisabled={selectedOnly}
          />
        </div>
        {hasFilters && (
          <Switch
            isSelected={filteredOnly}
            onChange={on => {
              setFilteredOnly(on);
              setPage(1);
            }}
            isDisabled={selectedOnly}
            label="Matching the filters only"
          />
        )}
        <Switch
          isSelected={selectedOnly}
          onChange={setSelectedOnly}
          label={`Selected only (${
            source.repositories.length + source.exclude.length
          })`}
        />
      </Flex>

      {selectedOnly ? (
        <SelectedOnly source={source} onPick={pick} onExclude={exclude} />
      ) : (
        <>
          {!source.owner.trim() && (
            <Text variant="body-small" color="secondary">
              Enter the owner to browse its repositories.
            </Text>
          )}
          {listing.isLoading && <Skeleton width="100%" height={120} />}
          {listing.error && (
            <Alert
              status="warning"
              title="Could not list the repositories"
              description={classifyWorkspaceManagerError(listing.error).message}
            />
          )}
          {data && (
            <>
              <Flex
                justify="between"
                align="center"
                style={{ flexWrap: 'wrap' }}
              >
                <Text variant="body-small" color="secondary">
                  {narrowed
                    ? `${data.total} of ${data.ownerTotal} repositories match`
                    : `${data.ownerTotal} repositories`}
                </Text>
                {narrowed && data.total > 0 && (
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
                )}
              </Flex>
              {selectAll.error && (
                <Text variant="body-small" color="danger">
                  Could not select all matches: {selectAll.error}
                </Text>
              )}
              <ul
                aria-label={`Repositories of ${source.owner}`}
                style={{ listStyle: 'none', margin: 0, padding: 0 }}
              >
                {data.repositories
                  .filter(
                    repository =>
                      !(filteredOnly && hasFilters) ||
                      matchesFilters(source, repository),
                  )
                  .map(repository => (
                    <RepositoryRow
                      key={repository.name}
                      repository={repository}
                      source={source}
                      onPick={pick}
                      onExclude={exclude}
                    />
                  ))}
              </ul>
              {data.total === 0 && (
                <Text variant="body-small" color="secondary">
                  No repository matches.
                </Text>
              )}
              {pageCount > 1 && (
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
            </>
          )}
        </>
      )}
    </Flex>
  );
}

function RepositoryRow({
  repository,
  source,
  onPick,
  onExclude,
}: {
  repository: ProviderRepository;
  source: SourceDraft;
  onPick: (name: string, on: boolean) => void;
  onExclude: (name: string, on: boolean) => void;
}) {
  const picked = source.repositories.includes(repository.name);
  const excluded = source.exclude.includes(repository.name);
  const byFilter = matchesFilters(source, repository);
  const details = [
    repository.language,
    repository.topics.length > 0 ? repository.topics.join(', ') : undefined,
    repository.archived ? 'archived' : undefined,
    repository.fork ? 'fork' : undefined,
  ].filter(Boolean);
  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '4px 0',
        flexWrap: 'wrap',
      }}
    >
      <Checkbox
        isSelected={picked}
        onChange={on => onPick(repository.name, on)}
      >
        {repository.name}
      </Checkbox>
      <Text variant="body-small" color="secondary">
        {details.join(' · ')}
      </Text>
      {byFilter && !picked && (
        <Flex gap="2" align="center" style={{ marginLeft: 'auto' }}>
          <Text variant="body-small" color={excluded ? 'secondary' : 'success'}>
            {excluded ? 'Excluded' : 'Matches the filters'}
          </Text>
          <Button
            variant="tertiary"
            size="small"
            aria-label={`${excluded ? 'Include' : 'Exclude'} ${repository.name}`}
            onPress={() => onExclude(repository.name, !excluded)}
          >
            {excluded ? 'Include' : 'Exclude'}
          </Button>
        </Flex>
      )}
    </li>
  );
}

/** The picks by name and the exclusions, side by side, from the draft alone. */
function SelectedOnly({
  source,
  onPick,
  onExclude,
}: {
  source: SourceDraft;
  onPick: (name: string, on: boolean) => void;
  onExclude: (name: string, on: boolean) => void;
}) {
  if (source.repositories.length === 0 && source.exclude.length === 0) {
    return (
      <Text variant="body-small" color="secondary">
        No repository picked by name or excluded.
      </Text>
    );
  }
  return (
    <ul
      aria-label="Selected repositories"
      style={{ listStyle: 'none', margin: 0, padding: 0 }}
    >
      {source.repositories.map(name => (
        <li key={`pick-${name}`} style={{ padding: '4px 0' }}>
          <Checkbox isSelected onChange={on => onPick(name, on)}>
            {name} <Text color="secondary">· by name</Text>
          </Checkbox>
        </li>
      ))}
      {source.exclude.map(name => (
        <li
          key={`exclude-${name}`}
          style={{ display: 'flex', gap: 12, padding: '4px 0' }}
        >
          <Text variant="body-small">
            {name} <Text color="secondary">· excluded</Text>
          </Text>
          <Button
            variant="tertiary"
            size="small"
            aria-label={`Include ${name}`}
            onPress={() => onExclude(name, false)}
          >
            Include
          </Button>
        </li>
      ))}
    </ul>
  );
}
