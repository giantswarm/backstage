// This test reads the stylesheet from disk; nothing of it is bundled.
// eslint-disable-next-line no-restricted-imports
import { readFileSync } from 'fs';
// eslint-disable-next-line no-restricted-imports
import { join } from 'path';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
// The rule must cover MUI's own link, which legacy code still renders.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Link as MuiLink } from '@material-ui/core';
import {
  Link as CoreLink,
  LinkButton as CoreLinkButton,
} from '@backstage/core-components';
import {
  Alert,
  ButtonLink,
  Card,
  CardBody,
  Link,
  Menu,
  MenuItem,
  MenuTrigger,
  Button,
  Tab,
  TabList,
  Tabs,
  Tag,
  TagGroup,
} from '@backstage/ui';
import {
  Breadcrumbs,
  StackedRowList,
} from '@giantswarm/backstage-plugin-ui-react';
import { RailLink } from './AgentShellNav/RailLink';
import { agentShellNavItems } from './navItems';

const shellCss = readFileSync(join(__dirname, 'agent-shell.css'), 'utf8');

// The one rule for text links (agent-shell.css), applied by jsdom. jsdom
// cascades the declarations but resolves no `var()`, so a styled link reads
// the token itself; the agentlab suite checks the resolved colour.
function linkStyle(element: Element) {
  const computed = getComputedStyle(element);
  return {
    color: computed.getPropertyValue('color'),
    underline: computed.getPropertyValue('text-decoration-line'),
    offset: computed.getPropertyValue('text-underline-offset'),
  };
}

const TEXT_LINK = {
  color: 'var(--agent-shell-link)',
  underline: 'underline',
  // 0.15em, which jsdom resolves against its 16px font size.
  offset: '2.4px',
};

describe('agent-shell.css text links', () => {
  beforeEach(() => {
    const style = document.createElement('style');
    style.textContent = shellCss;
    document.head.appendChild(style);
    document.documentElement.setAttribute('data-agent-shell', '');
    document.body.setAttribute('data-theme-mode', 'light');
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-agent-shell');
    document.body.removeAttribute('data-theme-mode');
    document.head.innerHTML = '';
  });

  it('styles every text link, on a white surface, a tinted one and in a banner', () => {
    render(
      <MemoryRouter>
        <Link href="/plain">bui link</Link>
        <Link href="/secondary" color="secondary">
          bui secondary link
        </Link>
        <CoreLink to="/core">core-components link</CoreLink>
        <MuiLink href="/mui">MUI link</MuiLink>
        <Card>
          <CardBody>
            <Card>
              <CardBody>
                <Link href="/tinted">tinted link</Link>
                <CoreLink to="/tinted-core">tinted core link</CoreLink>
                <Card>
                  <CardBody>
                    <Link href="/nested">nested link</Link>
                  </CardBody>
                </Card>
              </CardBody>
            </Card>
          </CardBody>
        </Card>
        <Alert status="info" title={<Link href="/banner">banner link</Link>} />
      </MemoryRouter>,
    );

    for (const name of [
      'bui link',
      'bui secondary link',
      'core-components link',
      'MUI link',
      'tinted link',
      'tinted core link',
      'nested link',
      'banner link',
    ]) {
      expect([name, linkStyle(screen.getByRole('link', { name }))]).toEqual([
        name,
        TEXT_LINK,
      ]);
    }
  });

  it('styles a toast’s links, whichever theme the toast inverts to', () => {
    // plugin-app's ToastContainer: a CSS-module class with a hash suffix, on a
    // region that carries the inverted theme mode.
    const { container } = render(
      <div className="Toast_container__abc" data-theme-mode="dark">
        <div className="Toast_links__abc">
          <a href="#notifications">Open notifications</a>
        </div>
      </div>,
    );
    expect(
      linkStyle(screen.getByRole('link', { name: 'Open notifications' })),
    ).toEqual(TEXT_LINK);
    expect(
      getComputedStyle(container.firstElementChild!).getPropertyValue(
        '--agent-shell-link',
      ),
    ).toBe('#bcdcff');
  });

  // The controls most at risk: each renders an anchor, most of them a bui
  // `Link`, so only the rule's exclusions keep the text-link underline off
  // them. The rule's own underline offset tells whether it applied.
  it('leaves buttons, tabs, tags, row titles, breadcrumbs and the rail alone', () => {
    const navItem = agentShellNavItems[0];
    render(
      <MemoryRouter>
        <ButtonLink href="/button">bui button link</ButtonLink>
        <CoreLinkButton to="/core-button">
          core-components button
        </CoreLinkButton>
        <Tabs>
          <TabList>
            <Tab id="one" href="/tab">
              Tab
            </Tab>
          </TabList>
        </Tabs>
        <TagGroup aria-label="Tags">
          <Tag id="tag" href="/tag">
            Tag
          </Tag>
        </TagGroup>
        <StackedRowList
          aria-label="Rows"
          rows={[{ id: 'row', title: 'Row title', href: '/row' }]}
        />
        <Breadcrumbs
          items={[
            { label: 'Customize', href: '/customize' },
            { label: 'Agents', href: '/customize/agents' },
            { label: 'Current' },
          ]}
        />
        <ul>
          <RailLink item={navItem} href="/rail" layout="expanded" />
          <RailLink item={navItem} href="/bar" layout="bar" />
        </ul>
      </MemoryRouter>,
    );

    const controls: Array<[string, Element]> = [
      ['ButtonLink', screen.getByRole('link', { name: 'bui button link' })],
      [
        'LinkButton',
        screen.getByRole('button', { name: 'core-components button' }),
      ],
      ['Tab', screen.getByRole('tab', { name: 'Tab' })],
      ['Tag', screen.getByText('Tag').closest('[class*="bui-Tag"]')!],
      ['row title', screen.getByRole('link', { name: 'Row title' })],
      ['back arrow', screen.getByRole('link', { name: 'Back to Agents' })],
      ['crumb', screen.getByRole('link', { name: 'Customize' })],
      ['rail item', document.querySelector('a[href="/rail"]')!],
      ['bar item', document.querySelector('a[href="/bar"]')!],
    ];
    for (const [name, control] of controls) {
      expect(control).not.toBeNull();
      expect([name, linkStyle(control).offset]).not.toEqual([
        name,
        TEXT_LINK.offset,
      ]);
    }
  });

  it('leaves a menu item alone', () => {
    render(
      <MemoryRouter>
        <MenuTrigger defaultOpen>
          <Button>Open</Button>
          <Menu>
            <MenuItem href="/menu">Menu link</MenuItem>
          </Menu>
        </MenuTrigger>
      </MemoryRouter>,
    );
    expect(
      linkStyle(screen.getByRole('menuitem', { name: 'Menu link' })).offset,
    ).not.toBe(TEXT_LINK.offset);
  });
});
