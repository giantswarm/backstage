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
  NotAvailable,
  StructuredMetadataList,
} from '@giantswarm/backstage-plugin-ui-react';
import { Box } from '@material-ui/core';

type ReadyCondition = {
  status: string;
  lastTransitionTime?: string;
  message?: string;
};

function addCreatedMetadata(
  metadata: Record<string, any>,
  createdTimestamp: string | undefined,
) {
  metadata.Created = createdTimestamp ? (
    <DateComponent value={createdTimestamp} relative />
  ) : (
    <NotAvailable />
  );
}

function addStatusMetadata(
  metadata: Record<string, any>,
  readyCondition: ReadyCondition | undefined,
) {
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
}

const KustomizationMetadata = ({
  kustomization,
}: {
  kustomization: Kustomization;
}) => {
  const revision = kustomization.getLastAppliedRevision();
  const readyCondition = kustomization.findReadyCondition();

  const metadata: { [key: string]: any } = {};
  addCreatedMetadata(metadata, kustomization.getCreatedTimestamp());
  metadata.Path = kustomization.getPath();
  metadata.Revision = revision ? revision : <NotAvailable />;

  if (readyCondition) {
    metadata.Status = (
      <>
        Last reconciled{' '}
        <DateComponent value={readyCondition.lastTransitionTime} relative />
      </>
    );
    metadata.Message = <ConditionMessage message={readyCondition.message} />;
  } else {
    metadata.Status = 'Unknown';
  }

  return (
    <StructuredMetadataList metadata={metadata} fixedKeyColumnWidth="76px" />
  );
};

const HelmReleaseMetadata = ({ helmRelease }: { helmRelease: HelmRelease }) => {
  const readyCondition = helmRelease.findReadyCondition();
  const chartRef = helmRelease.getChartRef();
  const chartName = helmRelease.getChartName();
  const chartVersion = helmRelease.getLastAppliedRevision();
  const releaseName = helmRelease.getReleaseName();
  const targetNamespace = helmRelease.getTargetNamespace();
  const sourceRef = helmRelease.getChartSourceRef();
  const interval = helmRelease.getInterval();
  const installFailures = helmRelease.getInstallFailures();
  const upgradeFailures = helmRelease.getUpgradeFailures();

  const metadata: { [key: string]: any } = {};
  addCreatedMetadata(metadata, helmRelease.getCreatedTimestamp());

  // Chart reference (either chartRef or chart name from spec)
  if (chartRef) {
    metadata.Chart = chartRef.namespace
      ? `${chartRef.kind}/${chartRef.namespace}/${chartRef.name}`
      : `${chartRef.kind}/${chartRef.name}`;
  } else if (chartName) {
    metadata.Chart = chartName;
  }

  if (chartVersion) {
    metadata['Chart Version'] = chartVersion;
  }

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

  if (installFailures && installFailures > 0) {
    metadata['Install Failures'] = installFailures;
  }

  if (upgradeFailures && upgradeFailures > 0) {
    metadata['Upgrade Failures'] = upgradeFailures;
  }

  addStatusMetadata(metadata, readyCondition);

  return (
    <StructuredMetadataList metadata={metadata} fixedKeyColumnWidth="120px" />
  );
};

const RepositoryMetadata = ({
  repository,
}: {
  repository: GitRepository | OCIRepository | HelmRepository;
}) => {
  const metadata: { [key: string]: any } = {};
  addCreatedMetadata(metadata, repository.getCreatedTimestamp());
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

  const revision = repository.getRevision();
  if (revision) {
    metadata.Revision = revision;
  }

  const readyCondition = repository.findReadyCondition();
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
    metadata.Message = <ConditionMessage message={readyCondition.message} />;
  } else {
    metadata.Status = 'Unknown';
  }

  return (
    <StructuredMetadataList metadata={metadata} fixedKeyColumnWidth="76px" />
  );
};

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

