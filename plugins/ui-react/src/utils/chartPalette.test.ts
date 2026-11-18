import { createTheme } from '@material-ui/core';
import { categoricalColors } from './chartPalette';

const light = categoricalColors(createTheme({ palette: { type: 'light' } }));
const dark = categoricalColors(createTheme({ palette: { type: 'dark' } }));

describe('categoricalColors', () => {
  it('re-steps the same slots for a dark surface, never a different count', () => {
    // The usage tables address slots by number in both modes; a dark column
    // one entry short would hand the last slot undefined on a dark theme only.
    expect(dark).toHaveLength(light.length);
  });

  it.each([
    ['light', light],
    ['dark', dark],
  ])('gives every %s slot a hex colour none other shares', (_mode, palette) => {
    for (const color of palette) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
    // A colour belongs to one identity; two slots alike would make two series
    // read as one.
    expect(new Set(palette).size).toBe(palette.length);
  });
});
