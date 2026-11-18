import { Flex, Text } from '@backstage/ui';
import LocalOfferOutlinedIcon from '@material-ui/icons/LocalOfferOutlined';
import {
  isManagedByFlux,
  useGitOpsSource,
} from '@giantswarm/backstage-plugin-flux-react';
import {
  App,
  HelmRelease,
  type Kustomization,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  AsyncValue,
  CodeBlock,
  CommitSha,
  DateComponent,
  ExternalLink,
  type Fact,
  FactList,
  formatLocalDay,
  GitOpsIcon,
  Mono,
  namespacedNameFacts,
  SimpleAccordion,
  StatusDot,
  type StatusDotTone,
  TechnicalDetailsFoldOut,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  ReleasePackageIcon,
  TerminalIcon,
} from '../../../assets/icons/CustomIcons';
import { useCurrentCluster } from '../../clusters/ClusterDetailsPage/useCurrentCluster';
import { useClusterControlPlane } from '../../clusters/ClusterDetailsPage/useClusterControlPlane';
import { useNewerRelease } from '../../clusters/ClusterDetailsPage/useNewerRelease';
import {
  getClusterAppName,
  getClusterAppVersion,
  getClusterReleaseProvider,
  getClusterDescription,
  getClusterReleaseVersion,
} from '../../clusters/utils';
import {
  defaultFriendlyLabelsConfiguration,
  useFriendlyItemsConfiguration,
  useHelmChartNameForDeployment,
} from '../../hooks';
import { useK8sVersionEOLDate } from '../../hooks/useK8sVersionEOLDate';
import { useLabelsWithDisplayInfo } from '../../LabelsCard/Labels/useLabelsWithDisplayInfo';
import { getKubernetesReleaseEOLStatus } from '../../utils/getKubernetesReleaseEOLStatus';
import { formatVersion, getClusterReleaseNotesURL } from '../../utils/helpers';
import { useClusterLoginCommands } from '../hooks';
import { PlatformLabelChips } from '../PlatformLabelChips';
import { PlatformPanel } from '../PlatformPanel';
import { PlatformRawChips } from '../PlatformRawChips';

/** The label column's width in this tab's fact lists, as the design has it. */
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
 * A day the data names as a calendar day, an end-of-life date of
 * `gs.kubernetesVersions` (`2027-03-28`) or a release's date (UTC midnight):
 * read as that day wherever the person is, never shifted by a timezone.
 */
function calendarDay(date: string): string {
  // The date part only: `2026-09-18T00:00:00Z` is the 18th everywhere.
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  return year && month && day
    ? formatLocalDay(new Date(year, month - 1, day), 0)
    : date;
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
  const day = calendarDay(eolDate);
  return (
    <span>
      {formatted} ·{' '}
      {eol.isEol ? (
        <Text variant="body-medium" color="warning" title={eol.message}>
          end of life since {day}
        </Text>
      ) : (
        <span title={eol.message}>supported until {day}</span>
      )}
    </span>
  );
}

/**
 * The release the cluster runs with its notes, its Kubernetes version, and a
 * newer release of its provider where there is one.
 */
function ReleasePanel() {
  const { cluster } = useCurrentCluster();
  const controlPlane = useClusterControlPlane();
  const newer = useNewerRelease();
  const release = getClusterReleaseVersion(cluster);
  const provider = getClusterReleaseProvider(cluster);
  const notes =
    release && provider
      ? getClusterReleaseNotesURL(provider, release)
      : undefined;
  const facts: Fact[] = [
    {
      label: 'Release',
      value: release ? (
        <span>
          {formatVersion(release)}
          {notes && (
            <>
              {' · '}
              <ExternalLink href={notes} display="inline">
                Release notes
              </ExternalLink>
            </>
          )}
        </span>
      ) : (
        <Absent>No release</Absent>
      ),
    },
    {
      label: 'Kubernetes',
      value: (
        <AsyncValue
          isLoading={controlPlane.isLoading}
          value={controlPlane.version}
          errorMessage={controlPlane.errorMessage}
          renderNotAvailable={<Absent>Not known yet</Absent>}
        >
          {version => <KubernetesValue version={version} />}
        </AsyncValue>
      ),
    },
  ];
  if (newer) {
    facts.push({
      label: 'Newer release',
      value: newer.date
        ? `${newer.version}, released ${calendarDay(newer.date)}`
        : newer.version,
    });
  }
  return (
    <PlatformPanel
      title="Release"
      icon={<ReleasePackageIcon fontSize="inherit" />}
    >
      <FactList facts={facts} labelWidth={LABEL_WIDTH} size="medium" />
    </PlatformPanel>
  );
}

