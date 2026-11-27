import { useNow, DateComponent } from '@giantswarm/backstage-plugin-ui-react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  CellText,
  ColumnConfig,
  Flex,
  Select,
  Table,
  Text,
} from '@backstage/ui';
import {
  type BreadcrumbItem,
  EmptyStateCard,
  ExternalLink,
  type Fact,
  FactList,
  FileView,
  PageSection,
  ShellPage,
  ShellPageFactsSkeleton,
  ShellPageTitleSkeleton,
  safeWebURL,
} from '@giantswarm/backstage-plugin-ui-react';

import { useCustomizePaths } from '../../hooks/useCustomizePaths';
import {
  useToolchainDescription,
  useToolchainManagerAvailability,
  useToolchainSources,
} from '../../hooks/useToolchainManager';
import {
  imageTag,
  TOOLCHAIN_SOURCE_PARAM,
  type ToolchainDescription,
  type ToolchainTool,
} from '../../lib/toolchainManager';
import { toolchainsRouteRef } from '../../routes';
import { ToolchainGrantPrompt } from '../ToolchainGrantPrompt';
import { ToolchainReadFailure } from '../ToolchainReadFailure';

/** The address's version: `?version=0.1.0`; absent, the newest. */
export const VERSION_SEARCH_PARAM = 'version';

export type ToolchainDetailPageProps = {
  installation: string;
  name: string;
};

function useToolchainFrame(name: string) {
  const { customize } = useCustomizePaths();
  const toolchainsRoute = useRouteRef(toolchainsRouteRef);
  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Customize', href: customize },
    { label: 'Toolchains', href: toolchainsRoute?.() },
    { label: name },
  ];
  return { breadcrumbs, documentTitle: [name, 'Toolchains'] };
}

