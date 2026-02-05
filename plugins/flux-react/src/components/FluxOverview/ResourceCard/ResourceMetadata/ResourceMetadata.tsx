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

  const metadata: { [key: string]: any } = {
    Path: kustomization.getPath(),
    Revision: revision ? revision : <NotAvailable />,
  };

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

  const metadata: { [key: string]: any } = {};

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

const RepositoryMetadata = ({
  repository,
}: {
  repository: GitRepository | OCIRepository | HelmRepository;
}) => {
  const metadata: { [key: string]: any } = {
    URL: repository.getURL(),
  };

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

const ImagePolicyMetadata = ({ imagePolicy }: { imagePolicy: ImagePolicy }) => {
  const readyCondition = imagePolicy.findReadyCondition();
  const imageRepositoryRef = imagePolicy.getImageRepositoryRef();
  const latestImage = imagePolicy.getLatestImage();

  const metadata: { [key: string]: any } = {};

  if (imageRepositoryRef) {
    metadata['Image Repository'] = imageRepositoryRef.namespace
      ? `${imageRepositoryRef.namespace}/${imageRepositoryRef.name}`
      : imageRepositoryRef.name;
  }

  if (latestImage) {
    metadata['Latest Image'] = latestImage;
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

  const metadata: { [key: string]: any } = {};

  if (image) {
    metadata.Image = image;
  }

  if (lastScanResult?.scanTime) {
    metadata['Last Scan'] = (
      <DateComponent value={lastScanResult.scanTime} relative />
    );
  }

  if (lastScanResult?.tagCount !== undefined) {
    metadata['Tags Found'] = lastScanResult.tagCount;
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

  const metadata: { [key: string]: any } = {};

  if (sourceRef) {
    metadata.Source = sourceRef.namespace
      ? `${sourceRef.kind}/${sourceRef.namespace}/${sourceRef.name}`
      : `${sourceRef.kind}/${sourceRef.name}`;
  }

  if (lastAutomationRunTime) {
    metadata['Last Run'] = (
      <DateComponent value={lastAutomationRunTime} relative />
    );
  }

  addStatusMetadata(metadata, readyCondition);

  return (
    <StructuredMetadataList metadata={metadata} fixedKeyColumnWidth="110px" />
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
