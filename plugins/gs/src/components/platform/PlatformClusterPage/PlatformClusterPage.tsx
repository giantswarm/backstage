import { type ReactNode, useMemo, useState } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Flex, Link } from '@backstage/ui';
import { Constants } from '@giantswarm/backstage-plugin-gs-common';
import {
  App,
  AWSCluster,
  AzureASOManagedCluster,
  AzureCluster,
  ErrorsProvider,
  HelmRelease,
  toKubectlYaml,
  useClustersInfo,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  AsyncValue,
  type BreadcrumbItem,
  DateComponent,
  EmptyStateCard,
  ExternalLink,
  type Fact,
  FactsColumn,
  ManifestDialog,
  Mono,
  MoreActionsMenu,
  ShellPage,
  ShellPageBadgeSkeleton,
  ShellPageFactsSkeleton,
  ShellPageTitleSkeleton,
  useSplatBasePath,
} from '@giantswarm/backstage-plugin-ui-react';
import { useDisabledInstallations } from '../../hooks/useDisabledInstallations';
import {
  getClusterKey,
  useWorkerCapacity,
} from '../../hooks/useWorkerCapacity';
import type { ClusterAddress } from '../../clusters/ClusterDetailsPage/useClusterFromUrl';
import {
  ClusterProvider,
  useAsyncCluster,
  useCurrentCluster,
} from '../../clusters/ClusterDetailsPage/useCurrentCluster';
import { ProviderClusterLocation } from '../../clusters/cluster-details/ClusterOverview/ClusterAboutCard/ProviderClusterLocation';
import { useAWSAccount } from '../../clusters/cluster-details/ClusterOverview/ClusterAboutCard/AWSAccountField';
import {
  type ClusterToolLink,
  useClusterToolLinks,
} from '../../clusters/cluster-details/ClusterOverview/ClusterToolsCard';
import type { InfrastructureRef } from '../../clusters/cluster-details/ClusterSwitch';
import {
  formatWorkerCpu,
  formatWorkerMemory,
  formatWorkerNodes,
  hasUnknownResources,
} from '../../clusters/nodePools';
import {
  calculateClusterProvider,
  calculateClusterStatus,
  formatClusterProvider,
  getClusterCreationTimestamp,
  getClusterOrganization,
  isManagementCluster,
} from '../../clusters/utils';
import { PlatformClusterOverview } from '../PlatformClusterOverview';
import { PlatformClusterStatusDot } from '../PlatformClusterStatusDot';
import {
  installerOutcome,
  PlatformInstallerStatus,
} from '../PlatformInstallerStatus';
import { usePlatformLinks } from '../PlatformLinks';

/**
 * The cluster page's routed tabs, in strip order; Overview is the page's own
 * address. Node pools, Gateways and Access come with the next iteration
 * (giantswarm/giantswarm#39295).
 */
const CLUSTER_PAGE_TABS = [{ id: 'overview', path: '', title: 'Overview' }];

/** The frame of every state of the page: breadcrumbs back to the list. */
function useFrame(name: string) {
  const links = usePlatformLinks();
  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Platform', href: links?.platform },
    { label: 'Clusters', href: links?.clusters },
    { label: name },
  ];
  return {
    clustersHref: links?.clusters,
    frame: { breadcrumbs, documentTitle: [name, 'Clusters', 'Platform'] },
  };
}

function BackToClusters({ href }: { href: string | undefined }) {
  return href ? <Link href={href}>Back to clusters</Link> : null;
}

/** The page while its name is all it knows, in its final geometry. */
function LoadingPage({ name }: { name: string }) {
  const { frame } = useFrame(name);
  return (
    <ShellPage
      title={<ShellPageTitleSkeleton label={`Reading ${name}…`} />}
      {...frame}
      badges={<ShellPageBadgeSkeleton />}
      tabs={CLUSTER_PAGE_TABS}
      aside={<ShellPageFactsSkeleton />}
    >
      <ShellPageFactsSkeleton />
    </ShellPage>
  );
}

