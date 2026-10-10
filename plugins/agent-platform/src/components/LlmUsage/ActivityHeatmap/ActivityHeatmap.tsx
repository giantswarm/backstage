import { useMemo } from 'react';
import { makeStyles, Theme, useTheme } from '@material-ui/core';
import { Text } from '@backstage/ui';
import { formatCount } from '../../../lib/formatNumbers';
import { UsageCard } from '../UsageCard';
import {
  formatHeatmapDay,
  HEATMAP_LEVELS,
  layoutHeatmap,
  summarizeHeatmap,
  type HeatmapDay,
} from './helpers';

/**
 * The colour steps, empty first: one hue (the categorical palette's first
 * slot, blue), light to dark — magnitude, not identity, so never a second hue.
 *
 * The four active steps are the dataviz reference's validated **ordinal**
 * ramp (`validate_palette.js --ordinal`): the lightest still clears 2:1
 * against the card, so a one-call day never vanishes into an idle one. The
 * dark column is the same hue re-stepped for MUI's dark paper (`#424242`),
 * where magnitude has to rise towards light instead — the light column's
 * deep end fails 2:1 there. Empty is a neutral grey, never a tint of the hue.
 */
const STEPS_LIGHT = ['#ecebe7', '#86b6ef', '#5598e7', '#256abf', '#104281'];
const STEPS_DARK = ['#383835', '#3987e5', '#6da7ec', '#9ec5f4', '#cde2fb'];

/** Cell edge and the gap between cells, in px — GitHub's proportions. */
const CELL = 12;
const GAP = 3;
const STEP = CELL + GAP;
/** Room for the weekday labels left of the grid and the months above it. */
const LEFT = 28;
const TOP = 16;

/** Mon, Wed, Fri — every other row, so the labels never touch. */
const WEEKDAY_LABELS: [number, string][] = [
  [0, 'Mon'],
  [2, 'Wed'],
  [4, 'Fri'],
];

const useStyles = makeStyles((theme: Theme) => ({
  layout: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: theme.spacing(2, 4),
  },
  figure: {
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
    // The grid keeps its intrinsic size and scrolls sideways rather than
    // squash, but at the widest window (90 days, 14 columns) it is ~240px —
    // inside a 375px screen with room to spare.
    maxWidth: '100%',
    overflowX: 'auto',
  },
  svg: {
    display: 'block',
    '& text': {
      fontSize: 10,
      fill: theme.palette.text.secondary,
    },
    '& rect[data-day]:hover': {
      stroke: theme.palette.text.primary,
      strokeWidth: 1,
    },
  },
  legend: {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    fontSize: 11,
    color: theme.palette.text.secondary,
    paddingLeft: LEFT,
  },
  legendWord: {
    margin: theme.spacing(0, 0.5),
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  facts: {
    margin: 0,
    display: 'grid',
    gridTemplateColumns: 'auto',
    gap: theme.spacing(1.5),
    minWidth: 140,
  },
  factLabel: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: theme.palette.text.secondary,
  },
  factValue: {
    margin: 0,
    fontSize: 14,
    fontVariantNumeric: 'tabular-nums',
  },
  factSub: {
    fontSize: 12,
    color: theme.palette.text.secondary,
  },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    margin: -1,
    padding: 0,
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
}));

export type ActivityHeatmapProps = {
  /** The card's title. */
  title: string;
  /** One entry per calendar day of the window, oldest first. */
  days: HeatmapDay[];
  /** What a day's figure counts, singular and plural. */
  noun?: { one: string; other: string };
  /** The last day is today and still filling up. */
  partialLast?: boolean;
  note?: string;
};

/**
 * A GitHub-style activity calendar: one column per week, one row per weekday,
 * each day's cell shaded by its share of the busiest day. Beside it, the three
 * figures the grid is read for — the busiest day, how many days saw any use,
 * and the daily average.
 *
 * **Never colour alone.** Every cell names its day and exact figure on hover
 * (`<title>`), the figures beside the grid carry the headline in text, the
 * grid's accessible name is a one-sentence summary, and a visually hidden
 * table lists every day — bounded by the window, so at most 90 rows.
 *
 * Days outside the list get no cell: a 3-day window is three cells, not a
 * calendar of blanks claiming idle days the window never covered.
 */
