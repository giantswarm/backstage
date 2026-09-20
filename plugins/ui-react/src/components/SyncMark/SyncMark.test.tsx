import { render, screen } from '@testing-library/react';
import { SYNC_MARKS, SyncMark, SyncMarkIcon, syncMarkLegend } from './SyncMark';

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
});

describe('syncMarkLegend', () => {
  it('lists every mark with its gloss in legend order', () => {
    expect(syncMarkLegend(GLOSS)).toBe(
      'in sync: as defined · not in sync: off its definition · not reconciled: not reconciled yet · not installed: not installed · failed: the last check failed · unknown: not readable',
    );
  });
});
