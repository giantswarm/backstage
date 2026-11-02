// This test reads the stylesheet from disk; nothing of it is bundled.
// eslint-disable-next-line no-restricted-imports
import { readFileSync } from 'fs';
// eslint-disable-next-line no-restricted-imports
import { join } from 'path';
import { render } from '@testing-library/react';
import { Tab, TabList, Tabs } from '@backstage/ui';

const shellCss = readFileSync(join(__dirname, 'agent-shell.css'), 'utf8');

function renderTabs() {
  return render(
    <Tabs>
      <TabList>
        <Tab id="agents">Agents (6)</Tab>
        <Tab id="skills">Skills (12)</Tab>
        <Tab id="connectors">Connectors (4)</Tab>
        <Tab id="models">Models (1)</Tab>
      </TabList>
    </Tabs>,
  );
}

// Live round L8: at 375px the Customize tabs broke "Agents" / "(6)" over two
// lines.
describe('agent-shell.css tab strips', () => {
  it('targets class names the installed bui tabs carry', () => {
    // A renamed class in a bui upgrade would silently let the labels wrap
    // again.
    const { container } = renderTabs();

    for (const className of ['bui-Tab', 'bui-TabActive']) {
      expect(shellCss).toContain(`.${className}`);
      expect([
        className,
        container.getElementsByClassName(className).length,
      ]).not.toEqual([className, 0]);
    }
  });

  it('keeps each tab label and its count on one line', () => {
    // jsdom drops rules inside @layer, so the rule is read, not computed.
    expect(shellCss).toMatch(
      /html\[data-agent-shell\] \.bui-Tab \{\s*white-space: nowrap;/,
    );
  });

  // T72: a strip too long for a phone scrolls sideways in RouteTabs (ui-react),
  // so the stylesheet no longer wraps tabs to a second row or squeezes a
  // five-tab strip (R4) — either would fight the scrolling strip.
  it('leaves long strips to the scrolling RouteTabs: no wrap, no squeeze', () => {
    expect(shellCss).not.toMatch(/\.bui-TabList[^{]*\{[^}]*flex-wrap: wrap/);
    expect(shellCss).not.toContain('.bui-Tab:nth-child(5)');
  });
});
