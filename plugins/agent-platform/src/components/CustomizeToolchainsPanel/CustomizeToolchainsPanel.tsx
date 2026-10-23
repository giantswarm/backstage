import { useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  Alert,
  Cell,
  CellText,
  ColumnConfig,
  Flex,
  Table,
  Text,
} from '@backstage/ui';
import {
  CatalogNoMatch,
  EmptyStateCard,
  getRelativeDate,
  INITIAL_ROWS,
  LoadingIndicator,
  matchesQuery,
  PageSection,
  ShowMore,
  StatusDot,
  usePhoneColumns,
  safeWebURL,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  useScopedToolchainInstallations,
  useToolchainDescription,
  useToolchainSources,
  useToolchains,
} from '../../hooks/useToolchainManager';
import { toolchainDetailRouteRef } from '../../routes';
import {
  sharedIdentityReason,
  sharedIdentityTitle,
} from '../../lib/sharedIdentity';
import {
  imageTag,
  sharedToolchainNames,
  TOOLCHAIN_SOURCE_PARAM,
  TOOLCHAINS_BLOCKED,
  TOOLCHAINS_VIA,
  type Toolchain,
  type ToolchainSource,
} from '../../lib/toolchainManager';
import { AddToolchainSourceButton } from '../AddToolchainSourceDialog';
import { SharedIdentityNote } from '../SharedIdentityNote';
import { ToolchainGrantPrompt } from '../ToolchainGrantPrompt';
import { ToolchainReadFailure } from '../ToolchainReadFailure';

export type CustomizeToolchainsPanelProps = {
  search: string;
};

/** The tools the toolchain's newest version declares, read from its image. */
function ToolsCell({
  installation,
  toolchain,
}: {
  installation: string;
  toolchain: Toolchain;
}) {
  const description = useToolchainDescription(installation, toolchain.name, {
    source: toolchain.source,
  });
  const tools = description.data?.toolchain?.tools;
  if (description.isPending) {
    return <CellText title="…" />;
  }
  if (!tools) {
    return <CellText title="—" description={description.error?.message} />;
  }
  return (
    <CellText
      title={tools
        .map(tool => tool.name)
        .sort((a, b) => a.localeCompare(b))
        .join(', ')}
    />
  );
}

/** "0.2.0, 0.1.0": the published versions, newest first. */
export function versionsLabel(toolchain: Toolchain): string {
  return toolchain.versions.map(imageTag).join(', ');
}

/** The toolchains matching a search, by name, source or repository. */
export function searchToolchains(
  toolchains: readonly Toolchain[],
  search: string,
): Toolchain[] {
  return search.trim()
    ? toolchains.filter(toolchain =>
        matchesQuery(
          search,
          `${toolchain.name} ${toolchain.source} ${toolchain.repository}`,
        ),
      )
    : [...toolchains];
}

function ToolchainsTable({
  installation,
  toolchains,
}: {
  installation: string;
  toolchains: Toolchain[];
}) {
  const detailRoute = useRouteRef(toolchainDetailRouteRef);
  // A name two offered sources publish opens the page of the row's source.
  const shared = useMemo(() => sharedToolchainNames(toolchains), [toolchains]);
  const pageOf = (row: Toolchain) => {
    const path = detailRoute?.({ installation, name: row.name });
    return path && shared.has(row.name)
      ? `${path}?${TOOLCHAIN_SOURCE_PARAM}=${encodeURIComponent(row.source)}`
      : path;
  };
  const columns: ColumnConfig<Toolchain & { id: string }>[] = [
    {
      id: 'name',
      label: 'Toolchain',
      isRowHeader: true,
      defaultWidth: '2fr',
      minWidth: 160,
      cell: row => (
        <CellText
          title={row.name}
          href={pageOf(row)}
          description={row.repository}
        />
      ),
    },
    {
      id: 'versions',
      label: 'Versions',
      defaultWidth: '1fr',
      cell: row => (
        <CellText
          title={versionsLabel(row)}
          description={
            row.publishedAt
              ? `Latest ${getRelativeDate(row.publishedAt, new Date())}`
              : undefined
          }
        />
      ),
    },
    {
      id: 'tools',
      label: 'Tools',
      defaultWidth: '3fr',
      cell: row => <ToolsCell installation={installation} toolchain={row} />,
    },
  ];
  const shownColumns = usePhoneColumns(columns, ['name', 'versions']);
  // Only the rows shown read their tools (one `describe_toolchain` each):
  // the rest wait behind Show more.
  return (
    <ShowMore items={toolchains} initial={INITIAL_ROWS} noun="toolchain">
      {page => (
        <Table<Toolchain & { id: string }>
          columnConfig={shownColumns}
          data={page.map(toolchain => ({
            ...toolchain,
            id: `${toolchain.source}/${toolchain.name}`,
          }))}
          pagination={{ type: 'none' }}
        />
      )}
    </ShowMore>
  );
}

/** A source's state: offered, or waiting for an installation owner. */
function SourceStateCell({ source }: { source: ToolchainSource }) {
  return (
    <Cell>
      <StatusDot
        tone={source.offered ? 'success' : 'warning'}
        label={source.offered ? 'Offered' : 'Waiting for approval'}
      />
    </Cell>
  );
}

