import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Flex,
  Link,
  SearchField,
  Select,
  Tag,
  TagGroup,
  Text,
  TextField,
} from '@backstage/ui';
import {
  type BreadcrumbItem,
  EmptyStateCard,
  LoadingIndicator,
  PageSection,
  ShellPage,
  StatusDot,
  useFieldValidation,
  useSelectFieldError,
} from '@giantswarm/backstage-plugin-ui-react';

import { useCustomizePaths } from '../../hooks/useCustomizePaths';
import {
  useScopedToolchainInstallations,
  useToolchainManagerClient,
  useToolchainSources,
} from '../../hooks/useToolchainManager';
import { useCreateToolchain } from '../../hooks/useToolchainWrites';
import {
  musterToolchainBuildQueryKey,
  musterToolchainPackagesQueryKey,
} from '../../lib/queryKeys';
import {
  BUILD_STATE_LABEL,
  isFinalBuildState,
  type ToolchainBuild,
  type WrittenToolchain,
} from '../../lib/toolchainManager';
import { toolchainDetailRouteRef, toolchainsRouteRef } from '../../routes';
import { CodeBlock } from '../CodeBlock';
import { ToolchainGrantPrompt } from '../ToolchainGrantPrompt';

/** The address's installation: `?installation=<name>`. */
export const INSTALLATION_SEARCH_PARAM = 'installation';

/** How often the build state is read while it moves. */
const BUILD_POLL_MS = 10_000;

const NAME_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

function useFrame() {
  const { customize } = useCustomizePaths();
  const toolchainsRoute = useRouteRef(toolchainsRouteRef);
  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Customize', href: customize },
    { label: 'Toolchains', href: toolchainsRoute?.() },
    { label: 'New toolchain' },
  ];
  return { breadcrumbs, documentTitle: ['New toolchain', 'Toolchains'] };
}

/** A build's state as a dot: green once published, red once failed. */
function buildTone(build: ToolchainBuild) {
  switch (build.state) {
    case 'published':
      return 'success' as const;
    case 'failed':
    case 'closed':
      return 'danger' as const;
    case 'unreleased':
      return 'warning' as const;
    default:
      return 'info' as const;
  }
}

/** The pull request's way from its checks to the published image. */
function BuildStatus({
  installation,
  name,
  source,
  pull,
}: {
  installation: string;
  name: string;
  source: string;
  pull: number;
}) {
  const client = useToolchainManagerClient(installation);
  const detailRoute = useRouteRef(toolchainDetailRouteRef);
  const status = useQuery({
    queryKey: musterToolchainBuildQueryKey(installation, source, name, pull),
    queryFn: () => client!.buildStatus({ name, source, pull }),
    enabled: Boolean(client),
    retry: false,
    refetchInterval: query => {
      const state = query.state.data?.build?.state;
      return state && isFinalBuildState(state) ? false : BUILD_POLL_MS;
    },
  });
  const build = status.data?.build;
  if (status.error) {
    return (
      <Alert
        status="warning"
        title="The build state could not be read"
        description={status.error.message}
      />
    );
  }
  if (!build) {
    return status.data?.status ? (
      <ToolchainGrantPrompt installation={installation} answer={status.data} />
    ) : (
      <LoadingIndicator label="Reading the build state…" />
    );
  }
  return (
    <Flex direction="column" gap="2">
      <StatusDot
        tone={buildTone(build)}
        label={BUILD_STATE_LABEL[build.state]}
      />
      {(build.jobs ?? []).map(job => (
        <Text key={job.name} variant="body-small" color="secondary">
          {job.url ? (
            <Link href={job.url} target="_blank" rel="noopener">
              {job.name}
            </Link>
          ) : (
            job.name
          )}
          : {job.state}
        </Text>
      ))}
      {build.state === 'published' && (
        <Text variant="body-medium">
          {build.image}.{' '}
          <Link href={detailRoute?.({ installation, name })}>Open {name}</Link>
        </Text>
      )}
      {build.log && <CodeBlock content={build.log} filename="Failed job" />}
    </Flex>
  );
}

/**
 * New toolchain, under Customize → Toolchains: a name, the source it goes
 * to and Alpine packages picked from the toolchain-manager's search, which
 * writes the Dockerfile (`add_packages`, nothing written to a repository);
 * Open pull request then adds it to the source as the person
 * (`create_toolchain`), and the page follows its checks, merge and release
 * (`toolchain_build_status`) to the published image. No Dockerfile is
 * written by hand here.
 */
