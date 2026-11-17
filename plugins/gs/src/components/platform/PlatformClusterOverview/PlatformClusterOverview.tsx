import { Flex, Text } from '@backstage/ui';
import {
  isManagedByFlux,
  useGitOpsSource,
} from '@giantswarm/backstage-plugin-flux-react';
import {
  App,
  HelmRelease,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  AsyncValue,
  CodeBlock,
  ExternalLink,
  type Fact,
  FactList,
  formatLocalDay,
  Mono,
  namespacedNameFacts,
  PageSection,
  TechnicalDetailsFoldOut,
} from '@giantswarm/backstage-plugin-ui-react';
import { useCurrentCluster } from '../../clusters/ClusterDetailsPage/useCurrentCluster';
import { useClusterKubernetesVersion } from '../../clusters/ClusterDetailsPage/useClusterKubernetesVersion';
import {
  getClusterAppName,
  getClusterAppVersion,
  getClusterDescription,
  getClusterK8sAPIUrl,
  getClusterReleaseVersion,
  getKubectlGsLoginCommand,
  isManagementCluster,
} from '../../clusters/utils';
import {
  defaultFriendlyLabelsConfiguration,
  useFriendlyItemsConfiguration,
  useHelmChartNameForDeployment,
  useInstallationsInfo,
} from '../../hooks';
import { useK8sVersionEOLDate } from '../../hooks/useK8sVersionEOLDate';
import { useLabelsWithDisplayInfo } from '../../LabelsCard/Labels/useLabelsWithDisplayInfo';
import { getKubernetesReleaseEOLStatus } from '../../utils/getKubernetesReleaseEOLStatus';
import { formatVersion } from '../../utils/helpers';

/** The label column's width in this tab's fact lists, as on the mockup. */
const LABEL_WIDTH = 170;

/** "No release" and the like: a value the cluster does not have. */
function Absent({ children }: { children: string }) {
  return (
    <Text variant="body-medium" color="secondary">
      {children}
    </Text>
  );
}

/**
 * The Kubernetes version and how long it is supported, from
 * `gs.kubernetesVersions`: "1.31.7 · supported until 28 Feb 2027", or the
 * end of life in the warning colour once it has passed.
 */
function KubernetesValue({ version }: { version: string }) {
  const formatted = formatVersion(version);
  const eolDate = useK8sVersionEOLDate(formatted);
  const eol = eolDate ? getKubernetesReleaseEOLStatus(eolDate) : undefined;
  if (!eolDate || !eol) {
    return <>{formatted}</>;
  }
  const day = eolDay(eolDate);
  return (
    <Flex align="center" gap="1" style={{ flexWrap: 'wrap' }}>
      <span>{formatted} ·</span>
      {eol.isEol ? (
        <Text variant="body-medium" color="warning" title={eol.message}>
          end of life since {day}
        </Text>
      ) : (
        <span title={eol.message}>supported until {day}</span>
      )}
    </Flex>
  );
}

/**
 * An end-of-life date of `gs.kubernetesVersions` (`2027-03-28`), a calendar
 * day: read as that day wherever the person is, never shifted by a timezone.
 */
function eolDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return year && month && day
    ? formatLocalDay(new Date(year, month - 1, day), 0)
    : date;
}

/** The release the cluster runs and its Kubernetes version. */
function ReleaseSection() {
  const { cluster } = useCurrentCluster();
  const kubernetes = useClusterKubernetesVersion();
  const release = getClusterReleaseVersion(cluster);
  const facts: Fact[] = [
    {
      label: 'Release',
      value: release ? formatVersion(release) : <Absent>No release</Absent>,
    },
    {
      label: 'Kubernetes',
      value: (
        <AsyncValue
          isLoading={kubernetes.isLoading}
          value={kubernetes.version}
          errorMessage={kubernetes.errorMessage}
          renderNotAvailable={<Absent>Not known yet</Absent>}
        >
          {version => <KubernetesValue version={version} />}
        </AsyncValue>
      ),
    },
  ];
  return (
    <PageSection title="Release">
      <FactList facts={facts} labelWidth={LABEL_WIDTH} size="medium" />
    </PageSection>
  );
}

/**
 * The labels and annotations `gs.friendlyLabels` and `gs.friendlyAnnotations`
 * name, in their friendly form, and the cluster's description. Left out when
 * there is none of them; every label and annotation is in Technical details.
 */
function LabelsSection() {
  const { cluster } = useCurrentCluster();
  const labelsConfig =
    useFriendlyItemsConfiguration('gs.friendlyLabels') ??
    defaultFriendlyLabelsConfiguration;
  const annotationsConfig =
    useFriendlyItemsConfiguration('gs.friendlyAnnotations') ?? [];
  const labels = useLabelsWithDisplayInfo(
    cluster.getLabels() ?? {},
    true,
    labelsConfig,
  );
  const annotations = useLabelsWithDisplayInfo(
    cluster.getAnnotations() ?? {},
    true,
    annotationsConfig,
  );
  const description = getClusterDescription(cluster);
  const facts: Fact[] = [
    ...(description ? [{ label: 'Description', value: description }] : []),
    ...[...labels, ...annotations].map(item => ({
      label: item.formattedKey,
      value: item.formattedValue,
    })),
  ];
  if (facts.length === 0) {
    return null;
  }
  return (
    <PageSection title="Labels and annotations">
      <FactList facts={facts} labelWidth={LABEL_WIDTH} size="medium" />
    </PageSection>
  );
}

/**
 * Where the cluster's definition lives in Git, for a cluster whose installer
 * a Flux Kustomization applies; left out otherwise, as the classic page's
 * GitOps card is.
 */
