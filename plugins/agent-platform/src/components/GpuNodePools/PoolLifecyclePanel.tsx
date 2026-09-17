import { useMemo } from 'react';
import { ButtonIcon, Flex, Text } from '@backstage/ui';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import CloseIcon from '@material-ui/icons/Close';

import type { GpuNodePoolRow } from '../../hooks/useClusterManager';
import type { NodePoolWriteResult } from '../../lib/clusterManager';
import type { LifecycleStep } from '../../lib/lifecycle';
import {
  poolLifecycleSteps,
  poolPhase,
  poolPhaseLabel,
  poolTeardownSteps,
} from '../../lib/poolLifecycle';
import { servingRouteRef } from '../../routes';
import { LifecycleSteps } from '../LifecycleSteps';

/** The pool whose lifecycle panel is open: Deploy's result, or a row's chevron. */
export type OpenedPool = {
  /** `<installation>/<cluster>/<cluster>-<pool>`, the row id. */
  id: string;
  installation: string;
  cluster: string;
  /** The pool name as given to `create_node_pool`. */
  poolName: string;
  /** Deploy's answer, when the panel opened from it: the objects stay readable here. */
  applied?: NodePoolWriteResult;
  /** Remove's answer, when the panel opened from an accepted Remove: the teardown's objects. */
  removed?: NodePoolWriteResult;
  /** RFC3339: when that Remove was accepted. */
  removedAt?: string;
};

export type PoolLifecyclePanelProps = {
  opened: OpenedPool;
  /** The pool's row, once `list_node_pools` lists it. */
  row: GpuNodePoolRow | undefined;
  onClose: () => void;
};

export const SERVE_FIRST_MODEL = 'Serve your first model';

/**
 * The link contract with the Serving page: `serve=1` opens the Serve flow with
 * the installation, cluster and pool preselected (giantswarm/backstage#2415).
 */
export function serveFirstModelHref(
  servingPath: string,
  opened: Pick<OpenedPool, 'installation' | 'cluster' | 'poolName'>,
): string {
  const params = new URLSearchParams({
    serve: '1',
    installation: opened.installation,
    cluster: opened.cluster,
    pool: opened.poolName,
  });
  return `${servingPath}?${params.toString()}`;
}

/**
 * What happens underneath after Deploy and after Remove, per pool. After
 * Deploy: the lifecycle steps from `list_node_pools` and `list_clusters`,
 * ending in **Serve your first model** once every step is done. After Remove
 * (or while cluster-manager reports `removing`): the teardown's groups from
 * the delete's answer, in progress while `list_node_pools` still lists their
 * objects as pending, until the pool is gone from the list. Opened by Deploy
 * or Remove (their objects stay listed here) or by the row's chevron; the
 * reads keep coming while the pool is unsettled, so the steps turn done as the
 * managers report them.
 */
export function PoolLifecyclePanel({
  opened,
  row,
  onClose,
}: PoolLifecyclePanelProps) {
  const servingRoute = useRouteRef(servingRouteRef);
  const phase = row ? poolPhase(row.pool, row.cluster) : undefined;
  const removing = Boolean(opened.removed) || phase === 'removing';
  const steps = useMemo<LifecycleStep[]>(() => {
    if (removing) {
      // Until cluster-manager reports the teardown, every object of the
      // delete's answer is still assumed present.
      let pending = row?.pool.pending ?? [];
      if (row && phase !== 'removing') {
        pending = opened.removed?.objects ?? [];
      }
      return poolTeardownSteps({
        cluster: opened.cluster,
        poolName: opened.poolName,
        removed: opened.removed,
        removedAt: opened.removedAt,
        pending,
        gone: !row,
      });
    }
    if (!row) {
      return [];
    }
    const lifecycle = poolLifecycleSteps(row.pool, row.cluster);
    const allDone = lifecycle.every(step => step.state === 'done');
    const serve: LifecycleStep = {
      id: 'serve',
      title: SERVE_FIRST_MODEL,
      state: allDone ? 'done' : 'pending',
      message: allDone
        ? 'the pool, the operator and the serving stack are ready'
        : 'once the steps above are done',
      action: servingRoute
        ? {
            label: SERVE_FIRST_MODEL,
            to: serveFirstModelHref(servingRoute(), opened),
          }
        : undefined,
    };
    return [...lifecycle, serve];
  }, [row, opened, servingRoute, phase, removing]);

  const fullName = `${opened.cluster}-${opened.poolName}`;
  return (
    <Flex
      direction="column"
      gap="3"
      data-testid="pool-lifecycle"
      style={{
        border: '1px solid var(--bui-border)',
        borderRadius: 'var(--bui-radius-3)',
        padding: 'var(--bui-space-3)',
      }}
    >
      <Flex justify="between" align="center" gap="2">
        <Flex gap="2" align="baseline" style={{ flexWrap: 'wrap' }}>
          <Text as="span" variant="title-x-small">
            Pool {fullName}
          </Text>
          <Text as="span" variant="body-small" color="secondary">
            {opened.installation}
            {row && ` · ${poolPhaseLabel(row.pool, row.cluster)}`}
            {!row && opened.removed && ' · removed'}
          </Text>
        </Flex>
        <ButtonIcon
          size="small"
          variant="tertiary"
          icon={<CloseIcon />}
          aria-label={`Close lifecycle of pool ${fullName}`}
          onPress={onClose}
        />
      </Flex>
      {row || removing ? (
        <LifecycleSteps
          steps={steps}
          aria-label={`Lifecycle of pool ${fullName}`}
        />
      ) : (
        <Text as="p" variant="body-small" color="secondary">
          cluster-manager does not list the pool yet — the first read after
          Deploy follows in a moment.
        </Text>
      )}
      {!row && opened.removed && (
        <Text
          as="p"
          variant="body-small"
          color="secondary"
          data-testid="pool-removed"
        >
          The pool is gone: cluster-manager no longer lists it.
        </Text>
      )}
      {opened.applied && (
        <Text
          as="p"
          variant="body-small"
          color="secondary"
          data-testid="applied-objects"
          style={{ overflowWrap: 'anywhere' }}
        >
          Applied as you:{' '}
          {opened.applied.objects
            .map(object => `${object.kind} ${object.name}: ${object.action}`)
            .join(' · ')}
        </Text>
      )}
    </Flex>
  );
}