export function NewToolchainPage() {
  const frame = useFrame();
  const { installations, hasToolchains } = useScopedToolchainInstallations();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get(INSTALLATION_SEARCH_PARAM);
  const installation =
    requested && installations.includes(requested)
      ? requested
      : installations[0];

  if (hasToolchains === false) {
    return (
      <ShellPage title="New toolchain" {...frame}>
        <EmptyStateCard
          title="Toolchains are not available here"
          description="No environment in scope runs the toolchain-manager. Ask your platform team to turn toolchains on."
        />
      </ShellPage>
    );
  }
  if (!installation) {
    return (
      <ShellPage title="New toolchain" {...frame}>
        <LoadingIndicator label="Reading the environments…" />
      </ShellPage>
    );
  }
  return (
    <ShellPage
      title="New toolchain"
      {...frame}
      description="Pick the packages a coding agent’s session needs; the toolchain-manager writes the Dockerfile and opens it as your pull request in a source."
      actions={
        installations.length > 1 ? (
          <Select
            label="Environment"
            size="small"
            options={installations.map(id => ({ id, label: id }))}
            selectedKey={installation}
            onSelectionChange={key =>
              key &&
              setSearchParams(
                params => {
                  params.set(INSTALLATION_SEARCH_PARAM, String(key));
                  return params;
                },
                { replace: true },
              )
            }
          />
        ) : undefined
      }
    >
      <NewToolchainForm key={installation} installation={installation} />
    </ShellPage>
  );
}

