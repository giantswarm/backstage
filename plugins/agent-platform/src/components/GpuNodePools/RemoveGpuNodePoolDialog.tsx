import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Flex, Text, TextField } from '@backstage/ui';
import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { ConfirmDialog } from '@giantswarm/backstage-plugin-ui-react';

import type {
  GpuNodePoolRow,
  NodePoolWriteState,
} from '../../hooks/useClusterManager';
import {
  CLUSTER_MANAGER_SERVER,
  type Refusal,
  type NodePoolWriteResult,
} from '../../lib/clusterManager';
import type { ServedModel } from '../../lib/serving';
import { servingRouteRef } from '../../routes';
import { CommitOutcome } from '../CommitOutcome';
import { ConnectAgentManagerAlert } from '../ConnectAgentManagerAlert';
import { PartialWriteOutcome } from './PartialWriteOutcome';

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
  /** After an accepted, complete Remove: the teardown is under way. */
  onRemoved?: (result: NodePoolWriteResult) => void;
};

const nodes = (count: number) => `${count} ${count === 1 ? 'node' : 'nodes'}`;

/**
 * cluster-manager's structured refusal: the nodes the pool still runs, the
 * models to unload first (each a link to the Serving page), and the hint that
 * explains the wait — Karpenter removes an empty node about 10 minutes after
 * its last pod.
 */
function RefusalDetails({
  refused,
  servingPath,
}: {
  refused: Refusal;
  servingPath: string | undefined;
}) {
  return (
    <>
      {refused.nodes.length > 0 && (
        <Text
          variant="body-small"
          data-testid="refused-nodes"
          style={{ overflowWrap: 'anywhere' }}
        >
          Nodes: {refused.nodes.join(', ')}
        </Text>
      )}
      <Flex direction="column" gap="1" data-testid="refused-models">
        <Text variant="body-small">
          {refused.models.length === 0
            ? 'No model is served on this cluster: something else keeps the nodes busy.'
            : `Unload ${refused.models.length === 1 ? 'this model' : 'these models'} first, on the Serving page:`}
        </Text>
        {refused.models.map(model =>
          servingPath ? (
            <Link key={model} to={servingPath}>
              <Text as="span" variant="body-small">
                {model}
              </Text>
            </Link>
          ) : (
            <Text key={model} variant="body-small">
              {model}
            </Text>
          ),
        )}
      </Flex>
      {refused.hint && <Text variant="body-small">{refused.hint}</Text>}
    </>
  );
}

/**
 * Remove pool — a name-typing confirm that shows what the person cannot work
 * out alone: the models served on that cluster by name, and, once
 * `delete_node_pool` refuses, its structured refusal (the nodes the pool still
 * runs, the models to unload first, the hint) with **Check again**, the same
 * call without force; an answer without the block (an older cluster-manager)
 * is shown as it is, with Check again too. **Remove anyway** (`force`) is a
 * second, deliberate choice after a structured refusal, never the default. An
 * accepted Remove closes into the pool's teardown in the lifecycle panel; a
 * Remove cut short (`partial`) stays open with the pending objects and
 * **Continue**, the same call again. With the cluster's last pool the operator
 * release cluster-manager created, the registered backend and — under Remove
 * anyway — the models model-manager serves go too: cluster-manager removes
 * them with the controller's finalizer taken off, so none is left stopping
 * for good once the controller is gone.
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
  const [partial, setPartial] = useState<NodePoolWriteResult>();
  const servingRoute = useRouteRef(servingRouteRef);

  useEffect(() => {
    if (!isOpen) {
      setTyped('');
      setForce(false);
      setCommitted(undefined);
      setPartial(undefined);
      write.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!row) {
    return null;
  }

  const { failure, isBusy } = write;
  const notConnected = failure?.kind === 'not-connected';
  const refusal = failure && !notConnected ? failure : undefined;
  const refused = refusal?.refused;
  const confirmed = typed === row.pool.name;
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

  /** Remove, Check again (never force) and Continue after a partial answer: the same call. */
  const remove = async (options: { force: boolean }) => {
    try {
      const result = await write.remove(input, { mode: 'apply', ...options });
      if (result.partial) {
        setPartial(result);
        return;
      }
      setPartial(undefined);
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
      isConfirmDisabled={!confirmed || Boolean(partial)}
      onConfirm={() => remove({ force })}
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
        {refusal && (
          <Alert
            status="warning"
            data-testid="remove-refused"
            title={
              refused
                ? `cluster-manager refused: the pool still runs ${nodes(refused.nodes.length)}`
                : 'cluster-manager refused'
            }
            description={
              <Flex direction="column" gap="2">
                {refused ? (
                  <RefusalDetails
                    refused={refused}
                    servingPath={servingRoute?.()}
                  />
                ) : (
                  <Text variant="body-small">{refusal.message}</Text>
                )}
                <div>
                  <Button
                    variant="secondary"
                    size="small"
                    onPress={() => remove({ force: false })}
                    isDisabled={isBusy || !confirmed}
                  >
                    {isBusy ? 'Checking…' : 'Check again'}
                  </Button>
                </div>
                {refused && (
                  <Checkbox isSelected={force} onChange={setForce}>
                    Remove anyway — the nodes go with the pool, the workloads on
                    them are evicted, and with the cluster's last pool the
                    models the platform serves on it are removed, their weights
                    kept in the cache.
                  </Checkbox>
                )}
              </Flex>
            }
          />
        )}
        {partial && (
          <PartialWriteOutcome
            result={partial}
            action="Remove"
            onContinue={() => remove({ force })}
            isBusy={isBusy}
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
                isDisabled={isBusy || !confirmed}
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
