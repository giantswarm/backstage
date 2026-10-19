import { ReactNode } from 'react';
import { makeStyles, Theme, useTheme } from '@material-ui/core';
import { Cell } from '@backstage/ui';
import type { ColumnConfig } from '@backstage/ui';
import {
  formatCount,
  formatSeconds,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  categoricalColors,
  columnMax,
  DataBar,
  usePhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react';

/** Name and Calls at phone width; every column elsewhere. */
export const PHONE_COLUMNS = ['name', 'calls'];

const useStyles = makeStyles((theme: Theme) => ({
  /** The figures a phone's table has no column for, under the name. */
  phoneFacts: {
    display: 'block',
    marginTop: 2,
    fontSize: 12,
    color: theme.palette.text.secondary,
    fontVariantNumeric: 'tabular-nums',
  },
  name: {
    // The body font, matching the personal section's tables directly above on
    // the Usage page — the same kind of value rendered two ways on one page
    // reads as a bug. `anywhere` rather than `break-all`, which split names
    // mid-word (`…resolve_cluste / r`) once the pitch stopped being fixed.
    overflowWrap: 'anywhere',
  },
  /**
   * Left-aligned, not right.
   *
   * These columns carry a `DataBar`, which grows from the left — a
   * right-aligned number over a left-anchored bar reads as two unrelated
   * things, and a mirrored bar read as inconsistent beside the left-aligned
   * tables on the Usage tab's other views. So the whole cell goes left and
   * matches them.
   */
  numeric: {
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  errorValue: {
    color: theme.palette.error.main,
  },
}));

/** What a usage table's row counts: a tool's or a connector's calls. */
export type UsageFigures = {
  id: string;
  calls: number;
  errors: number;
  p95_seconds?: number | null;
};

/**
 * The data bars' hues, one per measure.
 *
 * Slot numbers rather than an import: the agent-platform plugin keeps the
 * same measure→slot map for its own tables (`lib/measures.ts` — calls is
 * slot 0, a per-call figure slot 7), and matching it keeps "Calls" the same
 * colour across every table on the Usage tab. Importing that map would make
 * this plugin depend on agent-platform, which the whole attach-by-node-id
 * contract exists to avoid — so the two numbers are duplicated deliberately.
 * `barColors.test.ts` pins them, so drift fails CI rather than resting on
 * this comment.
 *
 * Errors takes the **status** red rather than a categorical slot: an error
 * count is a status quantity, and status colours are reserved. It ships with
 * a column header and its own figure, so it never rests on colour alone.
 */
function useBarColors() {
  const theme = useTheme();
  const palette = categoricalColors(theme);
  return {
    calls: palette[0],
    latency: palette[7],
    errors: theme.palette.error.main,
  };
}

/**
 * At phone width, a row's errors and p95 in words under its name: the table
 * keeps the name and Calls there (T22 C19), and a hidden column's value still
 * has to be on the row.
 */
function PhoneFacts({
  errors,
  p95Seconds,
}: {
  errors: number;
  p95Seconds?: number | null;
}) {
  const classes = useStyles();
  return (
    <span className={classes.phoneFacts}>
      <span className={errors > 0 ? classes.errorValue : undefined}>
        {formatCount(errors)} {errors === 1 ? 'error' : 'errors'}
      </span>
      {p95Seconds !== undefined && <> · p95 {formatSeconds(p95Seconds)}</>}
    </span>
  );
}

export type UsageColumnsOptions<T> = {
  /** The name column's header, e.g. "Top tools", "Tool", "Instance". */
  label: string;
  /** What the name cell shows: plain text, or a link. */
  renderName: (row: T) => ReactNode;
  /** Add the p95 latency column. */
  withP95?: boolean;
};

/**
 * A usage table's columns: the name, then Calls, Errors and (optionally) p95,
 * each with a data bar read against its own column's maximum, so a table
 * never borrows another's scale. `rows` are every row the table can show,
 * not only those revealed, so a bar keeps its length as more appear.
 */
export function useUsageColumns<T extends UsageFigures>(
  rows: T[],
  { label, renderName, withP95 = false }: UsageColumnsOptions<T>,
): ColumnConfig<T>[] {
  const classes = useStyles();
  const isPhone = usePhoneLayout();
  const colors = useBarColors();
  const max = {
    calls: columnMax(rows, row => row.calls),
    errors: columnMax(rows, row => row.errors),
    p95: columnMax(rows, row => row.p95_seconds ?? undefined),
  };

  const columns: ColumnConfig<T>[] = [
    {
      id: 'name',
      label,
      isRowHeader: true,
      cell: row => (
        <Cell>
          <span className={classes.name}>
            {renderName(row)}
            {isPhone && (
              <PhoneFacts
                errors={row.errors}
                p95Seconds={withP95 ? (row.p95_seconds ?? null) : undefined}
              />
            )}
          </span>
        </Cell>
      ),
    },
    {
      id: 'calls',
      label: 'Calls',
      cell: row => (
        <Cell>
          <span className={classes.numeric}>
            <DataBar
              label={formatCount(row.calls)}
              value={row.calls}
              max={max.calls}
              color={colors.calls}
            />
          </span>
        </Cell>
      ),
    },
    {
      id: 'errors',
      label: 'Errors',
      cell: row => (
        <Cell>
          <span
            className={`${classes.numeric} ${
              row.errors > 0 ? classes.errorValue : ''
            }`}
          >
            <DataBar
              label={formatCount(row.errors)}
              value={row.errors}
              max={max.errors ?? row.errors}
              color={colors.errors}
            />
          </span>
        </Cell>
      ),
    },
  ];
  if (withP95) {
    columns.push({
      id: 'p95',
      label: 'p95',
      cell: row => (
        <Cell>
          <span className={classes.numeric}>
            <DataBar
              label={formatSeconds(row.p95_seconds)}
              value={row.p95_seconds ?? undefined}
              max={max.p95}
              color={colors.latency}
            />
          </span>
        </Cell>
      ),
    });
  }
  return columns;
}