/** `name: version` pairs, sorted, as one fact. */
function pinsFact(
  label: string,
  pins: Record<string, string> | undefined,
): Fact[] {
  const entries = Object.entries(pins ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return entries.length > 0
    ? [
        {
          label,
          value: entries
            .map(([pin, version]) => `${pin} ${version}`)
            .join(', '),
        },
      ]
    : [];
}

function ToolsTable({ tools }: { tools: ToolchainTool[] }) {
  const columns: ColumnConfig<ToolchainTool & { id: string }>[] = [
    {
      id: 'name',
      label: 'Tool',
      isRowHeader: true,
      defaultWidth: '1fr',
      cell: row => (
        <CellText
          title={row.name}
          description={`bin/${row.name} on the session’s PATH`}
        />
      ),
    },
    {
      id: 'version',
      label: 'Version command',
      defaultWidth: '2fr',
      cell: row => <CellText title={row.version} />,
    },
  ];
  return (
    <Table<ToolchainTool & { id: string }>
      columnConfig={columns}
      data={[...tools]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(tool => ({ ...tool, id: tool.name }))}
      pagination={{ type: 'none' }}
    />
  );
}

function Described({
  toolchain,
  sourceURL,
}: {
  toolchain: ToolchainDescription;
  /** The source's own address (`list_sources`); plain text without one. */
  sourceURL: string | undefined;
}) {
  const facts: Fact[] = [
    { label: 'Image', value: toolchain.image },
    {
      label: 'Mounted at',
      value: `/opt/kagent/tools/${toolchain.name}`,
    },
    {
      label: 'Harnesses',
      value:
        toolchain.harnesses.length > 0
          ? toolchain.harnesses.join(', ')
          : 'Every harness',
    },
    ...pinsFact('Packages', toolchain.packages),
    ...pinsFact('Binaries', toolchain.binaries),
    ...(toolchain.egress && toolchain.egress.length > 0
      ? [{ label: 'Reaches', value: toolchain.egress.join(', ') }]
      : []),
    {
      label: 'Source',
      value: sourceURL ? (
        <ExternalLink href={sourceURL} display="inline">
          {toolchain.repository}
        </ExternalLink>
      ) : (
        toolchain.repository
      ),
    },
    {
      label: 'Dockerfile',
      value: toolchain.written
        ? 'Written by the toolchain-manager from its packages and binaries'
        : 'Hand-written',
    },
  ];
  return (
    <Flex direction="column" gap="6">
      <PageSection
        title="Tools"
        description="Each tool’s wrapper is on the session’s PATH; the contract check ran its version command before the version was published."
      >
        <ToolsTable tools={toolchain.tools} />
      </PageSection>
      <PageSection title="Details">
        <FactList facts={facts} />
      </PageSection>
      <PageSection title="Dockerfile">
        <FileView
          content={toolchain.dockerfile}
          filename="Dockerfile"
          path={`toolchains/${toolchain.name}`}
        />
      </PageSection>
    </Flex>
  );
}

/**
 * One toolchain's page, under Customize → Toolchains: its published versions
 * (the newest by default, another by `?version=`) and, for the version shown,
 * the tools, Harnesses, pinned packages and binaries and the origins its
 * image declares, read with `describe_toolchain` as the person.
 */
export function ToolchainDetailPage({
  installation,
  name,
}: ToolchainDetailPageProps) {
  const now = useNow(60_000);
  const frame = useToolchainFrame(name);
  const { isAvailable, isLoading } =
    useToolchainManagerAvailability(installation);
  const [searchParams, setSearchParams] = useSearchParams();
  const version = searchParams.get(VERSION_SEARCH_PARAM) ?? undefined;
  const source = searchParams.get(TOOLCHAIN_SOURCE_PARAM) ?? undefined;
  const description = useToolchainDescription(installation, name, {
    source,
    version,
    enabled: isAvailable,
  });
  const sources = useToolchainSources(installation, { enabled: isAvailable });
  const sourceURL = safeWebURL(
    sources.data?.sources.find(
      candidate => candidate.name === description.data?.toolchain?.source,
    )?.url,
  );

  if (!isAvailable && !isLoading) {
    return (
      <ShellPage title={name} {...frame}>
        <EmptyStateCard
          title="Toolchains are not available here"
          description={`${installation} does not run the toolchain-manager. Ask your platform team to turn toolchains on.`}
        />
      </ShellPage>
    );
  }
  if (isLoading || description.isPending) {
    return (
      <ShellPage
        title={<ShellPageTitleSkeleton label={`Reading ${name}…`} />}
        {...frame}
      >
        <ShellPageFactsSkeleton />
      </ShellPage>
    );
  }
  if (description.error) {
    return (
      <ShellPage title={name} {...frame}>
        <ToolchainReadFailure
          installation={installation}
          error={description.error}
          title={`${name} could not be read`}
          onRetry={description.refetch}
        />
      </ShellPage>
    );
  }
  const toolchain = description.data.toolchain;
  if (!toolchain) {
    return (
      <ShellPage title={name} {...frame}>
        <ToolchainGrantPrompt
          installation={installation}
          answer={description.data}
        />
      </ShellPage>
    );
  }

  const releaseURL = safeWebURL(toolchain.releaseURL);
  return (
    <ShellPage
      title={name}
      {...frame}
      meta={
        <>
          {installation} · {toolchain.source}
          {toolchain.publishedAt && (
            <>
              {' '}
              · published{' '}
              <DateComponent value={toolchain.publishedAt} relative now={now} />
            </>
          )}
        </>
      }
      actions={
        <Select
          label="Version"
          size="small"
          options={toolchain.versions.map((candidate, index) => ({
            id: imageTag(candidate),
            label:
              index === 0
                ? `${imageTag(candidate)} (latest)`
                : imageTag(candidate),
          }))}
          selectedKey={imageTag(toolchain.version)}
          onSelectionChange={key =>
            setSearchParams(
              params => {
                if (!key || key === imageTag(toolchain.versions[0])) {
                  params.delete(VERSION_SEARCH_PARAM);
                } else {
                  params.set(VERSION_SEARCH_PARAM, String(key));
                }
                return params;
              },
              { replace: true },
            )
          }
        />
      }
    >
      <Flex direction="column" gap="2">
        {releaseURL && (
          <Text variant="body-small" color="secondary">
            <ExternalLink href={releaseURL} display="inline">
              Release {toolchain.name}/{toolchain.version}
            </ExternalLink>
          </Text>
        )}
        <Described toolchain={toolchain} sourceURL={sourceURL} />
      </Flex>
    </ShellPage>
  );
}

/** The page at `<installation>/<name>`, from the address. */
export function ToolchainDetailRoute() {
  const { installation = '', name = '' } = useParams();
  return <ToolchainDetailPage installation={installation} name={name} />;
}
