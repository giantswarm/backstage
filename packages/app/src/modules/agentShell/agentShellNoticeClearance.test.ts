// This test reads the stylesheet from disk; nothing of it is bundled.
// eslint-disable-next-line no-restricted-imports
import { readFileSync } from 'fs';
// eslint-disable-next-line no-restricted-imports
import { join } from 'path';
import {
  FLOATING_NOTICE_CLEARANCE_VAR,
  FLOATING_NOTICE_RESERVE_ATTRIBUTE,
} from '@giantswarm/backstage-plugin-ui-react';

const shellCss = readFileSync(join(__dirname, 'agent-shell.css'), 'utf8');

// The MCP server sign-in notice floats over the bottom of the view and
// publishes what it covers; the page's last content must scroll clear of it.
describe('agent-shell.css floating notice clearance', () => {
  it('reserves the room under the content area', () => {
    expect(shellCss).toMatch(
      new RegExp(
        `html\\[data-agent-shell\\] #content \\{\\s*--agent-shell-notice-clearance: var\\(${FLOATING_NOTICE_CLEARANCE_VAR}, 0px\\);\\s*padding-bottom: var\\(--agent-shell-notice-clearance\\);`,
      ),
    );
  });

  it('keeps it at phone width, on top of the home-indicator inset', () => {
    expect(shellCss).toMatch(
      /padding-bottom: calc\(\s*env\(safe-area-inset-bottom\) \+ var\(--agent-shell-notice-clearance\)\s*\);/,
    );
  });

  it('leaves it to a layout with a docked bar, which reserves it above the bar', () => {
    expect(shellCss).toContain(
      `html[data-agent-shell] #content:has([${FLOATING_NOTICE_RESERVE_ATTRIBUTE}]) {\n  --agent-shell-notice-clearance: 0px;`,
    );
  });
});
