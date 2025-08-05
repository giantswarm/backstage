import {
  GitRepository,
  HelmRelease,
  HelmRepository,
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
        Last reconciled at{' '}
        <DateComponent value={readyCondition.lastTransitionTime} />
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
        Last reconciled at{' '}
        <DateComponent value={readyCondition.lastTransitionTime} />
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
          Last reconciliation failed at{' '}
          <DateComponent value={readyCondition.lastTransitionTime} />
        </>
      );
    } else {
      metadata.Status = (
        <>
          Last reconciled at{' '}
          <DateComponent value={readyCondition.lastTransitionTime} />
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

type ResourceMetadataProps = {
  resource:
    | Kustomization
    | HelmRelease
    | GitRepository
    | OCIRepository
    | HelmRepository;
};

export const ResourceMetadata = ({ resource }: ResourceMetadataProps) => {
  return (
    <Box mt={3} px={2}>
      {resource.getKind() === Kustomization.kind ? (
        <KustomizationMetadata kustomization={resource as Kustomization} />
      ) : null}
      {resource.getKind() === HelmRelease.kind ? (
        <HelmReleaseMetadata helmRelease={resource as HelmRelease} />
      ) : null}
      {resource.getKind() === GitRepository.kind ||
      resource.getKind() === OCIRepository.kind ||
      resource.getKind() === HelmRepository.kind ? (
        <RepositoryMetadata
          repository={
            resource as GitRepository | OCIRepository | HelmRepository
          }
        />
      ) : null}
    </Box>
  );
};
