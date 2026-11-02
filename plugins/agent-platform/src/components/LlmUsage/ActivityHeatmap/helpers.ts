/**
 * The arithmetic behind `ActivityHeatmap`, kept apart from the drawing so the
 * calendar layout and the colour levels are testable without an SVG.
 *
 * Every day is a UTC calendar day — the `YYYY-MM-DD` keys the usage reducers
 * produce — so the weekday a cell sits on is read in UTC too. Reading it in
 * the browser's zone would put a day on its neighbour's row for anyone west
 * of Greenwich.
 */

/** One day's figure, oldest first in any list of them. */
export type HeatmapDay = { day: string; value: number };

/** How many coloured steps sit above the empty (zero) step. */
export const HEATMAP_LEVELS = 4;

export type HeatmapCell = HeatmapDay & {
  /** Column: weeks since the Monday on or before the first day. */
  week: number;
  /** Row: 0 is Monday, 6 is Sunday (ISO order, as in most of Europe). */
  weekday: number;
  /** 0 for no activity, else 1…{@link HEATMAP_LEVELS} by share of the max. */
  level: number;
};

export type HeatmapLayout = {
  cells: HeatmapCell[];
  /** Columns the grid needs. */
  weeks: number;
  /** A month name over the column it starts in, never crowding another. */
  monthLabels: { week: number; label: string }[];
  /** The busiest day's figure, which the top colour step stands for. */
  max: number;
};

export type HeatmapSummary = {
  total: number;
  /** Days with any activity at all. */
  activeDays: number;
  /** The busiest day; the earliest of a tie. Absent when nothing happened. */
  busiest: HeatmapDay | undefined;
  /** The mean per calendar day of the window, idle days included. */
  dailyAverage: number;
};

const DAY_MS = 86_400_000;

/**
 * Fewer columns than this between two month names and they collide: two
 * columns are 30px, room for a three-letter month at the grid's 10px type.
 */
const MIN_LABEL_GAP_WEEKS = 2;

function utcDate(day: string): Date | undefined {
  const at = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(at) ? undefined : new Date(at);
}

/** Monday 0 … Sunday 6. */
function isoWeekday(date: Date): number {
  return (date.getUTCDay() + 6) % 7;
}

/**
 * The colour step for a value: 0 only for no activity at all, so a quiet day
 * with one call never reads as an idle one, then equal quarters of the
 * busiest day. Linear rather than quantile steps — the cells compare days
 * with each other, and a doubling should look like one.
 */
export function heatmapLevel(value: number, max: number): number {
  if (!(value > 0) || !(max > 0)) {
    return 0;
  }
  return Math.min(
    HEATMAP_LEVELS,
    Math.max(1, Math.ceil((value / max) * HEATMAP_LEVELS)),
  );
}

function monthName(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: 'short',
    timeZone: 'UTC',
  });
}

/**
 * Lay a run of days out as a calendar: one column per week, one row per
 * weekday. Days the list does not hold (before the first, after the last) get
 * no cell at all, so a 3-day window is three cells, not a week of blanks.
 * A day key that does not parse is dropped rather than misplaced.
 */
export function layoutHeatmap(days: HeatmapDay[]): HeatmapLayout {
  const dated = days
    .map(entry => ({ entry, date: utcDate(entry.day) }))
    .filter(
      (item): item is { entry: HeatmapDay; date: Date } =>
        item.date !== undefined,
    );
  if (dated.length === 0) {
    return { cells: [], weeks: 0, monthLabels: [], max: 0 };
  }

  const first = dated[0].date;
  const gridStart = first.getTime() - isoWeekday(first) * DAY_MS;
  const max = dated.reduce(
    (acc, { entry }) => (entry.value > acc ? entry.value : acc),
    0,
  );

  const cells: HeatmapCell[] = dated.map(({ entry, date }) => ({
    ...entry,
    week: Math.floor((date.getTime() - gridStart) / DAY_MS / 7),
    weekday: isoWeekday(date),
    level: heatmapLevel(entry.value, max),
  }));
  const weeks = cells[cells.length - 1].week + 1;

  // The first column is named after the month it opens in, every later one
  // after a month whose 1st it holds. When the first column's name would sit
  // right beside the next month's, the real month start wins.
  const monthLabels: HeatmapLayout['monthLabels'] = [
    { week: 0, label: monthName(first) },
  ];
  for (const { entry, date } of dated.slice(1)) {
    if (date.getUTCDate() !== 1) {
      continue;
    }
    const week = cells.find(cell => cell.day === entry.day)!.week;
    const last = monthLabels[monthLabels.length - 1];
    const label = { week, label: monthName(date) };
    if (week - last.week >= MIN_LABEL_GAP_WEEKS) {
      monthLabels.push(label);
    } else if (last.week === 0 && monthLabels.length === 1) {
      monthLabels[0] = label;
    }
  }

  return { cells, weeks, monthLabels, max };
}

/** The figures beside the grid, and the summary a screen reader hears. */
export function summarizeHeatmap(days: HeatmapDay[]): HeatmapSummary {
  let total = 0;
  let activeDays = 0;
  let busiest: HeatmapDay | undefined;
  for (const entry of days) {
    total += entry.value;
    if (entry.value > 0) {
      activeDays += 1;
      if (!busiest || entry.value > busiest.value) {
        busiest = entry;
      }
    }
  }
  return {
    total,
    activeDays,
    busiest,
    dailyAverage: days.length > 0 ? total / days.length : 0,
  };
}

/** `2026-10-07` as `Wed, 7 Oct` — a day inside a window needs no year. */
export function formatHeatmapDay(day: string): string {
  const date = utcDate(day);
  if (!date) {
    return day;
  }
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}
