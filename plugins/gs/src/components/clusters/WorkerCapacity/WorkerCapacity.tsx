import { ReactNode } from 'react';
import { makeStyles } from '@material-ui/core';
import { InfoHint } from '@giantswarm/backstage-plugin-ui-react';
import {
  WorkerCapacity as WorkerCapacityValue,
  formatWorkerCpu,
  formatWorkerMemory,
  formatWorkerNodes,
} from '../nodePools';
import { NodePoolMetricsStatus } from '../../hooks/useMimirNodePoolCapacity';

const useStyles = makeStyles(theme => ({
  // A span, not a bui Flex: the value sits inside the paragraph that
  // AboutFieldValue and table cells render.
  root: {
    display: 'inline-flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: theme.spacing(0.5),
  },
  note: {
    fontWeight: 'normal',
    color: theme.palette.text.secondary,
  },
}));

const METRICS_REASONS: Record<NodePoolMetricsStatus, string> = {
  ok: 'no node metrics were found for them',
  loading: 'node metrics are still loading',
  unavailable: 'node metrics are not available on this installation',
  error: 'node metrics could not be loaded',
};

function describeUncountedPools(
  pools: string[],
  metricsStatus: NodePoolMetricsStatus = 'ok',
): { label: string; explanation: string } {
  const label =
    pools.length === 1
      ? '1 node pool not counted'
      : `${pools.length} node pools not counted`;

  return {
    label,
    explanation: `CPU and memory leave out ${pools.join(', ')}: the machine size is unknown, and ${METRICS_REASONS[metricsStatus]}.`,
  };
}

export type WorkerCapacityProps = {
  capacity: WorkerCapacityValue;
  metricsStatus?: NodePoolMetricsStatus;
  /** `summary` shows nodes, CPU and memory; the others one figure each. */
  show?: 'summary' | 'cpu' | 'memory';
};

/**
 * A cluster's worker capacity. Pools whose CPU and memory could not be
 * counted are named in a hint, so a partial figure never reads as complete.
 */
export const WorkerCapacity = ({
  capacity,
  metricsStatus,
  show = 'summary',
}: WorkerCapacityProps) => {
  const classes = useStyles();

  let value: ReactNode;
  if (show === 'cpu') {
    value = formatWorkerCpu(capacity.vcpus);
  } else if (show === 'memory') {
    value = formatWorkerMemory(capacity.memoryBytes);
  } else if (capacity.nodes === 0) {
    return <>No ready worker nodes</>;
  } else {
    value = (
      <>
        {formatWorkerNodes(capacity.nodes)} <span aria-hidden="true">·</span>{' '}
        {formatWorkerCpu(capacity.vcpus)} <span aria-hidden="true">·</span>{' '}
        {formatWorkerMemory(capacity.memoryBytes)} RAM
      </>
    );
  }

  if (capacity.uncountedPools.length === 0) {
    return <>{value}</>;
  }

  const { label, explanation } = describeUncountedPools(
    capacity.uncountedPools,
    metricsStatus,
  );

  return (
    <span className={classes.root}>
      <span>{value}</span>
      {show === 'summary' && <span className={classes.note}>({label})</span>}
      <InfoHint
        // Beside the visible note, the button names what it reveals rather
        // than repeating the note.
        label={
          show === 'summary' ? 'Why some node pools are not counted' : label
        }
        size="medium"
      >
        {explanation}
      </InfoHint>
    </span>
  );
};