/** A state that leaves nothing of the cluster to show: an empty state card. */
function NothingToShow({
  name,
  title,
  description,
}: {
  name: string;
  title: string;
  description: string;
}) {
  const { clustersHref, frame } = useFrame(name);
  return (
    <ShellPage title={name} {...frame}>
      <EmptyStateCard
        title={title}
        description={description}
        actions={<BackToClusters href={clustersHref} />}
      />
    </ShellPage>
  );
}

/** A read of the whole page that failed: a danger alert with a way back. */
function ReadFailed({
  name,
  title,
  description,
  onRetry,
}: {
  name: string;
  title: string;
  description: string;
  onRetry?: () => void;
}) {
  const { clustersHref, frame } = useFrame(name);
  return (
    <ShellPage title={name} {...frame}>
      <Flex direction="column" gap="4" align="start">
        <Alert
          role="alert"
          status="danger"
          icon
          title={title}
          description={description}
          customActions={
            onRetry ? (
              <Button size="small" variant="secondary" onPress={onRetry}>
                Try again
              </Button>
            ) : undefined
          }
          style={{ alignSelf: 'stretch' }}
        />
        <BackToClusters href={clustersHref} />
      </Flex>
    </ShellPage>
  );
}

/** The infrastructure cluster kinds whose cluster has a region. */
const LOCATED_KINDS = new Set<string>([
  AWSCluster.kind,
  AzureCluster.kind,
  AzureASOManagedCluster.kind,
]);

function AWSAccountValue({
  infrastructureRef,
}: {
  infrastructureRef: InfrastructureRef;
}) {
  const { isLoading, errorMessage, accountId, accountUrl } =
    useAWSAccount(infrastructureRef);
  return (
    <AsyncValue
      isLoading={isLoading}
      errorMessage={errorMessage}
      value={accountId}
    >
      {value =>
        // To the AWS console, as the classic page's account links.
        accountUrl ? (
          <ExternalLink href={accountUrl}>
            <Mono>{value}</Mono>
          </ExternalLink>
        ) : (
          <Mono>{value}</Mono>
        )
      }
    </AsyncValue>
  );
}

function WorkersValue() {
  const { cluster, installationName } = useCurrentCluster();
  const clusters = useMemo(() => [cluster], [cluster]);
  const { capacities } = useWorkerCapacity(clusters);
  const workers = capacities.get(
    getClusterKey({
      installationName,
      namespace: cluster.getNamespace(),
      name: cluster.getName(),
    }),
  );
  const capacity = workers?.capacity;
  let value: string | undefined;
  if (capacity) {
    value = hasUnknownResources(capacity)
      ? formatWorkerNodes(capacity.nodes)
      : [
          formatWorkerNodes(capacity.nodes),
          formatWorkerCpu(capacity.vcpus),
          formatWorkerMemory(capacity.memoryBytes),
        ].join(' · ');
  }
  return (
    <AsyncValue
      isLoading={workers?.isLoading ?? false}
      errorMessage={workers?.errorMessage}
      value={value}
    />
  );
}

/** The tools of `gs.clusterDetails.resources`, each opening in a new tab. */
function ToolLinks({ links }: { links: ClusterToolLink[] }) {
  if (links.length === 0) {
    return null;
  }
  return (
    <nav aria-label="Tools">
      <Flex direction="column" gap="2" mt="4">
        {links.map((link, index) => (
          // Two configured links can fill in to the same URL.
          <ExternalLink key={`${index}:${link.label}`} href={link.url}>
            {link.label.replace(/\s*(\\n|\n)\s*/g, ' ')}
          </ExternalLink>
        ))}
      </Flex>
    </nav>
  );
}

/**
 * The facts beside the Overview: where the cluster runs, whose it is, its
 * workers and age, and the tools to watch it with. Its service priority is
 * among the friendly labels on the Overview.
 */