function GitOpsSection({
  installer,
  installationName,
}: {
  installer: App | HelmRelease;
  installationName: string;
}) {
  const source = useGitOpsSource(installer, installationName);
  if (!source.inGit) {
    return null;
  }
  const facts: Fact[] = [];
  if (source.kustomization) {
    facts.push({
      label: 'Managed by',
      value: `Flux · Kustomization ${source.kustomization.name}`,
    });
  }
  facts.push({
    label: 'Source',
    value: (
      <AsyncValue
        isLoading={source.isLoading}
        value={source.url}
        errorMessage={source.errorMessage}
      >
        {url => <ExternalLink href={url}>{repositoryOf(url)}</ExternalLink>}
      </AsyncValue>
    ),
  });
  return (
    <PageSection
      title="GitOps delivery"
      description="Changes to this cluster go through its Git repository."
    >
      <FactList facts={facts} labelWidth={LABEL_WIDTH} size="medium" />
    </PageSection>
  );
}

/** "owner/repo" of a repository link, the link itself where it has none. */
function repositoryOf(url: string): string {
  try {
    const [owner, repository] = new URL(url).pathname
      .split('/')
      .filter(Boolean);
    return owner && repository ? `${owner}/${repository}` : url;
  } catch {
    return url;
  }
}

/**
 * The `kubectl gs login` command, where the installation's base domain is
 * known; left out where it is not.
 */
function LoginSection() {
  const { cluster, installationName } = useCurrentCluster();
  const { installationsInfo } = useInstallationsInfo();
  const baseDomain = installationsInfo.find(
    info => info.name === installationName,
  )?.baseDomain;
  if (!baseDomain) {
    return null;
  }
  return (
    <PageSection
      title="Work with the cluster"
      description="Log in with kubectl gs to set up your kubectl context for this cluster."
    >
      <CodeBlock
        text={getKubectlGsLoginCommand(
          baseDomain,
          cluster.getName(),
          isManagementCluster(cluster),
        )}
        language="bash"
      />
    </PageSection>
  );
}

/** The chart of a HelmRelease that installs the cluster, as Flux reports it. */
function HelmReleaseChart({ release }: { release: HelmRelease }) {
  const { chartName, isLoading, errorMessage } =
    useHelmChartNameForDeployment(release);
  const version = release.getLastAppliedRevision();
  return (
    <AsyncValue
      isLoading={isLoading}
      value={chartName}
      errorMessage={errorMessage}
    >
      {name => (
        <Mono>{version ? `${name} ${formatVersion(version)}` : name}</Mono>
      )}
    </AsyncValue>
  );
}

/** Each `key=value` on a line of its own. */
function KeyValues({ entries }: { entries: Record<string, string> }) {
  const lines = Object.entries(entries).map(([key, value]) =>
    value ? `${key}=${value}` : key,
  );
  if (lines.length === 0) {
    return <Absent>None</Absent>;
  }
  return (
    <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
      {lines.map(line => (
        <span key={line} style={{ overflowWrap: 'anywhere' }}>
          <Mono>{line}</Mono>
        </span>
      ))}
    </Flex>
  );
}

/**
 * The cluster's resource as Kubernetes has it: its namespace and name, the
 * chart that installs it, its API endpoint, and every label and annotation.
 */
function TechnicalDetails() {
  const { cluster, clusterApp, clusterRelease } = useCurrentCluster();
  const appName = getClusterAppName(cluster);
  const appVersion = getClusterAppVersion(cluster);
  const apiUrl = getClusterK8sAPIUrl(cluster);

  let clusterAppValue;
  if (clusterRelease && !clusterApp) {
    clusterAppValue = <HelmReleaseChart release={clusterRelease} />;
  } else if (appName) {
    clusterAppValue = (
      <Mono>{appVersion ? `${appName} ${appVersion}` : appName}</Mono>
    );
  } else {
    clusterAppValue = <Absent>Not known</Absent>;
  }

  const installer = clusterApp ?? clusterRelease;
  const facts: Fact[] = [
    ...namespacedNameFacts({
      namespace: cluster.getNamespace(),
      name: cluster.getName(),
    }),
    { label: 'Cluster app', value: clusterAppValue },
    ...(installer
      ? [
          {
            label: 'Installed by',
            value: (
              <Mono>{`${installer.getKind()} ${installer.getName()}`}</Mono>
            ),
          },
        ]
      : []),
    {
      label: 'API endpoint',
      value: apiUrl ? <Mono>{apiUrl}</Mono> : <Absent>Not known yet</Absent>,
    },
    {
      label: 'Labels',
      value: <KeyValues entries={cluster.getLabels() ?? {}} />,
    },
    {
      label: 'Annotations',
      value: <KeyValues entries={cluster.getAnnotations() ?? {}} />,
    },
  ];
  return <FactList facts={facts} labelWidth={LABEL_WIDTH} size="medium" />;
}

/**
 * The cluster page's Overview tab: its release, its friendly labels and
 * annotations, where its definition lives in Git, how to log in, and the
 * technical details in a fold-out. Inside a `ClusterProvider` whose cluster
 * has been read.
 */
export function PlatformClusterOverview() {
  const { cluster, clusterApp, clusterRelease, installationName } =
    useCurrentCluster();
  const installer = clusterApp ?? clusterRelease;
  return (
    <Flex direction="column" gap="6">
      <ReleaseSection />
      <LabelsSection />
      {installer && isManagedByFlux(installer) && (
        <GitOpsSection
          installer={installer}
          installationName={installationName}
        />
      )}
      <LoginSection />
      <TechnicalDetailsFoldOut defaultExpanded={false}>
        <TechnicalDetails key={cluster.getName()} />
      </TechnicalDetailsFoldOut>
    </Flex>
  );
}
