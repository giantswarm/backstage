import {
  GitRepository,
  HelmRelease,
  HelmRepository,
  ImagePolicy,
  ImageRepository,
  ImageUpdateAutomation,
  Kustomization,
  OCIRepository,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  ConditionMessage,
  DateComponent,
  ExternalLink,
  NotAvailable,
  StructuredMetadataList,
} from '@giantswarm/backstage-plugin-ui-react';
import { Box, Divider } from '@material-ui/core';
import { findHelmReleaseChartName } from '../../../../utils/findHelmReleaseChartName';
import { useGitSourceLink } from '../../../../hooks/useGitSourceLink';
import { ReactNode } from 'react';

type Metadata = { [key: string]: ReactNode };

type ReadyCondition = {
  status: string;
  lastTransitionTime?: string;
  message?: string;
};

function buildStatusMetadata(
  readyCondition: ReadyCondition | undefined,
): Metadata {
  const metadata: Metadata = {};

  if (readyCondition) {
    if (readyCondition.status === 'False') {
      metadata.Status = (
        <>
          Last reconciliation failed{' '}
          <DateComponent value={readyCondition.lastTransitionTime} relative />
        </>
      );
    } else {
      metadata.Status = (
        <>
          Last reconciled{' '}
          <DateComponent value={readyCondition.lastTransitionTime} relative />
        </>
      );
    }
    metadata.Message = (
      <ConditionMessage message={readyCondition.message ?? ''} />
    );
  } else {
    metadata.Status = 'Unknown';
  }

  return metadata;
}

// --- Kustomization ---

function getKustomizationSpec(
  kustomization: Kustomization,
  sourceUrl?: string,
): Metadata {
  const metadata: Metadata = {};
  const path = kustomization.getPath();

  metadata.Path =
    path && sourceUrl ? (
      <ExternalLink href={sourceUrl}>{path}</ExternalLink>
    ) : (
      path
    );

  const interval = kustomization.getInterval();
  if (interval) {
    metadata.Interval = interval;
  }

  const timeout = kustomization.getTimeout();
  if (timeout) {
    metadata.Timeout = timeout;
  }

  metadata.Prune = kustomization.getPrune() ? 'Yes' : 'No';
  metadata.Force = kustomization.getForce() ? 'Yes' : 'No';

  return metadata;
}

function getKustomizationStatus(
  kustomization: Kustomization,
  sourceUrl?: string,
): Metadata {
  const revision = kustomization.getLastAppliedRevision();
  const readyCondition = kustomization.findReadyCondition();

  const metadata: Metadata = {};

  if (revision) {
    metadata.Revision = sourceUrl ? (
      <ExternalLink href={sourceUrl}>{revision}</ExternalLink>
    ) : (
      revision
    );
  } else {
    metadata.Revision = <NotAvailable />;
  }

  Object.assign(metadata, buildStatusMetadata(readyCondition));

  return metadata;
}

// --- HelmRelease ---

function getHelmReleaseSpec(
  helmRelease: HelmRelease,
  ociRepository?: OCIRepository,
): Metadata {
  const chartName = findHelmReleaseChartName(helmRelease, ociRepository);
  const releaseName = helmRelease.getReleaseName();
  const targetNamespace = helmRelease.getTargetNamespace();
  const sourceRef = helmRelease.getChartSourceRef();
  const interval = helmRelease.getInterval();

  const metadata: Metadata = {};
  metadata.Chart = chartName;

  if (releaseName) {
    metadata['Release Name'] = releaseName;
  }

  if (targetNamespace) {
    metadata['Target Namespace'] = targetNamespace;
  }

  if (sourceRef) {
    metadata.Source = sourceRef.namespace
      ? `${sourceRef.kind}/${sourceRef.namespace}/${sourceRef.name}`
      : `${sourceRef.kind}/${sourceRef.name}`;
  }

  if (interval) {
    metadata.Interval = interval;
  }

  const timeout = helmRelease.getTimeout();
  if (timeout) {
    metadata.Timeout = timeout;
  }

  return metadata;
}

function getHelmReleaseStatus(helmRelease: HelmRelease): Metadata {
  const readyCondition = helmRelease.findReadyCondition();
  const chartVersion = helmRelease.getLastAppliedRevision();
  const installFailures = helmRelease.getInstallFailures();
  const upgradeFailures = helmRelease.getUpgradeFailures();

  const metadata: Metadata = {};

  if (chartVersion) {
    metadata['Chart Version'] = chartVersion;
  }

  if (installFailures && installFailures > 0) {
    metadata['Install Failures'] = installFailures;
  }

  if (upgradeFailures && upgradeFailures > 0) {
    metadata['Upgrade Failures'] = upgradeFailures;
  }

  Object.assign(metadata, buildStatusMetadata(readyCondition));

  return metadata;
}

// --- Repository (Git / OCI / Helm) ---

