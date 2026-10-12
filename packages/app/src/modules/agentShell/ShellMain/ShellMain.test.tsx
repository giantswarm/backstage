import {
  SidebarPinStateProvider,
  sidebarConfig,
} from '@backstage/core-components';
import { render, screen } from '@testing-library/react';
import {
  RAIL_WIDTH_STORAGE_KEY,
  RailWidthProvider,
} from '../RailWidthProvider';
import { ShellMain } from './ShellMain';

function renderBesideRail({
  isPinned = true,
  isMobile = false,
}: { isPinned?: boolean; isMobile?: boolean } = {}) {
  render(
    <RailWidthProvider>
      <SidebarPinStateProvider
        value={{ isPinned, toggleSidebarPinState: () => {}, isMobile }}
      >
        <ShellMain>
          <h1>Customize</h1>
        </ShellMain>
      </SidebarPinStateProvider>
    </RailWidthProvider>,
  );
  return document.getElementById('content') as HTMLElement;
}

describe('ShellMain', () => {
  it('is the main landmark of a page without one', () => {
    render(
      <ShellMain>
        <h1>Customize</h1>
      </ShellMain>,
    );

    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('main')).toHaveAttribute('id', 'content');
  });

  it('leaves the landmark to a page that brings its own main', () => {
    render(
      <ShellMain>
        <main>
          <h1>Catalog</h1>
        </main>
      </ShellMain>,
    );

    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0].tagName).toBe('MAIN');
    expect(document.getElementById('content')).not.toHaveAttribute('role');
  });

  describe('beside the rail', () => {
    const inset = (content: HTMLElement) =>
      content.style.getPropertyValue('--agent-shell-rail-inset');

    beforeEach(() => {
      window.localStorage.setItem(RAIL_WIDTH_STORAGE_KEY, '300');
    });
    afterEach(() => {
      window.localStorage.clear();
    });

    it('starts where the resized rail ends', () => {
      expect(inset(renderBesideRail())).toBe('300px');
    });

    it('starts where the collapsed rail ends, whatever the expanded width', () => {
      expect(inset(renderBesideRail({ isPinned: false }))).toBe(
        `${sidebarConfig.drawerWidthClosed}px`,
      );
    });

    it('starts at the screen edge above the phone bar', () => {
      expect(inset(renderBesideRail({ isMobile: true }))).toBe('0px');
    });
  });
});