function ClusterFacts() {
  const { cluster, installationName } = useCurrentCluster();
  const links = usePlatformLinks();
  const tools = useClusterToolLinks(installationName, cluster);
  const organization = getClusterOrganization(cluster);
  const provider = calculateClusterProvider(cluster);
  const created = getClusterCreationTimestamp(cluster);
  const infrastructureRef = cluster.getInfrastructureRef();

  // A workload cluster's environment leads to its management cluster's page.
  const managementHref =
    !isManagementCluster(cluster) && links
      ? links.cluster({
          installationName,
          namespace: Constants.MANAGEMENT_CLUSTER_NAMESPACE,
          name: installationName,
        })
      : undefined;

  const facts: Fact[] = [
    {
      label: 'Environment',
      value: managementHref ? (
        <Link href={managementHref}>{installationName}</Link>
      ) : (
        installationName
      ),
    },
  ];
  if (organization) {
    facts.push({ label: 'Organization', value: organization });
  }
  if (provider) {
    facts.push({ label: 'Provider', value: formatClusterProvider(provider) });
  }
  if (infrastructureRef && LOCATED_KINDS.has(infrastructureRef.kind)) {
    facts.push({ label: 'Region', value: <ProviderClusterLocation /> });
  }
  if (infrastructureRef?.kind === AWSCluster.kind) {
    facts.push({
      label: 'AWS account',
      value: <AWSAccountValue infrastructureRef={infrastructureRef} />,
    });
  }
  facts.push({ label: 'Workers', value: <WorkersValue /> });
  if (created) {
    facts.push({
      label: 'Created',
      value: <DateComponent value={created} relative />,
    });
  }

  return (
    <FactsColumn facts={facts}>
      {!tools.isLoading && <ToolLinks links={tools.links} />}
    </FactsColumn>
  );
}

/** One sentence on what the cluster is: its type, organization and environment. */
function summaryOf(
  cluster: ReturnType<typeof useCurrentCluster>['cluster'],
  installationName: string,
): string {
  if (isManagementCluster(cluster)) {
    return `Management cluster of the ${installationName} environment.`;
  }
  const organization = getClusterOrganization(cluster);
  return organization
    ? `Workload cluster of the ${organization} organization in ${installationName}.`
    : `Workload cluster in ${installationName}.`;
}

/** Says the cluster is being deleted and the page follows the deletion. */
function DeletingNotice({ refreshError }: { refreshError: Error | null }) {
  const { cluster } = useCurrentCluster();
  const requested = cluster.getDeletionTimestamp();
  return (
    <Alert
      status={refreshError ? 'warning' : 'info'}
      icon
      title={`${cluster.getName()} is being deleted`}
      description={
        <>
          {requested ? (
            <>
              Deletion was requested{' '}
              <DateComponent value={requested} relative />.{' '}
            </>
          ) : null}
          Its resources disappear as the deletion proceeds, so some details may
          be missing.{' '}
          {refreshError
            ? `The page could not re-read all of the cluster and keeps trying: ${refreshError.message}`
            : 'This page updates by itself.'}
        </>
      }
    />
  );
}