function getRepositorySpec(
  repository: GitRepository | OCIRepository | HelmRepository,
): Metadata {
  const metadata: Metadata = {};
  metadata.URL = repository.getURL();

  if (repository instanceof GitRepository) {
    const reference = repository.getReference();
    if (reference?.tag) {
      metadata.Tag = reference.tag;
    } else if (reference?.semver) {
      metadata.Tag = reference.semver;
    } else if (reference?.branch) {
      metadata.Branch = reference.branch;
    }
  }
  if (repository instanceof OCIRepository) {
    const reference = repository.getReference();
    if (reference?.tag) {
      metadata.Tag = reference.tag;
    } else if (reference?.semver) {
      metadata.Tag = reference.semver;
    } else if (reference?.digest) {
      metadata.Digest = reference.digest;
    }
  }

  const interval = repository.getInterval();
  if (interval) {
    metadata.Interval = interval;
  }

  const timeout = repository.getTimeout();
  if (timeout) {
    metadata.Timeout = timeout;
  }

  return metadata;
}

function getRepositoryStatus(
  repository: GitRepository | OCIRepository | HelmRepository,
  repositorySourceUrl?: string,
): Metadata {
  const readyCondition = repository.findReadyCondition();

  const metadata: Metadata = {};

  const revision = repository.getRevision();
  if (revision) {
    metadata.Revision = repositorySourceUrl ? (
      <ExternalLink href={repositorySourceUrl}>{revision}</ExternalLink>
    ) : (
      revision
    );
  }

  Object.assign(metadata, buildStatusMetadata(readyCondition));

  return metadata;
}

// --- ImagePolicy ---

function formatPolicyType(
  policy: ReturnType<ImagePolicy['getPolicy']>,
): string {
  if (!policy) {
    return 'Not configured';
  }

  if (policy.semver) {
    return `Semver: ${policy.semver.range}`;
  }
  if (policy.alphabetical) {
    return `Alphabetical (${policy.alphabetical.order ?? 'asc'})`;
  }
  if (policy.numerical) {
    return `Numerical (${policy.numerical.order ?? 'asc'})`;
  }

  return 'Unknown';
}

function getImagePolicySpec(imagePolicy: ImagePolicy): Metadata {
  const imageRepositoryRef = imagePolicy.getImageRepositoryRef();
  const policy = imagePolicy.getPolicy();

  const metadata: Metadata = {};
  metadata['Policy Type'] = formatPolicyType(policy);

  if (imageRepositoryRef) {
    metadata['Image Repository'] = imageRepositoryRef.namespace
      ? `${imageRepositoryRef.namespace}/${imageRepositoryRef.name}`
      : imageRepositoryRef.name;
  }

  return metadata;
}

function getImagePolicyStatus(imagePolicy: ImagePolicy): Metadata {
  const readyCondition = imagePolicy.findReadyCondition();
  const latestRef = imagePolicy.getLatestRef();

  const metadata: Metadata = {};

  if (latestRef) {
    metadata['Latest Image'] = `${latestRef.name}:${latestRef.tag}`;
  }

  Object.assign(metadata, buildStatusMetadata(readyCondition));

  return metadata;
}

// --- ImageRepository ---

function getImageRepositorySpec(imageRepository: ImageRepository): Metadata {
  const image = imageRepository.getImage();
  const provider = imageRepository.getProvider();
  const interval = imageRepository.getInterval();

  const metadata: Metadata = {};

  if (image) {
    metadata.Image = image;
  }

  if (provider && provider !== 'generic') {
    metadata.Provider = provider;
  }

  if (interval) {
    metadata.Interval = interval;
  }

  return metadata;
}

function getImageRepositoryStatus(imageRepository: ImageRepository): Metadata {
  const readyCondition = imageRepository.findReadyCondition();
  const lastScanResult = imageRepository.getLastScanResult();

  const metadata: Metadata = {};

  if (lastScanResult?.scanTime) {
    metadata['Last Scan'] = (
      <DateComponent value={lastScanResult.scanTime} relative />
    );
  }

  if (lastScanResult?.tagCount !== undefined) {
    metadata['Tags Found'] = lastScanResult.tagCount;
  }

  if (lastScanResult?.latestTags && lastScanResult.latestTags.length > 0) {
    metadata['Latest Tags'] = lastScanResult.latestTags.slice(0, 5).join(', ');
  }

  Object.assign(metadata, buildStatusMetadata(readyCondition));

  return metadata;
}

// --- ImageUpdateAutomation ---

function getImageUpdateAutomationSpec(
  imageUpdateAutomation: ImageUpdateAutomation,
): Metadata {
  const sourceRef = imageUpdateAutomation.getSourceRef();
  const git = imageUpdateAutomation.getGit();
  const updateConfig = imageUpdateAutomation.getUpdateConfig();

  const metadata: Metadata = {};

  if (sourceRef) {
    metadata.Source = sourceRef.namespace
      ? `${sourceRef.kind}/${sourceRef.namespace}/${sourceRef.name}`
      : `${sourceRef.kind}/${sourceRef.name}`;
  }

  if (git?.commit?.author?.email) {
    metadata['Commit Author'] = git.commit.author.name
      ? `${git.commit.author.name} <${git.commit.author.email}>`
      : git.commit.author.email;
  }

  if (git?.push?.branch) {
    metadata['Push Branch'] = git.push.branch;
  }

  if (updateConfig?.path) {
    metadata['Update Path'] = updateConfig.path;
  }

  const interval = imageUpdateAutomation.getInterval();
  if (interval) {
    metadata.Interval = interval;
  }

  return metadata;
}