const ImagePolicyMetadata = ({ imagePolicy }: { imagePolicy: ImagePolicy }) => {
  const readyCondition = imagePolicy.findReadyCondition();
  const imageRepositoryRef = imagePolicy.getImageRepositoryRef();
  const latestRef = imagePolicy.getLatestRef();
  const policy = imagePolicy.getPolicy();

  const metadata: { [key: string]: any } = {};
  addCreatedMetadata(metadata, imagePolicy.getCreatedTimestamp());

  metadata['Policy Type'] = formatPolicyType(policy);

  if (imageRepositoryRef) {
    metadata['Image Repository'] = imageRepositoryRef.namespace
      ? `${imageRepositoryRef.namespace}/${imageRepositoryRef.name}`
      : imageRepositoryRef.name;
  }

  if (latestRef) {
    metadata['Latest Image'] = `${latestRef.name}:${latestRef.tag}`;
  }

  addStatusMetadata(metadata, readyCondition);

  return (
    <StructuredMetadataList metadata={metadata} fixedKeyColumnWidth="110px" />
  );
};

const ImageRepositoryMetadata = ({
  imageRepository,
}: {
  imageRepository: ImageRepository;
}) => {
  const readyCondition = imageRepository.findReadyCondition();
  const image = imageRepository.getImage();
  const lastScanResult = imageRepository.getLastScanResult();
  const provider = imageRepository.getProvider();

  const metadata: { [key: string]: any } = {};
  addCreatedMetadata(metadata, imageRepository.getCreatedTimestamp());

  if (image) {
    metadata.Image = image;
  }

  if (provider && provider !== 'generic') {
    metadata.Provider = provider;
  }

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

  addStatusMetadata(metadata, readyCondition);

  return (
    <StructuredMetadataList metadata={metadata} fixedKeyColumnWidth="110px" />
  );
};

const ImageUpdateAutomationMetadata = ({
  imageUpdateAutomation,
}: {
  imageUpdateAutomation: ImageUpdateAutomation;
}) => {
  const readyCondition = imageUpdateAutomation.findReadyCondition();
  const sourceRef = imageUpdateAutomation.getSourceRef();
  const lastAutomationRunTime =
    imageUpdateAutomation.getLastAutomationRunTime();
  const git = imageUpdateAutomation.getGit();
  const updateConfig = imageUpdateAutomation.getUpdateConfig();

  const metadata: { [key: string]: any } = {};
  addCreatedMetadata(metadata, imageUpdateAutomation.getCreatedTimestamp());

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

  if (lastAutomationRunTime) {
    metadata['Last Run'] = (
      <DateComponent value={lastAutomationRunTime} relative />
    );
  }

  addStatusMetadata(metadata, readyCondition);

  return (
    <StructuredMetadataList metadata={metadata} fixedKeyColumnWidth="120px" />
  );
};

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
};

export const ResourceMetadata = ({ resource }: ResourceMetadataProps) => {
  const kind = resource.getKind();

  const renderMetadata = () => {
    switch (kind) {
      case Kustomization.kind:
        return (
          <KustomizationMetadata kustomization={resource as Kustomization} />
        );
      case HelmRelease.kind:
        return <HelmReleaseMetadata helmRelease={resource as HelmRelease} />;
      case GitRepository.kind:
      case OCIRepository.kind:
      case HelmRepository.kind:
        return (
          <RepositoryMetadata
            repository={
              resource as GitRepository | OCIRepository | HelmRepository
            }
          />
        );
      case ImagePolicy.kind:
        return <ImagePolicyMetadata imagePolicy={resource as ImagePolicy} />;
      case ImageRepository.kind:
        return (
          <ImageRepositoryMetadata
            imageRepository={resource as ImageRepository}
          />
        );
      case ImageUpdateAutomation.kind:
        return (
          <ImageUpdateAutomationMetadata
            imageUpdateAutomation={resource as ImageUpdateAutomation}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Box mt={3} px={2}>
      {renderMetadata()}
    </Box>
  );
};
