import { render, screen } from '@testing-library/react';
import {
  SYNC_MARKS,
  SyncMark,
  SyncMarkIcon,
  syncMarkIntent,
  syncMarkLegend,
  SyncMarkSkeleton,
} from './SyncMark';

const GLOSS: Record<SyncMark, string> = {
  'in sync': 'as defined',
  'not in sync': 'off its definition',
  'not reconciled': 'not reconciled yet',
  'not installed': 'not installed',
  failed: 'the last check failed',
  unknown: 'not readable',
};

describe('SyncMarkIcon', () => {
  it('carries the mark and the state, and names itself with the label alone', () => {
    render(
      <SyncMarkIcon
        mark="not reconciled"
        state="rolling out"
        label="rolling out · not reconciled yet"
        testId="cell"
      />,
    );
    const cell = screen.getByTestId('cell');
    expect(cell).toHaveAttribute('role', 'img');
    expect(cell).toHaveAttribute('data-mark', 'not reconciled');
    expect(cell).toHaveAttribute('data-state', 'rolling out');
    expect(cell).toHaveAccessibleName('rolling out · not reconciled yet');
    expect(cell).toHaveTextContent('');
  });

  it.each(SYNC_MARKS)('colours %s from a bui token', mark => {
    render(<SyncMarkIcon mark={mark} label={mark} testId={mark} />);
    // A `--bui-fg-*` custom property rather than a literal colour, so the
    // mark themes with the rest of the app.
    expect(screen.getByTestId(mark).getAttribute('style')).toMatch(
      /var\(--bui-fg-[a-z]+\)/,
    );
  });

  it('gives every mark its own glyph', () => {
    const glyphs = SYNC_MARKS.map(mark => {
      const { container, unmount } = render(
        <SyncMarkIcon mark={mark} label={mark} />,
      );
      const path = container.querySelector('svg path')?.getAttribute('d');
      unmount();
      return path;
    });
    expect(new Set(glyphs).size).toBe(SYNC_MARKS.length);
  });

  it('names the intent of each mark, for a label that stands beside the icon', () => {
    expect(SYNC_MARKS.map(syncMarkIntent)).toEqual([
      'positive',
      'warning',
      'info',
      'neutral',
      'negative',
      'neutral',
    ]);
  });
});

describe('SyncMarkSkeleton', () => {
  it('takes the box of the icon it stands in for, and says it is loading', () => {
    render(
      <div>
        <SyncMarkSkeleton testId="pending" />
        <SyncMarkIcon mark="in sync" label="in sync" testId="icon" />
      </div>,
    );
    const pending = screen.getByTestId('pending');
    const icon = screen.getByTestId('icon');
    // The same box: a table row is as tall with the one as with the other.
    const box = (el: HTMLElement) =>
      ['display', 'width', 'height', 'alignItems'].map(
        property => el.style[property as 'display'],
      );
    expect(box(pending)).toEqual(box(icon));
    // A block one line tall: the glyph overhangs the line, the row does not grow.
    expect(pending.style.display).toBe('flex');
    expect(pending.style.height).toBe('1lh');
    expect(pending).toHaveAttribute('aria-busy', 'true');
    expect(pending).not.toHaveAttribute('data-mark');
    expect(pending).toHaveTextContent('');
  });
});

describe('syncMarkLegend', () => {
  it('lists every mark with its gloss in legend order', () => {
    expect(syncMarkLegend(GLOSS)).toBe(
      'in sync: as defined · not in sync: off its definition · not reconciled: not reconciled yet · not installed: not installed · failed: the last check failed · unknown: not readable',
    );
  });
});
