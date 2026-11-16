import { useLayoutEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import type { ColumnConfig } from '@backstage/ui';
import {
  mockDesktopLayout,
  MockedLayout,
  mockPhoneLayout,
} from '../../testUtils/mockPhoneLayout';
import {
  MockedContainerWidth,
  mockContainerWidth,
} from '../../testUtils/mockContainerWidth';
import {
  COMPACT_LAYOUT_HYSTERESIS,
  TABLE_COLUMN_MIN_WIDTH,
  TABLE_NAME_COLUMN_MIN_WIDTH,
  tableMinWidth,
  useCompactLayout,
} from './useCompactLayout';

/** Every layout the probe committed, in order: what each paint showed. */
let committed: string[] = [];

function Probe({ minWidth = 800 }: { minWidth?: number }) {
  const [ref, isCompact] = useCompactLayout(minWidth);
  const label = isCompact ? 'compact' : 'full';
  useLayoutEffect(() => {
    committed.push(label);
  });
  return <div ref={ref}>{label}</div>;
}

describe('useCompactLayout', () => {
  let layout: MockedLayout;
  let container: MockedContainerWidth | undefined;

  beforeEach(() => {
    committed = [];
  });

  afterEach(() => {
    layout.restore();
    container?.restore();
    container = undefined;
  });

  it('is full on a desktop while nothing is laid out', () => {
    layout = mockDesktopLayout();
    render(<Probe />);
    expect(screen.getByText('full')).toBeInTheDocument();
  });

  it('measures before the first paint, so a narrow container never paints the full layout', () => {
    layout = mockDesktopLayout();
    container = mockContainerWidth(424);
    render(<Probe />);
    expect(screen.getByText('compact')).toBeInTheDocument();
    // The ref's commit and the measurement run before the browser paints;
    // the full layout committed in between is never on screen.
    expect(committed[committed.length - 1]).toBe('compact');
  });

  it('follows the container across the minimum, re-rendering only when the answer flips', () => {
    layout = mockDesktopLayout();
    container = mockContainerWidth(936);
    render(<Probe />);
    expect(screen.getByText('full')).toBeInTheDocument();

    act(() => container!.setWidth(424));
    expect(screen.getByText('compact')).toBeInTheDocument();

    const renders = committed.length;
    act(() => container!.setWidth(500));
    act(() => container!.setWidth(600));
    expect(committed.length).toBe(renders);

    act(() => container!.setWidth(800 + COMPACT_LAYOUT_HYSTERESIS));
    expect(screen.getByText('full')).toBeInTheDocument();
  });

  it('stays compact just above the minimum, so a scrollbar coming and going cannot flip it', () => {
    layout = mockDesktopLayout();
    container = mockContainerWidth(790);
    render(<Probe />);
    expect(screen.getByText('compact')).toBeInTheDocument();

    act(() => container!.setWidth(805));
    expect(screen.getByText('compact')).toBeInTheDocument();
    act(() => container!.setWidth(790));
    act(() => container!.setWidth(805));
    expect(screen.getByText('compact')).toBeInTheDocument();

    act(() => container!.setWidth(800 + COMPACT_LAYOUT_HYSTERESIS));
    expect(screen.getByText('full')).toBeInTheDocument();
    // Full, it turns compact again only below the minimum itself.
    act(() => container!.setWidth(805));
    expect(screen.getByText('full')).toBeInTheDocument();
  });

  it('is compact at phone width whatever the container measures', () => {
    layout = mockPhoneLayout();
    container = mockContainerWidth(936);
    render(<Probe />);
    expect(screen.getByText('compact')).toBeInTheDocument();
  });

  it('answers again when the minimum changes', () => {
    layout = mockDesktopLayout();
    container = mockContainerWidth(600);
    const { rerender } = render(<Probe minWidth={400} />);
    expect(screen.getByText('full')).toBeInTheDocument();
    rerender(<Probe minWidth={720} />);
    expect(screen.getByText('compact')).toBeInTheDocument();
  });
});

describe('tableMinWidth', () => {
  type Row = { id: string };
  const column = (
    id: string,
    extra: Partial<ColumnConfig<Row>> = {},
  ): ColumnConfig<Row> => ({ id, label: id, cell: () => <span />, ...extra });

  it('sums the shown columns, the name column wider', () => {
    expect(
      tableMinWidth([
        column('name', { isRowHeader: true }),
        column('status'),
        column('gpus'),
        column('hidden', { isHidden: true }),
      ]),
    ).toBe(TABLE_NAME_COLUMN_MIN_WIDTH + 2 * TABLE_COLUMN_MIN_WIDTH);
  });

  it('takes a column’s own minimum', () => {
    expect(
      tableMinWidth(
        [column('name', { isRowHeader: true }), column('actions')],
        {
          actions: 120,
        },
      ),
    ).toBe(TABLE_NAME_COLUMN_MIN_WIDTH + 120);
  });
});
