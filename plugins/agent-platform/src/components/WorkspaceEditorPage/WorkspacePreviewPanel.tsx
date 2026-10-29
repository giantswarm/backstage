import { Alert, Button, Flex, Skeleton, Text } from '@backstage/ui';

import { EDITOR_PAGE_SIZE } from '../../hooks/useWorkspaceEditor';
import { shortAge } from '../../lib/shortAge';
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

/** A Kubernetes quantity as people read it: `8Gi` is "8 GiB". */
export function formatQuantity(quantity: string): string {
  return quantity.replace(/^([\d.]+)\s*([KMGTP]i)$/, '$1 $2B');
}

/**
 * Why a repository is in, in words: picked by name, the topics it matches,
 * or the language filter (`why` holds `name`, `language Go`, `topic mcp`).
 */
export function whyText(why: string[]): string {
  if (why.includes('name')) {
    return 'picked by name';
  }
  const topics = why
    .filter(reason => reason.startsWith('topic '))
    .map(reason => reason.slice('topic '.length));
  if (topics.length > 0) {
    return `matches topic ${topics.join(', ')}`;
  }
  return why.length > 0 ? 'matches the language filter' : '';
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
  /** How many provider instances the sources read. */
  providerCount: number;
  /** The disk: "about 8 GiB, automatic", "7 GiB, at least 20 GiB". */
  disk: string | undefined;
};

/**
 * What the draft selects now, as `preview_workspace` resolves it: the count
 * and size, the disk, how many the exclusions left out, and each repository
 * with its language, last push, size and why it is in. Nothing here says
 * whether the person can read a repository: that is checked when a session
 * starts.
 */
export function WorkspacePreviewPanel({
  preview,
  error,
  isLoading,
  isStale,
  hasSources,
  page,
  onPage,
  providerCount,
  disk,
}: WorkspacePreviewPanelProps) {
  const note = (
    <Text variant="body-small" color="secondary">
      Nothing changes until you save. Access is checked for each person when
      they start a session.
    </Text>
  );
  if (!hasSources) {
    return (
      <Flex direction="column" gap="2" data-testid="workspace-preview">
        <Text variant="body-small" color="secondary">
          The preview lists what the workspace selects once a source has an
          owner and repositories.
        </Text>
      </Flex>
    );
  }
  const pages = preview
    ? Math.max(
        1,
        Math.ceil(preview.matching / (preview.pageSize || EDITOR_PAGE_SIZE)),
      )
    : 1;
  // What the exclusions left out, as the manager counts it: an exclusion
  // that matches nothing selected leaves nothing out.
  const left = [
    preview && preview.excluded > 0
      ? `${preview.excluded} excluded`
      : undefined,
    preview && preview.skippedArchived > 0
      ? `${preview.skippedArchived} archived left out`
      : undefined,
    preview && preview.skippedForks > 0
      ? `${preview.skippedForks} forks left out`
      : undefined,
  ].filter(Boolean);
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
            {providerCount > 1 ? ` on ${providerCount} providers` : ''}, about{' '}
            {formatKiB(preview.providerSizeKiB)}
          </Text>
          <Text variant="body-small" color="secondary">
            {[
              `Disk space: ${disk ?? `about ${formatQuantity(preview.estimatedVolumeSize)}, automatic`}`,
              ...left,
            ].join(' · ')}
          </Text>
          <ul
            aria-label="Selected repositories preview"
            style={{ listStyle: 'none', margin: 0, padding: 0 }}
          >
            {preview.repositories.map(repository => (
              <PreviewRow
                key={`${repository.provider}/${repository.repository}`}
                repository={repository}
              />
            ))}
          </ul>
          {preview.repositories.length === 0 && (
            <Text variant="body-small" color="secondary">
              The sources select no repository.
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
      {note}
    </Flex>
  );
}

function PreviewRow({ repository }: { repository: PreviewRepository }) {
  const age = shortAge(repository.lastPush);
  return (
    <li
      style={{
        padding: '6px 0',
        borderBottom: '1px solid var(--bui-border-1)',
      }}
    >
      <Flex direction="column" gap="1">
        <Text variant="body-small" weight="bold">
          {repository.repository}
        </Text>
        <Text variant="body-small" color="secondary">
          {[
            repository.language,
            age === 'now' ? 'pushed just now' : age && `pushed ${age} ago`,
            formatKiB(repository.sizeKiB),
            whyText(repository.why),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </Flex>
    </li>
  );
}
