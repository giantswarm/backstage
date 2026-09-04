import { Fragment } from 'react';
import { Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { type MixEntry } from '../../../../hooks';
import { type RequirementEntry } from '../karpenter';
import { AllowedCell } from './AllowedCell';

const useStyles = makeStyles({
  grid: {
    display: 'grid',
    // Constraint | Allowed | Running. Collapses to one column on narrow
    // viewports, where each row stacks as label / allowed / running.
    // Capped rather than fr-based: a comparison is only scannable while the
    // two columns stay close enough to read across.
    gridTemplateColumns:
      'minmax(140px, 190px) minmax(220px, 400px) minmax(220px, 400px)',
    justifyContent: 'start',
    columnGap: 'var(--bui-space-6)',
    alignItems: 'baseline',
    '@media (max-width: 700px)': {
      gridTemplateColumns: '1fr',
      rowGap: 'var(--bui-space-1)',
    },
  },
  head: {
    paddingBottom: 'var(--bui-space-2)',
    borderBottom: '1px solid var(--bui-border-1)',
    '@media (max-width: 700px)': {
      display: 'none',
    },
  },
  cell: {
    paddingTop: 'var(--bui-space-2)',
    paddingBottom: 'var(--bui-space-2)',
    borderBottom: '1px solid var(--bui-border-1)',
    minWidth: 0,
    '@media (max-width: 700px)': {
      border: 'none',
      paddingTop: 0,
      paddingBottom: 0,
    },
  },
  rowEnd: {
    '@media (max-width: 700px)': {
      borderBottom: '1px solid var(--bui-border-1)',
      paddingBottom: 'var(--bui-space-3)',
      marginBottom: 'var(--bui-space-3)',
    },
  },
  // Only shown once the table has collapsed and the header row is hidden.
  inlineLabel: {
    display: 'none',
    '@media (max-width: 700px)': {
      display: 'block',
    },
  },
});

export interface EnvelopeRow {
  key: string;
  label: string;
  entry: RequirementEntry | undefined;
  /** `undefined` = no running data for this dimension; renders as a dash. */
  running: MixEntry[] | undefined;
}

interface EnvelopeTableProps {
  rows: EnvelopeRow[];
}

/** Always `count × value`, so every row of the column reads the same way. */
function formatMix(entries: MixEntry[]): string {
  return entries.map(e => `${e.count} × ${e.value}`).join(' · ');
}

/**
 * The provisioning envelope as a comparison: what the configuration allows,
 * beside what the pool is actually running. This is the shape the content
 * wants — rendering it as stacked label-over-value repeats "Allowed"/"Running"
 * on every fact and loses the comparison entirely.
 */
export const EnvelopeTable = ({ rows }: EnvelopeTableProps) => {
  const classes = useStyles();

  return (
    <div className={classes.grid}>
      <div className={classes.head}>
        <Text variant="body-small" color="secondary" weight="bold">
          Constraint
        </Text>
      </div>
      <div className={classes.head}>
        <Text variant="body-small" color="secondary" weight="bold">
          Allowed
        </Text>
      </div>
      <div className={classes.head}>
        <Text variant="body-small" color="secondary" weight="bold">
          Running
        </Text>
      </div>

      {rows.map(row => (
        <Fragment key={row.key}>
          <div className={classes.cell}>
            <Text variant="body-small" weight="bold">
              {row.label}
            </Text>
          </div>
          <div className={classes.cell}>
            <div className={classes.inlineLabel}>
              <Text variant="body-small" color="secondary">
                Allowed
              </Text>
            </div>
            <AllowedCell entry={row.entry} />
          </div>
          <div className={`${classes.cell} ${classes.rowEnd}`}>
            <div className={classes.inlineLabel}>
              <Text variant="body-small" color="secondary">
                Running
              </Text>
            </div>
            {row.running === undefined || row.running.length === 0 ? (
              <Text variant="body-small" color="secondary">
                &mdash;
              </Text>
            ) : (
              <Text variant="body-small">{formatMix(row.running)}</Text>
            )}
          </div>
        </Fragment>
      ))}
    </div>
  );
};