function SourcesSection({ installation }: { installation: string }) {
  const sources = useToolchainSources(installation);
  const columns: ColumnConfig<ToolchainSource & { id: string }>[] = [
    {
      id: 'repository',
      label: 'Repository',
      isRowHeader: true,
      defaultWidth: '2fr',
      cell: row => (
        <CellText
          title={row.repository}
          href={safeWebURL(row.url)}
          description={row.registry}
        />
      ),
    },
    {
      id: 'state',
      label: 'State',
      defaultWidth: '1fr',
      cell: row => <SourceStateCell source={row} />,
    },
    {
      id: 'addedBy',
      label: 'Added by',
      defaultWidth: '1fr',
      cell: row => (
        <CellText
          title={row.addedBy ?? 'The installation’s configuration'}
          description={row.slackChannel}
        />
      ),
    },
  ];
  const shownColumns = usePhoneColumns(columns, ['repository', 'state']);

  let body;
  if (sources.isPending) {
    body = <LoadingIndicator label="Reading the toolchain sources…" />;
  } else if (sources.error) {
    body = (
      <ToolchainReadFailure
        installation={installation}
        error={sources.error}
        title="The toolchain sources could not be read"
        onRetry={sources.refetch}
      />
    );
  } else if (sources.data.status) {
    body = (
      <ToolchainGrantPrompt installation={installation} answer={sources.data} />
    );
  } else {
    body = (
      <Table<ToolchainSource & { id: string }>
        columnConfig={shownColumns}
        data={sources.data.sources.map(source => ({
          ...source,
          id: source.repository,
        }))}
        pagination={{ type: 'none' }}
      />
    );
  }
  return (
    <PageSection
      title="Sources"
      description="The repositories whose CI checks and publishes the toolchains. An added source offers its toolchains once an owner of the installation approves it."
      action={<AddToolchainSourceButton installation={installation} />}
    >
      {body}
    </PageSection>
  );
}

/** One installation's toolchains and sources. */
function InstallationToolchains({
  installation,
  search,
  showInstallation,
}: {
  installation: string;
  search: string;
  showInstallation: boolean;
}) {
  const { list } = useToolchains(installation);
  const toolchains = useMemo(
    () => searchToolchains(list.data?.toolchains ?? [], search),
    [list.data, search],
  );

  let body;
  if (list.isPending) {
    body = <LoadingIndicator label="Reading the toolchains…" />;
  } else if (list.error) {
    body = (
      <ToolchainReadFailure
        installation={installation}
        error={list.error}
        title={`The toolchains on ${installation} could not be read`}
        onRetry={list.refetch}
      />
    );
  } else if (list.data.status) {
    body = (
      <ToolchainGrantPrompt installation={installation} answer={list.data} />
    );
  } else if (list.data.toolchains.length === 0) {
    body = (
      <EmptyStateCard
        title="No toolchains published yet"
        description="A toolchain is published once its source’s CI checked it. Create one, or add a source that has some."
      />
    );
  } else if (toolchains.length === 0) {
    body = <CatalogNoMatch plural="toolchains" search={search} />;
  } else {
    body = (
      <ToolchainsTable installation={installation} toolchains={toolchains} />
    );
  }

  return (
    <Flex direction="column" gap="5">
      {showInstallation && (
        <Text variant="title-small" as="h2">
          {installation}
        </Text>
      )}
      {(list.data?.unreachable ?? []).map(source => (
        <Alert
          key={source.repository}
          status="warning"
          title={`The toolchains of ${source.repository} could not be read`}
          description={source.reason}
        />
      ))}
      {body}
      <SourcesSection installation={installation} />
    </Flex>
  );
}

/**
 * The Toolchains tab of the shell's Customize screen: per installation in
 * scope with the toolchain-manager, the toolchains its sources publish, each
 * with its versions and its newest version's tools, and the sources with
 * Add source. A toolchain's name opens its page. Read as the person, with
 * their grant of the toolchain-manager's GitHub App, which it asks for first.
 */
export function CustomizeToolchainsPanel({
  search,
}: CustomizeToolchainsPanelProps) {
  const { installations, sharedIdentity, hasToolchains } =
    useScopedToolchainInstallations();

  if (hasToolchains === false) {
    return sharedIdentity.length > 0 ? (
      <EmptyStateCard
        title={sharedIdentityTitle(TOOLCHAINS_BLOCKED, sharedIdentity)}
        description={sharedIdentityReason(TOOLCHAINS_VIA, sharedIdentity)}
      />
    ) : (
      <EmptyStateCard
        title="Toolchains are not available here"
        description="No environment in scope runs the toolchain-manager. Pick another environment, or ask your platform team to turn toolchains on."
      />
    );
  }
  if (hasToolchains === undefined) {
    return <LoadingIndicator label="Reading the toolchains…" />;
  }
  return (
    <Flex direction="column" gap="7">
      <Text variant="body-medium" color="secondary">
        The tools a coding agent’s session mounts beside its harness, each
        version published from a source repository. Pick them when you start a
        session, or keep the agent’s defaults.
      </Text>
      <SharedIdentityNote
        installations={sharedIdentity}
        blocked={TOOLCHAINS_BLOCKED}
        via={TOOLCHAINS_VIA}
      />
      {installations.map(installation => (
        <InstallationToolchains
          key={installation}
          installation={installation}
          search={search}
          showInstallation={installations.length > 1}
        />
      ))}
    </Flex>
  );
}
