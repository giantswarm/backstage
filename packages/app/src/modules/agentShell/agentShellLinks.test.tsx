// This test reads the stylesheets from disk; nothing of it is bundled.
// eslint-disable-next-line no-restricted-imports
import { readFileSync } from 'fs';
// eslint-disable-next-line no-restricted-imports
import { join } from 'path';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
/* eslint-disable @typescript-eslint/no-restricted-imports --
   The rule must cover MUI's own link, and leave MUI's tabs, menu items and
   buttons rendered through a link alone: legacy code still renders them. */
import {
  Button as MuiButton,
  Link as MuiLink,
  MenuItem as MuiMenuItem,
  MenuList as MuiMenuList,
  Tab as MuiTab,
  Tabs as MuiTabs,
} from '@material-ui/core';
/* eslint-enable @typescript-eslint/no-restricted-imports */
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

/**
 * The CSS-module class `@backstage/plugin-app`'s toast gives its row of links,
 * read from the installed package, so the test renders what a toast renders.
 */
function upstreamToastLinksClass(): string {
  const module = readFileSync(
    join(
      require.resolve('@backstage/plugin-app/package.json'),
      '..',
      'dist/components/Toast/Toast.module.css.esm.js',
    ),
    'utf8',
  );
  const match = module.match(/"links":"(\w+)"/);
  if (!match) {
    throw new Error('plugin-app’s toast no longer exports a links class');
  }
  return match[1];
}

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

/** Whether the text-link rule applied, by its own underline offset. */
function isTextLink(element: Element): boolean {
  return linkStyle(element).offset === TEXT_LINK.offset;
}

describe('agent-shell.css text links', () => {
  let style: HTMLStyleElement;

  beforeEach(() => {
    style = document.createElement('style');
    style.textContent = shellCss;
    document.head.appendChild(style);
    document.documentElement.setAttribute('data-agent-shell', '');
    document.body.setAttribute('data-theme-mode', 'light');
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-agent-shell');
    document.body.removeAttribute('data-theme-mode');
    style.remove();
  });

  it('styles every text link, on a white surface, a tinted one and in a banner', () => {
    render(
      <MemoryRouter>
        <Link href="/plain">bui link</Link>
        <Link href="/secondary" color="secondary">
          bui secondary link
        </Link>
        <Link href="/not-standalone" standalone={false}>
          not standalone
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
      'not standalone',
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

  // A bui Text inside a text link takes the link's colour through a rule
  // nested in the link rule; jsdom applies no nested rules, so theme.test.ts
  // checks that one in the stylesheet.

  it('styles a toast’s links, whichever theme the toast inverts to', () => {
    // plugin-app's ToastContainer carries the inverted theme mode; its links
    // sit in a row with the module's `links` class.
    const { container } = render(
      <div data-theme-mode="dark">
        <div className={upstreamToastLinksClass()}>
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

  // The controls the rule leaves out by name: each carries a link class, so
  // without its exclusion it would take the text-link underline.
  it('leaves controls that carry a link class alone', () => {
    const navItem = agentShellNavItems[0];
    render(
      <MemoryRouter>
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
        {/* muster's tool pills: a link filling a tag, so it stays a link. */}
        <TagGroup aria-label="Tools">
          <Tag id="tool" textValue="tool">
            <Link standalone href="/tool">
              Tool pill
            </Link>
          </Tag>
        </TagGroup>
        <Card href="/card" label="Whole card">
          <CardBody>Card</CardBody>
        </Card>
        <MuiTabs value={0}>
          <MuiTab label="MUI tab" component={CoreLink} to="/mui-tab" />
        </MuiTabs>
        <MuiMenuList>
          <MuiMenuItem component={CoreLink} to="/mui-menu">
            MUI menu item
          </MuiMenuItem>
        </MuiMenuList>
        <MuiButton component={CoreLink} to="/mui-button">
          MUI button
        </MuiButton>
      </MemoryRouter>,
    );

    const controls: Array<[string, Element | null]> = [
      ['row title', screen.getByRole('link', { name: 'Row title' })],
      ['back arrow', screen.getByRole('link', { name: 'Back to Agents' })],
      ['crumb', screen.getByRole('link', { name: 'Customize' })],
      ['rail item', document.querySelector('a[href="/rail"]')],
      ['bar item', document.querySelector('a[href="/bar"]')],
      ['link in a tag', screen.getByRole('link', { name: 'Tool pill' })],
      ['card', document.querySelector('a.bui-CardTrigger')],
      ['MUI tab', screen.getByRole('tab', { name: 'MUI tab' })],
      [
        'MUI menu item',
        screen.getByRole('menuitem', { name: 'MUI menu item' }),
      ],
      ['MUI button', screen.getByRole('button', { name: 'MUI button' })],
    ];
    for (const [name, control] of controls) {
      expect([name, control]).not.toEqual([name, null]);
      // Each one is a link underneath: the exclusion is what keeps it out.
      expect([name, control!.matches('.bui-Link, .MuiLink-root')]).toEqual([
        name,
        true,
      ]);
      expect([name, isTextLink(control!)]).toEqual([name, false]);
    }
  });

  // bui's own link-like controls carry no link class, so the rule never
  // reaches them. A bui upgrade that gave one `bui-Link` would fail here.
  it('never reaches bui’s buttons, tabs, menu items and tags', () => {
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
        <MenuTrigger defaultOpen>
          <Button>Open</Button>
          <Menu>
            <MenuItem href="/menu">Menu link</MenuItem>
          </Menu>
        </MenuTrigger>
      </MemoryRouter>,
    );

    // The open menu hides the rest of the page from the accessibility tree.
    const hidden = { hidden: true };
    const controls: Array<[string, Element]> = [
      [
        'ButtonLink',
        screen.getByRole('link', { name: 'bui button link', ...hidden }),
      ],
      [
        'LinkButton',
        screen.getByRole('button', {
          name: 'core-components button',
          ...hidden,
        }),
      ],
      ['Tab', screen.getByRole('tab', { name: 'Tab', ...hidden })],
      ['Tag', screen.getByRole('row', { name: 'Tag', ...hidden })],
      ['MenuItem', screen.getByRole('menuitem', { name: 'Menu link' })],
    ];
    for (const [name, control] of controls) {
      expect([name, control.matches('.bui-Link, .MuiLink-root')]).toEqual([
        name,
        false,
      ]);
      expect([name, isTextLink(control)]).toEqual([name, false]);
    }
  });
});
