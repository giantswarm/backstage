import {
  SidebarPinStateProvider,
  sidebarConfig,
} from '@backstage/core-components';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  RAIL_COLLAPSED_WIDTH,
  RAIL_WIDTH_STORAGE_KEY,
  RailWidthProvider,
  useRailWidth,
} from '../RailWidthProvider';
import { ShellMain } from './ShellMain';

function BesideRail({
  isPinned,
  isMobile,
}: {
  isPinned: boolean;
  isMobile: boolean;
}) {
  return (
    <RailWidthProvider>
      <SidebarPinStateProvider
        value={{ isPinned, toggleSidebarPinState: () => {}, isMobile }}
      >
        <ShellMain>
          <h1>Customize</h1>
        </ShellMain>
        <ResizeByKey />
      </SidebarPinStateProvider>
    </RailWidthProvider>
  );
}

/** Stands in for the handle's keyboard: sets the width as a key press does. */
function ResizeByKey() {
  const { width, setWidth } = useRailWidth();
  return (
    <button type="button" onClick={() => setWidth(width + 16)}>
      Wider
    </button>
  );
}

function renderBesideRail({
  isPinned = true,
  isMobile = false,
}: { isPinned?: boolean; isMobile?: boolean } = {}) {
  const view = render(<BesideRail isPinned={isPinned} isMobile={isMobile} />);
  return {
    content: document.getElementById('content') as HTMLElement,
    rerender: (next: { isPinned?: boolean; isMobile?: boolean }) =>
      view.rerender(
        <BesideRail
          isPinned={next.isPinned ?? isPinned}
          isMobile={next.isMobile ?? isMobile}
        />,
      ),
  };
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
    // SidebarPage pads the page by the classic sidebar's width; the region
    // moves by the difference, so it starts where the rail ends.
    const offset = (content: HTMLElement) =>
      content.style.getPropertyValue('--agent-shell-content-offset');
    const eases = (content: HTMLElement) =>
      window.getComputedStyle(content).transition.includes('margin-left');

    beforeEach(() => {
      window.localStorage.setItem(RAIL_WIDTH_STORAGE_KEY, '300');
    });
    afterEach(() => {
      window.localStorage.clear();
    });

    it('starts where the resized rail ends, from its first render', () => {
      const { content } = renderBesideRail();
      expect(offset(content)).toBe(`${300 - sidebarConfig.drawerWidthOpen}px`);
    });

    it('starts where the collapsed rail ends, whatever the expanded width', () => {
      const { content } = renderBesideRail({ isPinned: false });
      expect(offset(content)).toBe(
        `${RAIL_COLLAPSED_WIDTH - sidebarConfig.drawerWidthClosed}px`,
      );
    });

    it('leaves SidebarPage’s padding as it is at the default width', () => {
      window.localStorage.clear();
      const { content } = renderBesideRail();
      expect(offset(content)).toBe('0px');
    });

    it('starts at the screen edge above the phone bar', () => {
      const { content } = renderBesideRail({ isMobile: true });
      expect(offset(content)).toBe('0px');
    });

    it('eases when the rail collapses or expands, as SidebarPage’s padding does', () => {
      const { content, rerender } = renderBesideRail();
      expect(eases(content)).toBe(false);

      rerender({ isPinned: false });
      expect(eases(content)).toBe(true);

      rerender({ isPinned: true });
      expect(eases(content)).toBe(true);
    });

    it('follows a resize at once, without easing behind the rail', async () => {
      const { content, rerender } = renderBesideRail();
      rerender({ isPinned: false });
      rerender({ isPinned: true });
      expect(eases(content)).toBe(true);

      await userEvent.click(screen.getByRole('button', { name: 'Wider' }));

      expect(offset(content)).toBe(`${316 - sidebarConfig.drawerWidthOpen}px`);
      expect(eases(content)).toBe(false);
    });
  });
});