function NewToolchainForm({ installation }: { installation: string }) {
  const client = useToolchainManagerClient(installation);
  const sources = useToolchainSources(installation);
  const offered = (sources.data ?? []).filter(source => source.offered);
  const [name, setName] = useState('');
  const [source, setSource] = useState<string>();
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [written, setWritten] = useState<WrittenToolchain>();
  const [writeError, setWriteError] = useState<string>();
  const [isWriting, setWriting] = useState(false);
  const create = useCreateToolchain(installation);
  const scope = useRef<HTMLDivElement>(null);
  const validation = useFieldValidation(scope);

  const chosenSource =
    source ?? (offered.length === 1 ? offered[0].name : undefined);
  const errors = {
    name: NAME_PATTERN.test(name)
      ? undefined
      : 'Use lowercase letters, digits and dashes, e.g. helm-tools',
    source: chosenSource ? undefined : 'Choose the source it goes to',
    packages: picked.length > 0 ? undefined : 'Add at least one package',
  };
  const sourceError = useSelectFieldError(
    validation.errorFor('source', errors.source),
  );

  const search = useQuery({
    queryKey: musterToolchainPackagesQueryKey(installation, searched),
    queryFn: () => client!.searchPackages(searched),
    enabled: Boolean(client) && searched.length > 0,
    retry: false,
  });

  // A change to the picks or the name invalidates the written Dockerfile.
  const changed = (apply: () => void) => {
    apply();
    setWritten(undefined);
    create.reset();
  };

  const write = async () => {
    if (errors.name || errors.source || errors.packages) {
      validation.reveal();
      return;
    }
    setWriting(true);
    setWriteError(undefined);
    try {
      setWritten(await client!.addPackages({ name, packages: picked }));
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : String(error));
    } finally {
      setWriting(false);
    }
  };

  const created = create.data?.created;

  return (
    <Flex direction="column" gap="6" ref={scope}>
      <PageSection title="Toolchain">
        <Flex direction="column" gap="3" style={{ maxWidth: 560 }}>
          <TextField
            label="Name"
            isRequired
            description="The directory toolchains/<name> and where a session mounts it, /opt/kagent/tools/<name>."
            placeholder="helm-tools"
            value={name}
            isReadOnly={Boolean(created)}
            onChange={value => changed(() => setName(value))}
            {...validation.textFieldProps('name', errors.name)}
          />
          <div>
            <Select
              label="Source"
              isRequired
              description="The repository the pull request is opened in; you need push access to it."
              placeholder={
                sources.isPending ? 'Reading the sources…' : 'No source'
              }
              options={offered.map(candidate => ({
                id: candidate.name,
                label: candidate.repository,
              }))}
              selectedKey={chosenSource ?? null}
              isDisabled={Boolean(created)}
              onSelectionChange={key =>
                setSource(key ? String(key) : undefined)
              }
              {...sourceError.selectProps}
            />
            {sourceError.message}
          </div>
        </Flex>
      </PageSection>

      <PageSection
        title="Packages"
        description="Alpine packages, each pinned to its version on the newest branch and installed with its dependencies. The toolchain declares the command of each package’s name."
      >
        <Flex direction="column" gap="3" style={{ maxWidth: 720 }}>
          <form
            onSubmit={event => {
              event.preventDefault();
              setSearched(query.trim());
            }}
          >
            <Flex gap="2" align="end">
              <div style={{ flex: 1 }}>
                <SearchField
                  label="Search packages"
                  placeholder="e.g. helm"
                  value={query}
                  onChange={setQuery}
                  onSubmit={value => setSearched(value.trim())}
                />
              </div>
              <Button type="submit" variant="secondary">
                Search
              </Button>
            </Flex>
          </form>
          {search.error && (
            <Alert
              status="danger"
              title="Could not search the packages"
              description={search.error.message}
            />
          )}
          {search.isFetching && <LoadingIndicator label="Searching…" />}
          {search.data && !search.isFetching && (
            <Flex direction="column" gap="1">
              {search.data.packages.length === 0 && (
                <Text variant="body-small" color="secondary">
                  No package matches {searched}.
                </Text>
              )}
              {search.data.packages.slice(0, 10).map(pkg => {
                const branch = search.data.branches[0];
                const version = branch ? pkg.versions[branch] : undefined;
                const isPicked = picked.includes(pkg.name);
                return (
                  <Flex key={pkg.name} align="center" justify="between" gap="2">
                    <Text variant="body-medium">
                      <strong>{pkg.name}</strong>
                      {version ? ` ${version}` : ''}
                      {pkg.description ? ` · ${pkg.description}` : ''}
                    </Text>
                    <Button
                      size="small"
                      variant="secondary"
                      isDisabled={isPicked || !version || Boolean(created)}
                      onPress={() =>
                        changed(() =>
                          setPicked(current => [...current, pkg.name]),
                        )
                      }
                    >
                      {isPicked ? 'Added' : 'Add'}
                    </Button>
                  </Flex>
                );
              })}
            </Flex>
          )}
          <Flex direction="column" gap="1">
            <Text variant="body-small" weight="bold">
              Picked
            </Text>
            {picked.length === 0 ? (
              <Text
                variant="body-small"
                color={
                  validation.errorFor('packages', errors.packages)
                    ? 'danger'
                    : 'secondary'
                }
              >
                {validation.errorFor('packages', errors.packages) ??
                  'No package yet.'}
              </Text>
            ) : (
              <TagGroup
                aria-label="Picked packages"
                onRemove={
                  created
                    ? undefined
                    : keys =>
                        changed(() =>
                          setPicked(current =>
                            current.filter(pkg => !keys.has(pkg)),
                          ),
                        )
                }
              >
                {picked.map(pkg => (
                  <Tag key={pkg} id={pkg}>
                    {pkg}
                  </Tag>
                ))}
              </TagGroup>
            )}
          </Flex>
        </Flex>
      </PageSection>

      <PageSection
        title="Dockerfile"
        description="Written by the toolchain-manager from the packages; nothing is written to a repository until you open the pull request."
        action={
          <Button
            variant={written ? 'secondary' : 'primary'}
            isDisabled={isWriting || Boolean(created)}
            onPress={write}
          >
            {isWriting ? 'Writing…' : 'Write Dockerfile'}
          </Button>
        }
      >
        {writeError && (
          <Alert
            status="danger"
            title="Could not write the Dockerfile"
            description={writeError}
          />
        )}
        {written ? (
          <CodeBlock
            content={written.dockerfile}
            filename="Dockerfile"
            path={written.path.replace(/\/Dockerfile$/, '')}
          />
        ) : (
          <Text variant="body-small" color="secondary">
            Pick the packages, then write the Dockerfile to review it.
          </Text>
        )}
      </PageSection>

      {written && chosenSource && (
        <PageSection
          title="Pull request"
          description="Opened as you in the source; its CI runs the toolchain contract check, and its merge publishes the toolchain."
          action={
            created ? undefined : (
              <Button
                variant="primary"
                isDisabled={create.isPending}
                onPress={() =>
                  create.mutate({
                    dockerfile: written.dockerfile,
                    name,
                    source: chosenSource,
                  })
                }
              >
                {create.isPending ? 'Opening…' : 'Open pull request'}
              </Button>
            )
          }
        >
          {create.error && (
            <Alert
              status="danger"
              title="Could not open the pull request"
              description={create.error.message}
            />
          )}
          {create.data && !created && (
            <ToolchainGrantPrompt
              installation={installation}
              answer={create.data}
            />
          )}
          {created && (
            <Flex direction="column" gap="3">
              <Text variant="body-medium">
                <Link href={created.pullURL} target="_blank" rel="noopener">
                  {created.repository}#{created.pull}
                </Link>{' '}
                adds {created.toolchain} on the branch {created.branch}.
              </Text>
              <BuildStatus
                installation={installation}
                name={created.toolchain}
                source={created.source}
                pull={created.pull}
              />
            </Flex>
          )}
        </PageSection>
      )}
    </Flex>
  );
}
