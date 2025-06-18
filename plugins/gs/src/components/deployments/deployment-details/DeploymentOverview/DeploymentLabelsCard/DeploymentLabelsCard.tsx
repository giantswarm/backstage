import { LabelsCard } from '../../../../LabelsCard';
import {
  defaultFriendlyLabelsConfiguration,
  useFriendlyItemsConfiguration,
} from '../../../../hooks';
import { useCurrentDeployment } from '../../../DeploymentDetailsPage/useCurrentDeployment';

export function DeploymentLabelsCard() {
  const { deployment } = useCurrentDeployment();
  const labels = deployment.metadata.labels;
  const labelsConfig =
    useFriendlyItemsConfiguration('gs.friendlyLabels') ??
    defaultFriendlyLabelsConfiguration;

  return <LabelsCard labels={labels} labelsConfig={labelsConfig} />;
}
