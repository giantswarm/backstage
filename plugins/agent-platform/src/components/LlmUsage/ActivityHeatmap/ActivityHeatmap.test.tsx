import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  mockDesktopLayout,
  mockPhoneLayout,
  type MockedLayout,
} from '@giantswarm/backstage-plugin-ui-react';
import { ActivityHeatmap } from './ActivityHeatmap';
import {
  formatHeatmapDay,
  heatmapLevel,
  layoutHeatmap,
  summarizeHeatmap,
  type HeatmapDay,
} from './helpers';

const DAY_MS = 86_400_000;

/** `count` consecutive UTC days ending on `last`, valued by `value(i)`. */
function daysEnding(
  last: string,
  count: number,
  value: (index: number) => number,
): HeatmapDay[] {
  const end = Date.parse(`${last}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => ({
    day: new Date(end - (count - 1 - index) * DAY_MS)
      .toISOString()
      .slice(0, 10),
    value: value(index),
  }));
}

/** Three days, Fri–Sun: a busy one, an idle one, today's partial. */
const THREE_DAYS: HeatmapDay[] = [
  { day: '2026-10-09', value: 40 },
  { day: '2026-10-10', value: 0 },
  { day: '2026-10-11', value: 12 },
];

/**
 * 90 days, Tue 14 Jul – Sun 11 Oct 2026, idle every seventh day, busiest
 * last.
 */
const NINETY_DAYS = daysEnding('2026-10-11', 90, index =>
  index % 7 === 3 ? 0 : index + 1,
);

function cells(container: HTMLElement) {
  return [...container.querySelectorAll('rect[data-day]')];
}

describe('layoutHeatmap', () => {
  it('lays three days out as three cells in one week column', () => {
    const layout = layoutHeatmap(THREE_DAYS);

    expect(layout.cells).toHaveLength(3);
    expect(layout.weeks).toBe(1);
    // Fri, Sat, Sun — ISO rows 4, 5, 6.
    expect(layout.cells.map(cell => cell.weekday)).toEqual([4, 5, 6]);
    expect(layout.cells.map(cell => cell.level)).toEqual([4, 0, 2]);
    expect(layout.monthLabels).toEqual([
      { week: 0, label: expect.any(String) },
    ]);
  });

  it('lays 90 days out as 13 week columns, one cell per day', () => {
    const layout = layoutHeatmap(NINETY_DAYS);

    expect(layout.cells).toHaveLength(90);
    // Tue 14 Jul opens a six-day first column; the other 84 days are twelve
    // whole weeks, the last ending on Sunday 11 Oct.
    expect(layout.weeks).toBe(13);
    expect(layout.cells[0]).toMatchObject({ week: 0, weekday: 1 });
    expect(layout.cells[89]).toMatchObject({ week: 12, weekday: 6 });
    // Every cell has its own slot.
    const slots = new Set(layout.cells.map(c => `${c.week}:${c.weekday}`));
    expect(slots.size).toBe(90);
  });

  it('names each month over the column holding its 1st, never crowded', () => {
    const layout = layoutHeatmap(NINETY_DAYS);

    // Jul (the first column), Aug (1 Aug, week 2), Sep (week 7), Oct
    // (week 11).
    expect(layout.monthLabels.map(label => label.week)).toEqual([0, 2, 7, 11]);
  });

  it('lets a month start win over a first column right beside it', () => {
    // 29 Sep – 10 Oct: the first column opens in September, but October
    // starts one column later — two names that would collide.
    const layout = layoutHeatmap(daysEnding('2026-10-10', 12, () => 1));

    expect(layout.monthLabels).toHaveLength(1);
    expect(layout.monthLabels[0].label).toBe(
      new Date('2026-10-01T00:00:00Z').toLocaleDateString(undefined, {
        month: 'short',
        timeZone: 'UTC',
      }),
    );
  });

  it('draws nothing for no days, and drops a day it cannot parse', () => {
    expect(layoutHeatmap([])).toEqual({
      cells: [],
      weeks: 0,
      monthLabels: [],
      max: 0,
    });
    expect(
      layoutHeatmap([{ day: 'not-a-day', value: 3 }, ...THREE_DAYS]).cells,
    ).toHaveLength(3);
  });
});

describe('heatmapLevel', () => {
  it.each([
    [0, 100, 0],
    [1, 100, 1],
    [25, 100, 1],
    [26, 100, 2],
    [75, 100, 3],
    [100, 100, 4],
    [5, 0, 0],
    [Number.NaN, 100, 0],
  ])('%p of %p is step %p', (value, max, level) => {
    expect(heatmapLevel(value, max)).toBe(level);
  });
});

describe('summarizeHeatmap', () => {
  it('totals, counts active days, finds the busiest and averages per day', () => {
    expect(summarizeHeatmap(THREE_DAYS)).toEqual({
      total: 52,
      activeDays: 2,
      busiest: { day: '2026-10-09', value: 40 },
      dailyAverage: 52 / 3,
    });
  });

  it('keeps the earliest of a tie as the busiest day', () => {
    expect(
      summarizeHeatmap([
        { day: '2026-10-01', value: 5 },
        { day: '2026-10-02', value: 5 },
      ]).busiest?.day,
    ).toBe('2026-10-01');
  });
});

describe('ActivityHeatmap', () => {
  it('renders three days of data as three cells with exact figures', () => {
    const { container } = render(
      <ActivityHeatmap title="Model calls per day" days={THREE_DAYS} />,
    );

    expect(cells(container)).toHaveLength(3);
    expect(
      cells(container).map(cell => cell.getAttribute('data-level')),
    ).toEqual(['4', '0', '2']);
    // Every cell names its day and figure on hover.
    expect(
      screen.getByText(`${formatHeatmapDay('2026-10-10')}: 0 model calls`),
    ).toBeInTheDocument();
    // The figures beside the grid.
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
    expect(screen.getByText('17 model calls')).toBeInTheDocument();
    expect(
      screen.getByText(formatHeatmapDay('2026-10-09'), { selector: 'dd' }),
    ).toBeInTheDocument();
    // The table behind it, for screen readers: one row per day.
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 3);
  });

  it('renders 90 days of data as a 13-week calendar with every day', () => {
    const { container } = render(
      <ActivityHeatmap
        title="Model calls per day"
        days={NINETY_DAYS}
        partialLast
      />,
    );

    const grid = screen.getByRole('group', { name: /^Model calls per day:/ });
    expect(cells(container)).toHaveLength(90);
    // 28px of weekday labels, then 13 columns of 15px, less the last gap.
    expect(grid).toHaveAttribute('width', String(28 + 13 * 15 - 3));
    // The busiest day — the last — takes the top step; idle days the empty one.
    expect(cells(container)[89]).toHaveAttribute('data-level', '4');
    expect(
      cells(container).filter(cell => cell.getAttribute('data-level') === '0'),
    ).toHaveLength(13);
    expect(screen.getByText('77 of 90')).toBeInTheDocument();
    // Today's cell says it is still filling up.
    expect(
      within(grid).getByText(
        `${formatHeatmapDay('2026-10-11')} (today, so far): 90 model calls`,
      ),
    ).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(
      1 + 90,
    );
  });

  it('says there was nothing rather than naming a busiest day', () => {
    render(
      <ActivityHeatmap
        title="Model calls per day"
        days={THREE_DAYS.map(day => ({ ...day, value: 0 }))}
      />,
    );

    expect(
      screen.getByRole('group', {
        name: 'Model calls per day: no model calls in these 3 days.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('0 of 3')).toBeInTheDocument();
  });

  it('keeps a decimal for a daily average under ten', () => {
    render(
      <ActivityHeatmap
        title="Model calls per day"
        days={[
          { day: '2026-10-10', value: 1 },
          { day: '2026-10-11', value: 0 },
        ]}
      />,
    );

    expect(screen.getByText('0.5 model calls')).toBeInTheDocument();
  });
});

// T22 C22: a phone never hovers, so a day's figure has to be selectable.
describe('ActivityHeatmap · selecting a day', () => {
  let layout: MockedLayout | undefined;
  afterEach(() => layout?.restore());

  const caption = () =>
    document.querySelector('p[aria-live="polite"]') as HTMLElement;

  it('says a pressed day’s figure under the legend, and clears it on a second press', async () => {
    layout = mockDesktopLayout();
    const user = userEvent.setup();
    render(<ActivityHeatmap title="Model calls per day" days={THREE_DAYS} />);

    const friday = screen.getByRole('button', {
      name: `${formatHeatmapDay('2026-10-09')}: 40 model calls`,
    });
    expect(friday).toHaveAttribute('aria-pressed', 'false');
    // No hint on a desktop: the cells' hover titles say the same.
    expect(caption()).toHaveTextContent('');

    await user.click(friday);
    expect(friday).toHaveAttribute('aria-pressed', 'true');
    expect(caption()).toHaveTextContent(
      `${formatHeatmapDay('2026-10-09')}: 40 model calls`,
    );

    await user.click(friday);
    expect(friday).toHaveAttribute('aria-pressed', 'false');
    expect(caption()).toHaveTextContent('');
  });

  it('is one tab stop, and the arrow keys step through the days', async () => {
    layout = mockDesktopLayout();
    const user = userEvent.setup();
    render(
      <ActivityHeatmap
        title="Model calls per day"
        days={NINETY_DAYS}
        partialLast
      />,
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(90);
    // Only the latest day is in the tab order until another is selected.
    expect(
      buttons.filter(cell => cell.getAttribute('tabindex') === '0'),
    ).toEqual([buttons[89]]);

    await user.tab();
    expect(buttons[89]).toHaveFocus();
    // A column left is the same weekday a week earlier.
    await user.keyboard('{ArrowLeft}');
    expect(buttons[82]).toHaveFocus();
    expect(buttons[82]).toHaveAttribute('aria-pressed', 'true');
    expect(caption()).toHaveTextContent(
      `${formatHeatmapDay('2026-10-04')}: 83 model calls`,
    );
    await user.keyboard('{ArrowUp}');
    expect(buttons[81]).toHaveFocus();
    await user.keyboard('{Home}');
    expect(buttons[0]).toHaveFocus();
    expect(buttons[0]).toHaveAttribute('tabindex', '0');
    // Enter on the selected day clears it.
    await user.keyboard('{Enter}');
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'false');
  });

  it('draws bigger cells at phone width, still inside a phone-width card, and says a day can be tapped', () => {
    layout = mockPhoneLayout();
    const { container } = render(
      <ActivityHeatmap title="Model calls per day" days={NINETY_DAYS} />,
    );

    const grid = screen.getByRole('group', { name: /^Model calls per day:/ });
    // 28px of labels, then 13 columns of 16px cells and 3px gaps.
    expect(grid).toHaveAttribute('width', String(28 + 13 * 19 - 3));
    expect(Number(grid.getAttribute('width'))).toBeLessThanOrEqual(311);
    expect(cells(container)[0]).toHaveAttribute('width', '16');
    expect(caption()).toHaveTextContent('Tap a day for its figure.');

    // Back on a desktop the cells are 12px again.
    act(() => layout!.setWidth(1280));
    expect(cells(container)[0]).toHaveAttribute('width', '12');
  });
});
