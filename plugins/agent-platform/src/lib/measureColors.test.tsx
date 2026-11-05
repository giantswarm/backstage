import { render } from '@testing-library/react';
import { createTheme } from '@material-ui/core';
import { categoricalColors } from '@giantswarm/backstage-plugin-ui-react';
import {
  MEASURE_KEYS,
  measureSlot,
  useMeasureColor,
  type MeasureKey,
} from './measures';

/**
 * The columns each table renders bars for, in column order.
 *
 * The map shares a hue between measures that mean the same thing, which is
 * only safe while no table shows two of them at once — so that invariant is
 * pinned here rather than left to review.
 */
const TABLE_COLUMNS: Record<string, MeasureKey[]> = {
  'cost tab / by agent': ['calls', 'tokens', 'cost', 'ratio'],
  'cost tab / by model': [
    'calls',
    'tokens',
    'cost',
    'ratio',
    'avgTokensPerCall',
  ],
  'your sessions / by agent': [
    'sessions',
    'turns',
    'tokens',
    'outputTokens',
    'cost',
  ],
  'your sessions / top calls': ['calls'],
};

function colorsFor(): Record<string, string> {
  const seen: Record<string, string> = {};
  function Probe() {
    const colorFor = useMeasureColor();
    for (const measure of MEASURE_KEYS) {
      seen[measure] = colorFor(measure);
    }
    return null;
  }
  render(<Probe />);
  return seen;
}

describe('measure slots', () => {
  it('fits inside the validated palette', () => {
    const palette = categoricalColors(createTheme());

    for (const measure of MEASURE_KEYS) {
      expect(measureSlot(measure)).toBeLessThan(palette.length);
    }
  });

  it.each(Object.entries(TABLE_COLUMNS))(
    'gives every column of %s a distinct hue',
    (_table, columns) => {
      const slots = columns.map(measureSlot);

      expect(new Set(slots).size).toBe(columns.length);
    },
  );
});

describe('useMeasureColor', () => {
  it('draws from the validated categorical palette, in slot order', () => {
    const palette = categoricalColors(createTheme());
    const colors = colorsFor();

    for (const measure of MEASURE_KEYS) {
      expect(colors[measure]).toBe(palette[measureSlot(measure)]);
    }
  });

  it('gives every measure a hue', () => {
    const colors = colorsFor();

    for (const measure of MEASURE_KEYS) {
      expect(colors[measure]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
