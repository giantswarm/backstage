import {
  Alert,
  Button,
  Flex,
  SearchField,
  Skeleton,
  Text,
} from '@backstage/ui';

import { EDITOR_PAGE_SIZE } from '../../hooks/useWorkspaceEditor';
import {
  classifyWorkspaceManagerError,
  type PreviewRepository,
  type WorkspacePreview,
} from '../../lib/workspaceManager';

/** A size in KiB as people read it. */
export function formatKiB(kib: number): string {
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let value = kib;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toISOString().slice(0, 10);
}

export type WorkspacePreviewPanelProps = {
  preview: WorkspacePreview | undefined;
  error: unknown;
  isLoading: boolean;
  /** The draft changed since the preview shown. */
  isStale: boolean;
  /** No source is complete enough to preview yet. */
  hasSources: boolean;
  page: number;
  onPage: (page: number) => void;
  search: string;
  onSearch: (search: string) => void;
  /**
   * Excludes a repository a filter took, on the source that took it;
   * absent for one picked by name.
   */
  onExclude: (repository: PreviewRepository) => void;
  canExclude: (repository: PreviewRepository) => boolean;
};

/**
 * Why a repository is in, in words: picked by name, or the language and
 * topics it matches (`why` holds `name`, `language Go`, `topic mcp`).
 */
export function whyText(why: string[]): string {
  const matches = why.filter(reason => reason !== 'name');
  return [
    why.includes('name') ? 'Picked by name' : undefined,
    matches.length > 0 ? `Matches ${matches.join(', ')}` : undefined,
  ]
    .filter(Boolean)
    .join('; ');
}

/**
 * What the draft selects now, as `preview_workspace` resolves it: the count,
 * the estimated size, the repositories (paged and searchable) with language,
 * topics, last push and why each is in, and what was left out. Nothing here
 * says whether the person can read a repository: that is checked when a
 * Session starts.
 */
export function WorkspacePreviewPanel({
  preview,
  error,
  isLoading,
  isStale,
  hasSources,
  page,
  onPage,
  search,
  onSearch,
  onExclude,
  canExclude,
}: WorkspacePreviewPanelProps) {
  if (!hasSources) {
    return (
      <Text variant="body-small" color="secondary">
        Once a source has an owner and picks repositories by name, language or
        topic, the repositories the workspace gets are listed here.
      </Text>
    );
  }
  const pages = preview
    ? Math.max(
        1,
        Math.ceil(preview.matching / (preview.pageSize || EDITOR_PAGE_SIZE)),
      )
    : 1;
  const left = preview
    ? [
        preview.excluded > 0 ? `${preview.excluded} excluded` : undefined,
        preview.skippedArchived > 0
          ? `${preview.skippedArchived} archived left out`
          : undefined,
        preview.skippedForks > 0
          ? `${preview.skippedForks} forks left out`
          : undefined,
      ].filter(Boolean)
    : [];
  return (
    <Flex
      direction="column"
      gap="2"
      data-testid="workspace-preview"
      aria-busy={isLoading || isStale}
    >
      {Boolean(error) && (
        <Alert
          status="warning"
          title="Could not preview the selection"
          description={`${
            classifyWorkspaceManagerError(error).message
          } You can keep editing; the workspace is checked again on save.`}
        />
      )}
      {!preview && isLoading && <Skeleton width="100%" height={160} />}
      {preview && (
        <>
          <Text variant="body-medium" weight="bold" data-testid="preview-total">
            {preview.total === 1
              ? '1 repository'
              : `${preview.total} repositories`}
            , about {formatKiB(preview.providerSizeKiB)}
          </Text>
          <Text variant="body-small" color="secondary">
            Estimated disk space: {preview.estimatedVolumeSize}, with room to
            grow
            {left.length > 0 ? ` · ${left.join(' · ')}` : ''}
          </Text>
          <SearchField
            aria-label="Search the preview"
            placeholder="Find a repository in this list"
            size="small"
            value={search}
            onChange={onSearch}
          />
          <ul
            aria-label="Selected repositories preview"
            style={{ listStyle: 'none', margin: 0, padding: 0 }}
          >
            {preview.repositories.map(repository => (
              <li
                key={`${repository.provider}/${repository.repository}`}
                style={{
                  padding: '6px 0',
                  borderBottom: '1px solid var(--bui-border, #ddd)',
                }}
              >
                <Flex justify="between" align="start" gap="2">
                  <Flex direction="column" gap="1">
                    <Text variant="body-small" weight="bold">
                      {repository.repository}
                    </Text>
                    <Text variant="body-small" color="secondary">
                      {[
                        repository.language
                          ? `Language ${repository.language}`
                          : undefined,
                        repository.topics.length > 0
                          ? `Topics ${repository.topics.join(', ')}`
                          : undefined,
                        `pushed ${formatDate(repository.lastPush)}`,
                        formatKiB(repository.sizeKiB),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                    <Text variant="body-small" color="secondary">
                      {whyText(repository.why)}
                    </Text>
                  </Flex>
                  {canExclude(repository) && (
                    <Button
                      variant="tertiary"
                      size="small"
                      aria-label={`Exclude ${repository.repository}`}
                      onPress={() => onExclude(repository)}
                    >
                      Exclude
                    </Button>
                  )}
                </Flex>
              </li>
            ))}
          </ul>
          {preview.repositories.length === 0 && (
            <Text variant="body-small" color="secondary">
              {search
                ? 'No selected repository matches the search.'
                : 'The sources select no repository.'}
            </Text>
          )}
          {pages > 1 && (
            <Flex gap="2" align="center">
              <Button
                variant="tertiary"
                size="small"
                isDisabled={page <= 1}
                onPress={() => onPage(page - 1)}
              >
                Previous
              </Button>
              <Text variant="body-small">
                Page {page} of {pages}
              </Text>
              <Button
                variant="tertiary"
                size="small"
                isDisabled={page >= pages}
                onPress={() => onPage(page + 1)}
              >
                Next
              </Button>
            </Flex>
          )}
        </>
      )}
    </Flex>
  );
}
