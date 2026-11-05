// This test reads the stylesheet from disk; nothing of it is bundled.
// eslint-disable-next-line no-restricted-imports
import { readFileSync } from 'fs';
// eslint-disable-next-line no-restricted-imports
import { join } from 'path';

const shellCss = readFileSync(join(__dirname, 'agent-shell.css'), 'utf8');

describe('agent-shell.css page overflow', () => {
  it('never lets the shell’s page scroll sideways', () => {
    // A closing popover near the right edge stood past it for its exit
    // animation, once react-aria's scroll lock gave the scrollbar back: a
    // horizontal scrollbar shifted the page. jsdom lays nothing out, so the
    // rule is read, not computed.
    expect(shellCss).toMatch(
      /html\[data-agent-shell\] \{\s*overflow-x: clip;\s*\}/,
    );
    // Clipped, not hidden: `hidden` would make the root a scroll container
    // of its own on both axes.
    expect(shellCss).not.toMatch(
      /html\[data-agent-shell\] \{[^}]*overflow(-x)?: hidden/,
    );
  });
});