/**
 * The labels and annotations `gs.friendlyLabels` and `gs.friendlyAnnotations`
 * name, as chips in their configured colours, and the cluster's description.
 * Left out when there is none of them; every label and annotation is in
 * Technical details.
 */
function LabelsPanel() {
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
  const chips = [...labels, ...annotations].map(item => ({
    key: item.formattedKey,
    value: item.formattedValue ?? '',
    variant: item.variant,
  }));
  if (chips.length === 0 && !description) {
    return null;
  }
  return (
    <PlatformPanel
      title="Labels and annotations"
      icon={<LocalOfferOutlinedIcon fontSize="inherit" />}
    >
      {chips.length > 0 && (
        <PlatformLabelChips items={chips} aria-label="Labels and annotations" />
      )}
      {description && (
        <FactList
          facts={[{ label: 'Cluster description', value: description }]}
          labelWidth={LABEL_WIDTH}
          size="medium"
        />
      )}
    </PlatformPanel>
  );
}

/**
 * The repository a source link points into, as its host's path names it:
 * `owner/repo`, a GitLab subgroup's `group/sub/repo`, an Azure DevOps
 * `org/project/repo`, without a trailing `.git`. The link itself where it is
 * no URL.
 */
export function repositoryOf(url: string): string {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return url;
  }
  // Where the path stops naming the repository: a GitLab `/-/…`, a GitHub
  // or Gitea `/tree/…` or `/blob/…`, a Bitbucket `/src/…`.
  const browse = path.search(/\/(?:-|tree|blob|src)\//);
  const repository = (browse >= 0 ? path.slice(0, browse) : path)
    .replace(/\/_git\//, '/')
    .replace(/\.git$/, '')
    .replace(/^\/+|\/+$/g, '');
  return repository || url;
}

const APPLIED_STATES: Record<string, { tone: StatusDotTone; label: string }> = {
  True: { tone: 'success', label: 'Applied' },
  False: { tone: 'danger', label: 'Failed' },
};
const APPLYING = { tone: 'info' as StatusDotTone, label: 'Applying' };

/**
 * The Kustomization's last apply: its Ready state, since when, and the
 * revision it applied.
 */
function LastApplied({ kustomization }: { kustomization: Kustomization }) {
  const ready = kustomization.findReadyCondition();
  const revision = kustomization.getLastAppliedRevision();
  const state = (ready?.status && APPLIED_STATES[ready.status]) || APPLYING;
  return (
    <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
      <StatusDot tone={state.tone} label={state.label} />
      <span>
        {ready?.lastTransitionTime && (
          <DateComponent value={ready.lastTransitionTime} relative />
        )}
        {revision && (
          <>
            , revision <CommitSha value={revision} />
          </>
        )}
      </span>
    </Flex>
  );
}

/**
 * Where the cluster's definition lives in Git, for a cluster whose installer
 * a Flux Kustomization applies; left out otherwise, as the classic page's
 * GitOps card is.
 */
function GitOpsPanel({
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
  // What the lookup already read: no second read of either.
  const { kustomization, gitRepository } = source.resources;
  const branch = gitRepository?.getReference()?.branch;
  const facts: Fact[] = [];
  if (source.kustomization) {
    facts.push({
      label: 'Managed by',
      value: `Flux · Kustomization ${source.kustomization.name}`,
    });
  }
  if (kustomization) {
    facts.push({
      label: 'Last applied',
      value: <LastApplied kustomization={kustomization} />,
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
        {url => (
          <span>
            <ExternalLink href={url} display="inline">
              {repositoryOf(url)}
            </ExternalLink>
            {branch && `, branch ${branch}`}
          </span>
        )}
      </AsyncValue>
    ),
  });
  return (
    <PlatformPanel
      title="GitOps delivery"
      icon={<GitOpsIcon fontSize="inherit" />}
      footnote="Changes to this cluster go through this repository."
    >
      <FactList facts={facts} labelWidth={LABEL_WIDTH} size="medium" />
    </PlatformPanel>
  );
}

/**
 * The login commands of the cluster's access section: `kubectl gs login`
 * where the installation's base domain is known, and for Giant Swarm staff
 * the Teleport command with its one-time setup. Left out when there is none.
 */
function LoginPanel() {
  const { kubectlGs, staff } = useClusterLoginCommands();
  if (!kubectlGs && !staff) {
    return null;
  }
  return (
    <PlatformPanel
      title="Work with the cluster"
      icon={<TerminalIcon fontSize="inherit" />}
    >
      {/* kubectl gs first, as the design has it and the menu copies it. */}
      {kubectlGs && (
        <Flex direction="column" gap="2">
          {staff && (
            <Text as="p" variant="body-medium" color="secondary">
              kubectl gs
            </Text>
          )}
          <CodeBlock text={kubectlGs} language="bash" />
        </Flex>
      )}
      {staff && (
        <Flex direction="column" gap="2">
          <Text as="p" variant="body-medium" color="secondary">
            Teleport, for Giant Swarm staff
          </Text>
          <CodeBlock text={staff.command} language="bash" />
          <SimpleAccordion title="How to set up tsh">
            <Flex direction="column" gap="2">
              <Text as="p" variant="body-small">
                First{' '}
                <ExternalLink href={staff.installDocsUrl} display="inline">
                  install tsh
                </ExternalLink>
                . Then run this command once:
              </Text>
              <CodeBlock text={staff.setup} language="bash" />
            </Flex>
          </SimpleAccordion>
        </Flex>
      )}
    </PlatformPanel>
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

/** "3 replicas, initialized": the control plane's machines and its state. */
function ControlPlaneValue() {
  const { cluster } = useCurrentCluster();
  const { isLoading, replicas, errorMessage } = useClusterControlPlane();
  const initialized =
    cluster.findControlPlaneInitializedCondition()?.status === 'True';
  const state = initialized ? 'initialized' : 'not initialized yet';
  return (
    <AsyncValue isLoading={isLoading} errorMessage={errorMessage} value={state}>
      {value =>
        replicas === undefined
          ? `${value[0].toUpperCase()}${value.slice(1)}`
          : `${replicas} ${replicas === 1 ? 'replica' : 'replicas'}, ${value}`
      }
    </AsyncValue>
  );
}

/** A caption over a row of raw chips, as Technical details draws them. */
function RawEntries({
  title,
  entries,
}: {
  title: string;
  entries: Record<string, string>;
}) {
  return (
    <Flex direction="column" gap="2">
      {/* The size and colour of the fact labels above it. */}
      <Text as="p" variant="body-medium">
        {title}
      </Text>
      {Object.keys(entries).length > 0 ? (
        <PlatformRawChips entries={entries} aria-label={title} />
      ) : (
        <Absent>None</Absent>
      )}
    </Flex>
  );
}

/**
 * The cluster's resource as Kubernetes has it: its namespace and name, the
 * chart that installs it, its API endpoint and control plane, what installs
 * it, then every label and annotation.
 */
function TechnicalDetails() {
  const { cluster, clusterApp, clusterRelease } = useCurrentCluster();
  const appName = getClusterAppName(cluster);
  const appVersion = getClusterAppVersion(cluster);
  const apiHost = cluster.getControlPlaneEndpoint()?.host;

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
    {
      label: 'API endpoint',
      value: apiHost ? <Mono>{apiHost}</Mono> : <Absent>Not known yet</Absent>,
    },
    { label: 'Control plane', value: <ControlPlaneValue /> },
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
  ];
  return (
    <Flex direction="column" gap="4">
      <FactList facts={facts} labelWidth={LABEL_WIDTH} size="medium" />
      <RawEntries title="Labels" entries={cluster.getLabels() ?? {}} />
      <RawEntries
        title="Annotations"
        entries={cluster.getAnnotations() ?? {}}
      />
    </Flex>
  );
}

/**
 * The cluster page's Overview tab, as the design draws it: panels for its
 * release, its friendly labels and annotations, where its definition lives
 * in Git, and how to log in, then the technical details in a fold-out.
 * Inside a `ClusterProvider` whose cluster has been read.
 */
export function PlatformClusterOverview() {
  const { clusterApp, clusterRelease, installationName } = useCurrentCluster();
  const installer = clusterApp ?? clusterRelease;
  return (
    <Flex direction="column" gap="4">
      <ReleasePanel />
      <LabelsPanel />
      {installer && isManagedByFlux(installer) && (
        <GitOpsPanel
          installer={installer}
          installationName={installationName}
        />
      )}
      <LoginPanel />
      <TechnicalDetailsFoldOut defaultExpanded={false}>
        <TechnicalDetails />
      </TechnicalDetailsFoldOut>
    </Flex>
  );
}