export function ActivityHeatmap({
  title,
  days,
  noun = { one: 'model call', other: 'model calls' },
  partialLast = false,
  note,
}: ActivityHeatmapProps) {
  const classes = useStyles();
  const theme = useTheme();
  const steps = theme.palette.type === 'dark' ? STEPS_DARK : STEPS_LIGHT;

  const layout = useMemo(() => layoutHeatmap(days), [days]);
  const summary = useMemo(() => summarizeHeatmap(days), [days]);
  const lastDay = days[days.length - 1]?.day;

  const count = (value: number) =>
    `${formatCount(value)} ${Math.round(value) === 1 ? noun.one : noun.other}`;
  // A quiet window averages under one a day; rounding that to "0" would say
  // nothing happened, so small averages keep one decimal (and the plural).
  const average = (value: number) =>
    value > 0 && value < 10
      ? `${value.toFixed(1)} ${noun.other}`
      : count(value);
  const dayLabel = (day: string) =>
    `${formatHeatmapDay(day)}${partialLast && day === lastDay ? ' (today, so far)' : ''}`;

  const width = LEFT + layout.weeks * STEP - GAP;
  const height = TOP + 7 * STEP - GAP;

  const ariaLabel = summary.busiest
    ? `${title}: ${count(summary.total)} over ${days.length} days, on ${summary.activeDays} of them. Busiest: ${formatHeatmapDay(summary.busiest.day)}, ${count(summary.busiest.value)}.`
    : `${title}: no ${noun.other} in these ${days.length} days.`;

  return (
    <UsageCard title={title} note={note}>
      <div className={classes.layout}>
        <figure className={classes.figure}>
          <svg
            className={classes.svg}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={ariaLabel}
          >
            {layout.monthLabels.map(({ week, label }) => (
              <text
                key={`${week}-${label}`}
                x={LEFT + week * STEP}
                y={TOP - 5}
                aria-hidden
              >
                {label}
              </text>
            ))}
            {WEEKDAY_LABELS.map(([row, label]) => (
              <text
                key={label}
                x={0}
                y={TOP + row * STEP + CELL - 2}
                aria-hidden
              >
                {label}
              </text>
            ))}
            {layout.cells.map(cell => (
              <rect
                key={cell.day}
                data-day={cell.day}
                data-level={cell.level}
                x={LEFT + cell.week * STEP}
                y={TOP + cell.weekday * STEP}
                width={CELL}
                height={CELL}
                rx={2}
                fill={steps[cell.level]}
              >
                <title>{`${dayLabel(cell.day)}: ${count(cell.value)}`}</title>
              </rect>
            ))}
          </svg>
          <div className={classes.legend} aria-hidden>
            <span className={classes.legendWord}>Less</span>
            {steps.slice(0, HEATMAP_LEVELS + 1).map(color => (
              <span
                key={color}
                className={classes.swatch}
                style={{ background: color }}
              />
            ))}
            <span className={classes.legendWord}>More</span>
          </div>
        </figure>

        <dl className={classes.facts}>
          <div>
            <dt className={classes.factLabel}>Busiest day</dt>
            <dd className={classes.factValue}>
              {summary.busiest ? formatHeatmapDay(summary.busiest.day) : '—'}
              {summary.busiest && (
                <div className={classes.factSub}>
                  {count(summary.busiest.value)}
                </div>
              )}
            </dd>
          </div>
          <div>
            <dt className={classes.factLabel}>Active days</dt>
            <dd className={classes.factValue}>
              {summary.activeDays} of {days.length}
            </dd>
          </div>
          <div>
            <dt className={classes.factLabel}>Daily average</dt>
            <dd className={classes.factValue}>
              {average(summary.dailyAverage)}
            </dd>
          </div>
        </dl>
      </div>

      <table className={classes.srOnly}>
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">
              {noun.other.charAt(0).toUpperCase() + noun.other.slice(1)}
            </th>
          </tr>
        </thead>
        <tbody>
          {days.map(entry => (
            <tr key={entry.day}>
              <th scope="row">{dayLabel(entry.day)}</th>
              <td>{formatCount(entry.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </UsageCard>
  );
}

/** The card's body when its query failed: said, not drawn as idle days. */
export function ActivityHeatmapUnavailable({ title }: { title: string }) {
  return (
    <UsageCard title={title}>
      <Text variant="body-medium" color="secondary">
        The day-by-day figures could not be loaded from the metrics store. The
        totals above are unaffected.
      </Text>
    </UsageCard>
  );
}
