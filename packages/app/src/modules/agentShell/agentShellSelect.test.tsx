// This test reads the stylesheet from disk; nothing of it is bundled.
// eslint-disable-next-line no-restricted-imports
import { readFileSync } from 'fs';
// eslint-disable-next-line no-restricted-imports
import { join } from 'path';
import { render, screen } from '@testing-library/react';
import { Select } from '@backstage/ui';

const shellCss = readFileSync(join(__dirname, 'agent-shell.css'), 'utf8');

function renderOpenSelect() {
  render(
    <Select
      aria-label="Agent"
      isOpen
      options={[
        {
          title: 'Favorites',
          options: [
            { id: 'sre', label: 'SRE Agent', description: 'Investigates' },
          ],
        },
        {
          title: 'kagent',
          options: [{ id: 'docs', label: 'Docs Helper' }],
        },
      ]}
    />,
  );
  return screen.getByRole('listbox');
}

// The agent picker's options read as one dense block at bui's spacing.
describe('agent-shell.css select options', () => {
  it('targets class names the installed bui select carries', () => {
    // A renamed class in a bui upgrade would silently bring the dense rows
    // back.
    const listbox = renderOpenSelect();

    for (const className of [
      'bui-SelectItem',
      'bui-SelectItemTextContent',
      'bui-SelectSection',
    ]) {
      expect(shellCss).toContain(`.${className}`);
      expect([
        className,
        listbox.getElementsByClassName(className).length,
      ]).not.toEqual([className, 0]);
    }
  });

  it('spaces the options, their descriptions and their groups', () => {
    // jsdom drops rules inside @layer, so the rules are read, not computed.
    expect(shellCss).toMatch(
      /html\[data-agent-shell\] \.bui-SelectItem \{\s*padding-block: var\(--bui-space-1_5\);/,
    );
    expect(shellCss).toMatch(
      /html\[data-agent-shell\] \.bui-SelectItemTextContent \{\s*gap: var\(--bui-space-0_5\);/,
    );
    expect(shellCss).toMatch(
      /html\[data-agent-shell\] \.bui-SelectSection:not\(:first-child\) \{\s*margin-top: var\(--bui-space-2\);/,
    );
  });

  it('makes every option a 44px thumb target under touch', () => {
    expect(shellCss).toMatch(
      /@media \(hover: none\) and \(pointer: coarse\) \{\s*html\[data-agent-shell\] \.bui-SelectItem \{\s*min-height: 44px;/,
    );
  });
});
