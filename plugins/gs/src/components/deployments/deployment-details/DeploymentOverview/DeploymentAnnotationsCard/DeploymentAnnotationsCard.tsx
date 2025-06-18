import { LabelsCard } from '../../../../LabelsCard';
import { useFriendlyItemsConfiguration } from '../../../../hooks';
import { useCurrentDeployment } from '../../../DeploymentDetailsPage/useCurrentDeployment';

export function DeploymentAnnotationsCard() {
  const { deployment } = useCurrentDeployment();
  const annotations = deployment.metadata.annotations;
  const annotationsConfig =
    useFriendlyItemsConfiguration('gs.friendlyAnnotations') ?? [];

  return (
    <LabelsCard
      labels={annotations}
      labelsConfig={annotationsConfig}
      labelKind="annotation"
      title="Annotations"
      wrapItems={false}
      friendlyItemsControlLabel="Friendly annotations"
    />
  );
}
