import { Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { type KarpenterNodePoolStatus } from '../../../../hooks';
import { formatResourceQuantity } from './resourceFormat';

const useStyles = makeStyles({
  strip: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: 'var(--bui-space-6)',
  },
  figure: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  value: {
    fontSize: 'var(--bui-font-size-5)',
    lineHeight: 1.2,
    fontWeight: 600,
    color: 'var(--bui-fg-primary)',
    whiteSpace: 'nowrap',
  },
  meter: {
    minWidth: 260,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  track: {
    height: 4,
    borderRadius: 2,
    background: 'var(--bui-bg-neutral-2)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    background: 'var(--bui-fg-secondary)',
  },
});

function Figure({ label, value }: { label: string; value: string }) {
  const classes = useStyles();
  return (
    <div className={classes.figure}>
      <span className={classes.value}>{value}</span>
      <Text variant="body-small" color="secondary">
        {label}
      </Text>
    </div>
  );
}

function Meter({
  label,
  used,
  total,
  resource,
}: {
  label: string;
  used: number | undefined;
  total: number;
  resource: string;
}) {
  const classes = useStyles();
  const percent =
    used !== undefined && total > 0
      ? Math.min(100, Math.round((used / total) * 100))
      : undefined;

  return (
    <div className={classes.meter}>
      <Flex justify="between" align="baseline" gap="2">
        <Text variant="body-small">
          {used === undefined
            ? `${label} — / ${formatResourceQuantity(resource, total)}`
            : `${label} ${formatResourceQuantity(resource, used)} / ${formatResourceQuantity(resource, total)}`}
        </Text>
        {percent !== undefined && (
          <Text variant="body-small" color="secondary">
            {`${percent}%`}
          </Text>
        )}
      </Flex>
      <div className={classes.track}>
        <div className={classes.fill} style={{ width: `${percent ?? 0}%` }} />
      </div>
    </div>
  );
}

interface RunningSummaryProps {
  status: KarpenterNodePoolStatus | undefined;
  /** Node count from the CR, used when metrics are unavailable. */
  fallbackNodeCount: number | undefined;
}

/**
 * What the pool is doing right now — the first question a reader has, and the
 * one the configuration alone cannot answer.
 */
export const RunningSummary = ({
  status,
  fallbackNodeCount,
}: RunningSummaryProps) => {
  const classes = useStyles();

  const nodes = status?.totalNodes ?? fallbackNodeCount;
  const cpuLimit = status?.limits?.cpu;
  const memoryLimit = status?.limits?.memory;

  return (
    <div className={classes.strip}>
      {nodes !== undefined && (
        <Figure label={nodes === 1 ? 'node' : 'nodes'} value={String(nodes)} />
      )}
      {cpuLimit !== undefined && (
        <Meter
          label="CPU"
          resource="cpu"
          used={status?.usage?.cpu}
          total={cpuLimit}
        />
      )}
      {memoryLimit !== undefined && (
        <Meter
          label="Memory"
          resource="memory"
          used={status?.usage?.memory}
          total={memoryLimit}
        />
      )}
    </div>
  );
};
