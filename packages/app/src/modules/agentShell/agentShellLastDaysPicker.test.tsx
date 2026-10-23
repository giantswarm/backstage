// This test reads the stylesheet from disk; nothing of it is bundled.
// eslint-disable-next-line no-restricted-imports
import { readFileSync } from 'fs';
// eslint-disable-next-line no-restricted-imports
import { join } from 'path';
import { render, screen } from '@testing-library/react';
import {
  LAST_DAYS_PICKER_CLASS_NAMES,
  LastDaysPicker,
} from '@giantswarm/backstage-plugin-ui-react';

const shellCss = readFileSync(join(__dirname, 'agent-shell.css'), 'utf8');

describe('agent-shell.css and the Usage time range', () => {
  it('restyles the picker by the class names it renders', () => {
    // A renamed class would silently drop the shell's field box.
    render(<LastDaysPicker options={[7, 30]} value={30} onChange={() => {}} />);

    const group = screen.getByRole('radiogroup', { name: 'Time range' });
    expect(group).toHaveClass(LAST_DAYS_PICKER_CLASS_NAMES.group);
    expect(
      group.closest(`.${LAST_DAYS_PICKER_CLASS_NAMES.root}`),
    ).not.toBeNull();
    expect(shellCss).toMatch(
      new RegExp(
        `\\.${LAST_DAYS_PICKER_CLASS_NAMES.group} \\{\\s*border-radius: var\\(--agent-shell-input-radius\\);`,
      ),
    );
  });

  it('gives focus a colour of its own, apart from the selected edge', () => {
    expect(shellCss).toMatch(
      /> \.bui-ToggleButton\[data-focus-visible\] \{\s*outline-color: var\(--agent-shell-input-focus-border\);/,
    );
    expect(shellCss).toMatch(
      /> \.bui-ToggleButton\[data-selected\]:not\(\[data-disabled\]\) \{\s*color: var\(--agent-shell-link\);/,
    );
  });
});
