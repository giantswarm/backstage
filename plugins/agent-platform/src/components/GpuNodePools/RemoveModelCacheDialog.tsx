import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Flex, Text } from '@backstage/ui';
import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { ConfirmDialog } from '@giantswarm/backstage-plugin-ui-react';

import type {
  ModelCacheRow,
  NodePoolWriteState,
} from '../../hooks/useClusterManager';
import {
  CLUSTER_MANAGER_SERVER,
  describeClaimSize,
  describeMonthlyPrice,
  describePriceSource,
  type NodePoolWriteResult,
  type Refusal,
} from '../../lib/clusterManager';
import type { ServedModel } from '../../lib/serving';
import { servingRouteRef } from '../../routes';
import { ConnectAgentManagerAlert } from '../ConnectAgentManagerAlert';
import { PartialWriteOutcome } from './PartialWriteOutcome';
import { servedModelsOnCluster } from './RemoveGpuNodePoolDialog';

export type RemoveModelCacheDialogProps = {
  row: ModelCacheRow | undefined;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  write: NodePoolWriteState;
  /** The served models the Serving page already fetched, all installations. */
  servedModels: ServedModel[];
  /** After an accepted, complete Remove. */
  onRemoved?: (row: ModelCacheRow, result: NodePoolWriteResult) => void;
};

/** What the person acknowledges before the cache goes. */
export const ACKNOWLEDGE_LOSS =
  'Remove the cached weights and compiled graphs of every model served from it; the next start of each model downloads and compiles again (about 90 s more).';

/**
 * cluster-manager's structured refusal: the served models whose predictors
 * mount the claim, each a link to the Serving page to unload it first, and
 * the hint.
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
      <Flex direction="column" gap="1" data-testid="refused-models">
        <Text variant="body-small">
          {refused.models.length === 0
            ? 'A pod of the serving namespace mounts the claim: it is deleted once the pod is gone.'
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
 * Remove cache — the confirm behind the Model cache card's button
 * (giantswarm/backstage#2493): what goes (the claim, its volume, the cached
 * weights and compiled graphs), what stops (the monthly price), what follows
 * (the cluster's serving slice serves from the node's disk from then on —
 * every pool of the cluster; every model served there downloads again at its
 * next start), and the models served on that cluster by name. Calls
 * `remove_model_cache` for the one claim as the person; the structured
 * refusal names the models whose predictors mount it, each a link to the
 * Serving page, with **Check again**. A Remove cut short (`partial`) stays
 * open with **Continue**, the same call again.
 */
export function RemoveModelCacheDialog({
  row,
  isOpen,
  onOpenChange,
  write,
  servedModels,
  onRemoved,
}: RemoveModelCacheDialogProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [partial, setPartial] = useState<NodePoolWriteResult>();
  const servingRoute = useRouteRef(servingRouteRef);

  useEffect(() => {
    if (!isOpen) {
      setAcknowledged(false);
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
  const { claim, cluster, installation } = row;
  const served = servedModelsOnCluster(
    servedModels,
    installation,
    cluster.name,
  );
  const size = describeClaimSize(claim);
  const price = describeMonthlyPrice(claim.price);
  const input = {
    cluster: cluster.name,
    namespace: cluster.namespace,
    claim: claim.name,
  };

  /** Remove, Check again and Continue after a partial answer: the same call. */
  const remove = async () => {
    try {
      const result = await write.removeCache(input, { mode: 'apply' });
      if (result.partial) {
        setPartial(result);
        return;
      }
      setPartial(undefined);
      onRemoved?.(row, result);
      onOpenChange(false);
    } catch {
      // Shown from `write.failure`.
    }
  };

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={`Remove the model cache ${claim.name} on ${cluster.name}?`}
      destructive
      confirmLabel="Remove cache"
      busyLabel="Removing…"
      isBusy={isBusy}
      isConfirmDisabled={!acknowledged || Boolean(partial)}
      onConfirm={remove}
    >
      <Flex direction="column" gap="3">
        <Text variant="body-medium" data-testid="remove-cache-what">
          Deletes claim {claim.namespace}/{claim.name}
          {size
            ? ` (${size}${claim.zone ? `, ${claim.zone}` : ''})`
            : ''} on {cluster.name} of {installation}, with its volume
          {claim.reclaimPolicy === 'Retain'
            ? "'s claim only — its volume is kept by its class (Retain) and stays billed until deleted by hand"
            : ''}
          .{' '}
          {price
            ? `The ${price} at list prices stops.`
            : (describePriceSource(claim) ?? '')}
        </Text>
        <Text variant="body-small" color="secondary">
          {claim.mounted
            ? "The cluster's serving slice mounts this claim: it switches to serve from the node's disk — every pool of the cluster — and every model served on the cluster downloads and compiles again at its next start. A later pool with the cache on creates the claim anew."
            : 'Nothing mounts this claim: the serving slice is not changed. A later pool with the cache on creates the claim anew.'}
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
            data-testid="remove-cache-refused"
            title={
              refused
                ? 'cluster-manager refused: the cache is in use'
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
                    onPress={remove}
                    isDisabled={isBusy || !acknowledged}
                  >
                    {isBusy ? 'Checking…' : 'Check again'}
                  </Button>
                </div>
              </Flex>
            }
          />
        )}
        {partial && (
          <PartialWriteOutcome
            result={partial}
            action="Remove"
            onContinue={remove}
            isBusy={isBusy}
          />
        )}
        {notConnected && (
          <ConnectAgentManagerAlert
            installation={installation}
            message={failure.message}
            action="the model cache is removed"
            server={CLUSTER_MANAGER_SERVER}
          />
        )}
        <Checkbox isSelected={acknowledged} onChange={setAcknowledged}>
          {ACKNOWLEDGE_LOSS}
        </Checkbox>
      </Flex>
    </ConfirmDialog>
  );
}