/** The page of a cluster that has been read. */
function ClusterPage() {
  const { cluster, installationName, isDeleting } = useCurrentCluster();
  const { refreshError } = useAsyncCluster();
  const name = cluster.getName();
  const { frame } = useFrame(name);
  const basePath = useSplatBasePath();
  const { search } = useLocation();
  const [isManifestOpen, setManifestOpen] = useState(false);
  const manifest = useMemo(() => toKubectlYaml(cluster), [cluster]);

  return (
    <ShellPage
      title={name}
      {...frame}
      badges={
        <PlatformClusterStatusDot status={calculateClusterStatus(cluster)} />
      }
      description={summaryOf(cluster, installationName)}
      menu={
        <MoreActionsMenu
          items={[
            {
              id: 'manifest',
              label: 'View manifest',
              onAction: () => setManifestOpen(true),
            },
          ]}
        />
      }
      tabs={CLUSTER_PAGE_TABS}
      tabsBasePath={basePath}
      aside={<ClusterFacts />}
    >
      <Flex direction="column" gap="5">
        {isDeleting && <DeletingNotice refreshError={refreshError} />}
        {!isDeleting && refreshError && (
          <Alert
            status="warning"
            icon
            title="Could not re-read the cluster"
            description={`The page shows the cluster as last read and keeps trying: ${refreshError.message}`}
          />
        )}
        <Routes>
          <Route index element={<PlatformClusterOverview />} />
          {/* A tab the page does not have lands on Overview. */}
          <Route
            path="*"
            element={<Navigate to={`${basePath}${search}`} replace />}
          />
        </Routes>
      </Flex>
      <ManifestDialog
        isOpen={isManifestOpen}
        onOpenChange={setManifestOpen}
        title="Cluster manifest"
        manifest={manifest}
        description={
          <>
            The Cluster resource as stored on{' '}
            <strong>{installationName}</strong>.
          </>
        }
      />
    </ShellPage>
  );
}

/**
 * Reads the cluster and what installs it again: every request of the page to
 * the cluster's installation.
 */
function useRereadCluster(installationName: string): () => void {
  const queryClient = useQueryClient();
  return () =>
    void queryClient.invalidateQueries({
      predicate: ({ queryKey }) =>
        queryKey[0] === 'cluster' && queryKey[1] === installationName,
    });
}

const INSTALLER_TITLES = {
  deleting: (name: string) => `${name} is being deleted`,
  failed: (name: string) => `${name} could not be installed`,
  creating: (name: string) => `${name} is being created`,
} as const;

const INSTALLER_DESCRIPTIONS = {
  deleting: (kind: string) =>
    `Its Cluster resource is gone, and its ${kind} is still being removed.`,
  failed: (kind: string) =>
    `Its ${kind} failed, so its Cluster resource does not exist.`,
  creating: (kind: string) =>
    `Its ${kind} exists, and the Cluster resource it creates does not yet.`,
} as const;

/**
 * A cluster whose Cluster resource does not exist while what installs it
 * does: being created, failed to install, or deleted with its installer
 * still finalizing. As the classic page does, it shows the installer's
 * status.
 */
function InstallerOnly({
  name,
  installer,
  onRetry,
}: {
  name: string;
  installer: App | HelmRelease;
  onRetry: () => void;
}) {
  const { clustersHref, frame } = useFrame(name);
  const outcome = installerOutcome(installer);
  return (
    <ShellPage title={name} {...frame}>
      <Flex direction="column" gap="4" align="start">
        <Alert
          status={outcome === 'failed' ? 'danger' : 'info'}
          icon
          title={INSTALLER_TITLES[outcome](name)}
          description={INSTALLER_DESCRIPTIONS[outcome](installer.getKind())}
          customActions={
            <Button size="small" variant="secondary" onPress={onRetry}>
              Try again
            </Button>
          }
          style={{ alignSelf: 'stretch' }}
        />
        <PlatformInstallerStatus installer={installer} />
        <BackToClusters href={clustersHref} />
      </Flex>
    </ShellPage>
  );
}

/**
 * The cluster's read, in the states the page can be in: loading, not found
 * in its environment, a failed read (with its cause, whatever the installer
 * says), only its installer left (see `InstallerOnly`), or read.
 */
