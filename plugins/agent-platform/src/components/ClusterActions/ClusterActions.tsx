import { useMemo, useState } from 'react';
import { Button } from '@backstage/ui';
import { DisabledAction } from '@giantswarm/backstage-plugin-ui-react';
import {
  useClusterPageTarget,
  useInstallations,
  type ClusterPageTarget,
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
import { sharedIdentityReason } from '../../lib/sharedIdentity';
import { CreateClusterDialog } from '../CreateClusterDialog';
import { DeleteClusterDialog } from '../DeleteClusterDialog';

/**
 * **Create cluster** beside the Clusters list's header, where an
 * installation's muster registers a cluster-manager that offers
 * `create_cluster`. Where cluster-manager is listed only on installations
 * whose muster has no per-user sign-in, the button is there, disabled, and
 * says why; nothing elsewhere.
 */
export function CreateClusterAction() {
  const { installations } = useInstallations();
  const names = useMemo(
    () => installations.map(installation => installation.name),
    [installations],
  );
  const { available, sharedIdentity, isLoading } =
    useClusterManagerAvailability(names);
  const offering = useInstallationsOffering(
    available,
    CLUSTER_MANAGER_TOOLS.createCluster,
  );
  const [isOpen, setOpen] = useState(false);

  if (offering.length === 0) {
    if (available.length > 0 || isLoading || sharedIdentity.length === 0) {
      return null;
    }
    return (
      <DisabledAction
        reason={sharedIdentityReason(
          'Clusters are created through cluster-manager',
          sharedIdentity,
        )}
      >
        {describedBy => (
          <Button
            variant="primary"
            size="small"
            isDisabled
            aria-describedby={describedBy}
          >
            Create cluster
          </Button>
        )}
      </DisabledAction>
    );
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
 * A cluster create_cluster made — rendered by a HelmRelease of its own name in
 * its organization's namespace — and not the installation's own: the only kind
 * `delete_cluster` removes.
 */
function isDeletable(
  target: ClusterPageTarget | undefined,
): target is ClusterPageTarget {
  if (
    !target ||
    target.isManagementCluster ||
    target.name === target.installationName ||
    !target.organization
  ) {
    return false;
  }
  const namespace = `org-${target.organization}`;
  return (
    target.namespace === namespace &&
    target.helmRelease?.name === target.name &&
    target.helmRelease?.namespace === namespace
  );
}

/**
 * **Delete** beside a cluster's header, where the installation's
 * cluster-manager offers `delete_cluster` and the cluster is one it removes.
 * Where the installation's muster has no per-user sign-in, cluster-manager
 * cannot be asked, so a cluster it would remove shows Delete disabled, with
 * the reason.
 */
export function DeleteClusterAction() {
  const target = useClusterPageTarget();
  const deletable = isDeletable(target);
  const { presenceOf } = useClusterManagerAvailability(
    deletable ? [target.installationName] : [],
  );
  const presence = deletable ? presenceOf(target.installationName) : 'unknown';
  const reachable = deletable && presence === 'available';
  const { info } = useClusterManagerInfo(
    reachable ? target.installationName : undefined,
  );
  const [isOpen, setOpen] = useState(false);

  if (deletable && presence === 'sharedIdentity') {
    return (
      <DisabledAction
        reason={sharedIdentityReason(
          'Clusters are deleted through cluster-manager',
          [target.installationName],
        )}
      >
        {describedBy => (
          <Button
            variant="secondary"
            size="small"
            destructive
            isDisabled
            aria-describedby={describedBy}
          >
            Delete
          </Button>
        )}
      </DisabledAction>
    );
  }
  if (!deletable || !offersTool(info, CLUSTER_MANAGER_TOOLS.deleteCluster)) {
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
