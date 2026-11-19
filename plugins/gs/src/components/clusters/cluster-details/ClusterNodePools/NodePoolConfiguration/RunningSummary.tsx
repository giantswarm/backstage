import { Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { MEASURE_TRACK, useMeasureColors } from '../../../nodePools';
import { type KarpenterNodePoolStatus } from '../../../../hooks';
import { formatResourceQuantity } from '../../../nodePools';

const useStyles = makeStyles({
  strip: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    // The card is far wider than these few figures need, so they get generous
    // separation rather than sitting bunched against the left edge.
    columnGap: 'var(--bui-space-12)',
    rowGap: 'var(--bui-space-5)',
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
    minWidth: 300,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  // A track that shows on the card's surface, as the nodes tables' bars.
  track: {
    height: 6,
    borderRadius: 3,
    background: MEASURE_TRACK,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
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
  color,
}: {
  label: string;
  used: number | undefined;
  total: number;
  resource: string;
  /** The measure's hue, the same as in the nodes table. */
  color: string;
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
        <div
          className={classes.fill}
          style={{ width: `${percent ?? 0}%`, background: color }}
        />
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
  const colors = useMeasureColors();

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
          color={colors.cpu}
          used={status?.usage?.cpu}
          total={cpuLimit}
        />
      )}
      {memoryLimit !== undefined && (
        <Meter
          label="Memory"
          resource="memory"
          color={colors.memory}
          used={status?.usage?.memory}
          total={memoryLimit}
        />
      )}
    </div>
  );
};
