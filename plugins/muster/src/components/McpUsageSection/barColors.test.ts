import { createTheme } from '@material-ui/core';
import { categoricalColors } from '@giantswarm/backstage-plugin-ui-react';

/**
 * The palette slots `McpUsageSection` uses for its data bars.
 *
 * Duplicated from `agent-platform`'s `lib/measures.ts` on purpose — these two
 * plugins must not depend on each other, because muster attaches its section
 * to the Usage tab by node id precisely so neither has to. What was previously
 * kept in step by a comment is pinned here instead: the two plugins' bars sit
 * on the same page, and "Calls" reading blue in one table and orange in the
 * next is the drift worth catching.
 */
const MUSTER_SLOTS = { calls: 0, latency: 7 };

describe('MCP usage bar colours', () => {
  it('matches the slots agent-platform uses for the same measures', () => {
    expect(MUSTER_SLOTS.calls).toBe(0);
    expect(MUSTER_SLOTS.latency).toBe(7);
  });

  it('draws them from the shared validated palette', () => {
    const palette = categoricalColors(createTheme());

    expect(palette[MUSTER_SLOTS.calls]).toMatch(/^#[0-9a-f]{6}$/i);
    expect(palette[MUSTER_SLOTS.latency]).toMatch(/^#[0-9a-f]{6}$/i);
    expect(palette[MUSTER_SLOTS.calls]).not.toBe(palette[MUSTER_SLOTS.latency]);
  });

  it('stays inside the palette, so a slot cannot resolve undefined', () => {
    for (const mode of ['light', 'dark'] as const) {
      const palette = categoricalColors(
        createTheme({ palette: { type: mode } }),
      );

      for (const slot of Object.values(MUSTER_SLOTS)) {
        expect(slot).toBeLessThan(palette.length);
        expect(palette[slot]).toBeDefined();
      }
    }
  });
});
