import { SidebarPinStateProvider } from '@backstage/core-components';
import { render, screen } from '@testing-library/react';
import { RAIL_WIDTH_STORAGE_KEY, RailWidthProvider } from '../railWidth';
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

  describe('beside a resized rail', () => {
    beforeEach(() => {
      window.localStorage.setItem(RAIL_WIDTH_STORAGE_KEY, '300');
    });
    afterEach(() => {
      window.localStorage.clear();
    });

    it('moves its left edge by what the rail is wider than SidebarPage pads for', () => {
      const content = renderBesideRail();
      expect(content.style.getPropertyValue('--agent-shell-rail-offset')).toBe(
        '76px',
      );
    });

    it('stays put beside the collapsed rail', () => {
      expect(
        renderBesideRail({ isPinned: false }).style.getPropertyValue(
          '--agent-shell-rail-offset',
        ),
      ).toBe('');
    });

    it('stays put above the phone bar', () => {
      expect(
        renderBesideRail({ isMobile: true }).style.getPropertyValue(
          '--agent-shell-rail-offset',
        ),
      ).toBe('');
    });
  });
});