function getImageUpdateAutomationStatus(
  imageUpdateAutomation: ImageUpdateAutomation,
): Metadata {
  const readyCondition = imageUpdateAutomation.findReadyCondition();
  const lastAutomationRunTime =
    imageUpdateAutomation.getLastAutomationRunTime();

  const metadata: Metadata = {};

  if (lastAutomationRunTime) {
    metadata['Last Run'] = (
      <DateComponent value={lastAutomationRunTime} relative />
    );
  }

  Object.assign(metadata, buildStatusMetadata(readyCondition));

  return metadata;
}

// --- Main component ---

type SourceUrls = {
  kustomizationSourceUrl?: string;
  repositorySourceUrl?: string;
};

function getSpecAndStatus(
  resource: ResourceMetadataProps['resource'],
  source?: ResourceMetadataProps['source'],
  sourceUrls?: SourceUrls,
): { spec: Metadata; status: Metadata } {
  const kind = resource.getKind();

  switch (kind) {
    case Kustomization.kind:
      return {
        spec: getKustomizationSpec(
          resource as Kustomization,
          sourceUrls?.kustomizationSourceUrl,
        ),
        status: getKustomizationStatus(
          resource as Kustomization,
          sourceUrls?.kustomizationSourceUrl,
        ),
      };
    case HelmRelease.kind:
      return {
        spec: getHelmReleaseSpec(
          resource as HelmRelease,
          source instanceof OCIRepository ? source : undefined,
        ),
        status: getHelmReleaseStatus(resource as HelmRelease),
      };
    case GitRepository.kind:
    case OCIRepository.kind:
    case HelmRepository.kind:
      return {
        spec: getRepositorySpec(
          resource as GitRepository | OCIRepository | HelmRepository,
        ),
        status: getRepositoryStatus(
          resource as GitRepository | OCIRepository | HelmRepository,
          sourceUrls?.repositorySourceUrl,
        ),
      };
    case ImagePolicy.kind:
      return {
        spec: getImagePolicySpec(resource as ImagePolicy),
        status: getImagePolicyStatus(resource as ImagePolicy),
      };
    case ImageRepository.kind:
      return {
        spec: getImageRepositorySpec(resource as ImageRepository),
        status: getImageRepositoryStatus(resource as ImageRepository),
      };
    case ImageUpdateAutomation.kind:
      return {
        spec: getImageUpdateAutomationSpec(resource as ImageUpdateAutomation),
        status: getImageUpdateAutomationStatus(
          resource as ImageUpdateAutomation,
        ),
      };
    default:
      return { spec: {}, status: {} };
  }
}

type ResourceMetadataProps = {
  resource:
    | Kustomization
    | HelmRelease
    | GitRepository
    | OCIRepository
    | HelmRepository
    | ImagePolicy
    | ImageRepository
    | ImageUpdateAutomation;
  source?: GitRepository | OCIRepository | HelmRepository;
  fixedKeyColumnWidth?: string;
};

export const ResourceMetadata = ({
  resource,
  source,
  fixedKeyColumnWidth = '120px',
}: ResourceMetadataProps) => {
  const kustomizationSourceUrl = useGitSourceLink({
    url: source instanceof GitRepository ? source.getURL() : undefined,
    revision:
      resource instanceof Kustomization
        ? resource.getLastAppliedRevision()
        : undefined,
    path: resource instanceof Kustomization ? resource.getPath() : undefined,
  });

  const repositorySourceUrl = useGitSourceLink({
    url: resource instanceof GitRepository ? resource.getURL() : undefined,
    revision:
      resource instanceof GitRepository ? resource.getRevision() : undefined,
  });

  const { spec, status } = getSpecAndStatus(resource, source, {
    kustomizationSourceUrl,
    repositorySourceUrl,
  });

  const hasSpec = Object.keys(spec).length > 0;
  const hasStatus = Object.keys(status).length > 0;

  return (
    <>
      {hasSpec && (
        <Box mt={2} px={2}>
          <StructuredMetadataList
            metadata={spec}
            fixedKeyColumnWidth={fixedKeyColumnWidth}
          />
        </Box>
      )}
      {hasSpec && hasStatus && (
        <Box mt={2}>
          <Divider />
        </Box>
      )}
      {hasStatus && (
        <Box mt={2} px={2}>
          <StructuredMetadataList
            metadata={status}
            fixedKeyColumnWidth={fixedKeyColumnWidth}
          />
        </Box>
      )}
    </>
  );
};
