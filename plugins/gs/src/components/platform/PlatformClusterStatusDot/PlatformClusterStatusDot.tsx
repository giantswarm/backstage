import {
  StatusDot,
  type StatusDotTone,
} from '@giantswarm/backstage-plugin-ui-react';
import { ClusterStatuses } from '../../clusters/ClusterStatus';
import { statusLabel } from '../PlatformClustersPanel/platformClusterColumns';

const STATUS_TONES: Record<string, StatusDotTone> = {
  [ClusterStatuses.Ready]: 'success',
  [ClusterStatuses.Creating]: 'info',
  [ClusterStatuses.Deleting]: 'neutral',
};

/**
 * A cluster's state in the Platform section, as the clusters list and the
 * cluster page say it: Ready, Creating or Deleting.
 */
export function PlatformClusterStatusDot({ status }: { status: string }) {
  return (
    <StatusDot
      tone={STATUS_TONES[status] ?? 'neutral'}
      label={statusLabel(status)}
    />
  );
}
