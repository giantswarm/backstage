import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Flex, Text, TextField } from '@backstage/ui';
import { ConfirmDialog } from '@giantswarm/backstage-plugin-ui-react';

import type {
  GpuNodePoolRow,
  NodePoolWriteState,
} from '../../hooks/useClusterManager';
import {
  CLUSTER_MANAGER_SERVER,
  type NodePoolWriteResult,
} from '../../lib/clusterManager';
import type { ServedModel } from '../../lib/serving';
import { CommitOutcome } from '../CommitOutcome';
import { ConnectAgentManagerAlert } from '../ConnectAgentManagerAlert';

/**
 * The models served on a cluster, from the served-models list the Serving page
 * fetches: KServe models of the pool's installation whose endpoint hosts name
 * the cluster (`models.<cluster>.<domain>`), and — a model without any host
 * information cannot be placed — those the portal cannot rule out.
 */
export function servedModelsOnCluster(
  models: ServedModel[],
  installation: string,
  cluster: string,
): ServedModel[] {
  const marker = `.${cluster}.`;
  return models.filter(model => {
    if (model.installation !== installation || model.backend !== 'kserve') {
      return false;
    }
    const hosts = [
      ...(model.endpointHosts ?? []),
      model.externalUrl ?? '',
      model.internalUrl ?? '',
    ].filter(Boolean);
    return hosts.length === 0 || hosts.some(host => host.includes(marker));
  });
}

export type RemoveGpuNodePoolDialogProps = {
  row: GpuNodePoolRow | undefined;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  write: NodePoolWriteState;
  /** The served models the Serving page already fetched, all installations. */
  servedModels: ServedModel[];
  /** cluster-manager reports `modes.commit`: a removal PR is offered too. */
  canCommit: boolean;
  onRemoved?: (result: NodePoolWriteResult) => void;
};

/**
 * Remove pool — a name-typing confirm that shows what the person cannot work
 * out alone: the models served on that cluster by name, and, once
 * `delete_node_pool` refuses, the nodes the pool still runs. `force` is
 * offered only after that refusal; a refusal that is not the replicas guard is
 * shown verbatim. With the cluster's last pool the operator release
 * cluster-manager created and the registered backend go too.
 */
export function RemoveGpuNodePoolDialog({
  row,
  isOpen,
  onOpenChange,
  write,
  servedModels,
  canCommit,
  onRemoved,
}: RemoveGpuNodePoolDialogProps) {
  const [typed, setTyped] = useState('');
  const [force, setForce] = useState(false);
  const [committed, setCommitted] = useState<NodePoolWriteResult>();

  useEffect(() => {
    if (!isOpen) {
      setTyped('');
      setForce(false);
      setCommitted(undefined);
      write.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!row) {
    return null;
  }

  const { failure, isBusy } = write;
  const notConnected = failure?.kind === 'not-connected';
  const guard = failure?.guard;
  const served = servedModelsOnCluster(
    servedModels,
    row.installation,
    row.cluster.name,
  );
  const input = {
    cluster: row.cluster.name,
    namespace: row.cluster.namespace,
    name: row.poolName,
  };

  const onConfirm = async () => {
    try {
      const result = await write.remove(input, { mode: 'apply', force });
      onRemoved?.(result);
      onOpenChange(false);
    } catch {
      // Shown from `write.failure`.
    }
  };

  const onCommit = async () => {
    try {
      setCommitted(await write.remove(input, { mode: 'commit', force }));
    } catch {
      // Shown from `write.failure`.
    }
  };

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={`Remove pool "${row.pool.name}"?`}
      destructive
      confirmLabel={force ? 'Remove pool and its nodes' : 'Remove pool'}
      busyLabel="Removing…"
      isBusy={isBusy}
      isConfirmDisabled={typed !== row.pool.name}
      // cluster-manager's refusal, verbatim — unless it is the replicas guard,
      // which is laid out below with the nodes it names.
      error={failure && !notConnected && !guard ? failure.message : undefined}
      onConfirm={onConfirm}
    >
      <Flex direction="column" gap="3">
        <Text variant="body-medium">
          Removes the pool's release from {row.cluster.name} on{' '}
          {row.installation}; helm-controller uninstalls the MachinePool and its
          nodes. The GPU capacity the models served on this cluster run on goes
          with it.
        </Text>
        <Flex direction="column" gap="1" data-testid="served-models">
          <Text variant="body-small" color="secondary">
            {served.length === 0
              ? 'No model served on this cluster is known to the portal.'
              : `Models served on this cluster (${served.length}):`}
          </Text>
          {served.map(model => (
            <Text key={model.id} variant="body-small">
              {model.displayName ?? model.name}
              {model.namespace ? ` (${model.namespace})` : ''}
            </Text>
          ))}
        </Flex>
        {guard && (
          <Alert
            status="warning"
            title={`The pool still runs ${guard.count} node${guard.count === 1 ? '' : 's'}`}
            description={
              <Flex direction="column" gap="2">
                <Text variant="body-small">{guard.message}</Text>
                {guard.nodes.length > 0 && (
                  <Text variant="body-small" data-testid="guard-nodes">
                    {guard.nodes.join(', ')}
                  </Text>
                )}
                <Checkbox isSelected={force} onChange={setForce}>
                  Remove anyway — the workloads on these nodes are evicted.
                </Checkbox>
              </Flex>
            }
          />
        )}
        {notConnected && (
          <ConnectAgentManagerAlert
            installation={row.installation}
            message={failure.message}
            action="GPU node pools are removed"
            server={CLUSTER_MANAGER_SERVER}
          />
        )}
        <TextField
          label={`Type ${row.pool.name} to confirm`}
          value={typed}
          onChange={setTyped}
          isRequired
        />
        {canCommit && (
          <Flex direction="column" gap="2">
            <Text variant="body-small" color="secondary">
              Or remove it from the repository owning the cluster instead:
              cluster-manager opens a pull request as you. Where the owning
              Kustomization runs without pruning, the pull request alone deletes
              nothing — the tool says so in its answer.
            </Text>
            <div>
              <Button
                variant="secondary"
                size="small"
                isDisabled={isBusy || typed !== row.pool.name}
                onPress={onCommit}
              >
                {isBusy ? 'Committing…' : 'Commit'}
              </Button>
            </div>
            {committed && <CommitOutcome result={committed} />}
          </Flex>
        )}
      </Flex>
    </ConfirmDialog>
  );
}
