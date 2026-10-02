import { useMemo, useState } from 'react';
import { Button } from '@backstage/ui';
import {
  useClusterPageTarget,
  useInstallations,
} from '@giantswarm/backstage-plugin-gs';

import {
  useClusterManagerAvailability,
  useClusterManagerInfo,
  useInstallationsOffering,
} from '../../hooks/useClusterManager';
import {
  CLUSTER_MANAGER_TOOLS,
  offersCommit,
  offersTool,
} from '../../lib/clusterManager';
import { CreateClusterDialog } from '../CreateClusterDialog';
import { DeleteClusterDialog } from '../DeleteClusterDialog';

/**
 * **Create cluster** beside the Clusters list's header, where an
 * installation's muster registers a cluster-manager that offers
 * `create_cluster`; nothing elsewhere.
 */
export function CreateClusterAction() {
  const { installations } = useInstallations();
  const names = useMemo(
    () => installations.map(installation => installation.name),
    [installations],
  );
  const { available } = useClusterManagerAvailability(names);
  const offering = useInstallationsOffering(
    available,
    CLUSTER_MANAGER_TOOLS.createCluster,
  );
  const [isOpen, setOpen] = useState(false);

  if (offering.length === 0) {
    return null;
  }
  return (
    <>
      <Button variant="primary" size="small" onPress={() => setOpen(true)}>
        Create cluster
      </Button>
      <CreateClusterDialog
        isOpen={isOpen}
        onOpenChange={setOpen}
        installations={offering}
      />
    </>
  );
}

/**
 * **Delete** beside a cluster's header, where the installation's
 * cluster-manager offers `delete_cluster`; never on the installation's own
 * cluster, which it refuses.
 */
export function DeleteClusterAction() {
  const target = useClusterPageTarget();
  const { presenceOf } = useClusterManagerAvailability(
    target ? [target.installationName] : [],
  );
  const reachable =
    Boolean(target) && presenceOf(target!.installationName) === 'available';
  const { info } = useClusterManagerInfo(
    reachable ? target!.installationName : undefined,
  );
  const [isOpen, setOpen] = useState(false);

  if (
    !target ||
    target.isManagementCluster ||
    !target.organization ||
    !offersTool(info, CLUSTER_MANAGER_TOOLS.deleteCluster)
  ) {
    return null;
  }
  return (
    <>
      <Button
        variant="secondary"
        size="small"
        destructive
        onPress={() => setOpen(true)}
      >
        Delete
      </Button>
      <DeleteClusterDialog
        isOpen={isOpen}
        onOpenChange={setOpen}
        installation={target.installationName}
        organization={target.organization}
        name={target.name}
        commitOffered={offersCommit(info, CLUSTER_MANAGER_TOOLS.deleteCluster)}
      />
    </>
  );
}