function ClusterRead({ name }: { name: string }) {
  const {
    cluster,
    clusterApp,
    clusterRelease,
    installationName,
    loading,
    notFound,
    error,
  } = useAsyncCluster();
  const reread = useRereadCluster(installationName);

  // A cluster that was read is shown, also where what installs it could not
  // be read (an imported cluster has neither App nor HelmRelease): the page
  // needs that only for its GitOps section and technical details.
  if (cluster) {
    return <ClusterPage />;
  }
  if (loading) {
    return <LoadingPage name={name} />;
  }
  if (notFound) {
    return (
      <NothingToShow
        name={name}
        title={`No cluster ${name} in ${installationName}`}
        description="It may have been deleted, or the link names another namespace or environment."
      />
    );
  }
  const installer = clusterApp ?? clusterRelease;
  // Only a Cluster that is not there (a 404, as `useCluster` counts one)
  // leaves the installer to speak for it; any other failure is the read's,
  // and says why.
  if (installer && (!error || error.name === 'NotFoundError')) {
    return <InstallerOnly name={name} installer={installer} onRetry={reread} />;
  }
  return (
    <ReadFailed
      name={name}
      title={`Could not read ${name}`}
      description={
        error?.message
          ? `${installationName} did not answer the request for the cluster: ${error.message}`
          : `${installationName} did not answer the request for the cluster.`
      }
      onRetry={reread}
    />
  );
}

/**
 * Checks the address's environment before the cluster is read: the portal
 * must know it and reach its backend.
 */
function EnvironmentGate({
  address,
  children,
}: {
  address: ClusterAddress;
  children: ReactNode;
}) {
  const { installationName, name } = address;
  const installations = useClustersInfo();
  const disabled = useDisabledInstallations();
  const queryClient = useQueryClient();
  // The readiness check of the environments' backends, asked again.
  const recheck = () =>
    void queryClient.invalidateQueries({
      queryKey: ['installations', 'status'],
    });

  if (installations.error) {
    return (
      <ReadFailed
        name={name}
        title="Could not read your environments"
        description={`The environments clusters are read from could not be listed: ${installations.error.message}`}
        onRetry={() => void installations.retry()}
      />
    );
  }
  if (installations.isLoading || disabled.isLoading) {
    return <LoadingPage name={name} />;
  }
  if (!installations.clusters.includes(installationName)) {
    return (
      <NothingToShow
        name={name}
        title={`No environment ${installationName}`}
        description="This portal does not know an environment of that name, so it cannot read its clusters."
      />
    );
  }
  if (disabled.disabledInstallations.includes(installationName)) {
    return (
      <ReadFailed
        name={name}
        title={`Could not reach ${installationName}`}
        description={`The portal cannot reach ${installationName} right now, so ${name} cannot be read.`}
        onRetry={recheck}
      />
    );
  }
  return <>{children}</>;
}

/** The classic pages' error boxes are not drawn: each value says its own. */
function hideClassicErrors(): boolean {
  return true;
}

/**
 * A cluster's page in the shell's Platform section
 * (`/platform/clusters/<installation>/<namespace>/<name>`): its state, a
 * column of facts, and routed tabs, of which only Overview exists so far.
 * Reads the cluster as the classic cluster page does (`ClusterProvider`),
 * through the query client of the `PlatformClustersProvider` above it, which
 * the clusters list reads through too.
 */
export function PlatformClusterPage({ address }: { address: ClusterAddress }) {
  return (
    <ErrorsProvider ignoreError={hideClassicErrors}>
      {/* Another cluster's address starts the page's state afresh, under the
          same query client and its cache. */}
      <EnvironmentGate key={addressKey(address)} address={address}>
        <ClusterProvider address={address}>
          <ClusterRead name={address.name} />
        </ClusterProvider>
      </EnvironmentGate>
    </ErrorsProvider>
  );
}

/**
 * The page at its address: `<installationName>/<namespace>/<name>`, mounted
 * by the app's Platform page under a splat route.
 */
export function PlatformClusterRoute() {
  const { installationName, namespace, name } = useParams();
  const address = useMemo(
    () =>
      installationName && namespace && name
        ? { installationName, namespace, name }
        : undefined,
    [installationName, namespace, name],
  );
  if (!address) {
    return null;
  }
  return <PlatformClusterPage address={address} />;
}

function addressKey(address: ClusterAddress): string {
  return `${address.installationName}/${address.namespace}/${address.name}`;
}
