import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CollapsibleToggle, CollapsibleViewport } from './Collapsible';
import { useCollapsible } from '../../hooks';
import {
  mockCollapsibleLayout,
  type MockedCollapsibleLayout,
} from '../../testUtils';

const LABELS = { expand: 'Show more', collapse: 'Show less' };

const lines = (count: number) =>
  Array.from({ length: count }, (_, i) => `line ${i + 1}`).join('\n');

/** The toggle outside the box the content is cut in, as under a bubble. */
function Bubble({
  text,
  expanded,
  onExpandedChange,
}: {
  text: string;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const collapsible = useCollapsible({
    collapsedHeight: '10lh',
    expanded,
    onExpandedChange,
  });
  return (
    <div>
      <div data-testid="bubble">
        <CollapsibleViewport state={collapsible}>
          <pre>{text}</pre>
        </CollapsibleViewport>
      </div>
      <CollapsibleToggle state={collapsible} labels={LABELS} />
    </div>
  );
}

/** A writable `scrollTop`, which jsdom keeps at 0. */
function scrollable(element: Element, { scrollHeight = 0 } = {}) {
  let top = 0;
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: value => {
      top = value;
    },
  });
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    get: () => scrollHeight,
  });
}

function regionOf(toggle: HTMLElement): HTMLElement {
  return document.getElementById(toggle.getAttribute('aria-controls')!)!;
}

describe('Collapsible', () => {
  let layout: MockedCollapsibleLayout;

  beforeEach(() => {
    layout = mockCollapsibleLayout();
  });

  afterEach(() => layout.restore());

  it('ties a toggle placed outside the cut to the content it shows', async () => {
    render(<Bubble text={lines(40)} />);

    const toggle = screen.getByRole('button', { name: 'Show more' });
    expect(screen.getByTestId('bubble')).not.toContainElement(toggle);
    const region = regionOf(toggle);
    expect(screen.getByTestId('bubble')).toContainElement(region);
    // A CSS length, resolved by the browser in the text's own type (which
    // jsdom's computed style does not know, hence the inline style).
    expect(region.style.maxHeight).toBe('10lh');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(toggle);

    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(region.style.maxHeight).toBe('');
  });

  it('draws the toggle in the foreground of the fill it sits on', () => {
    function OnFill() {
      const collapsible = useCollapsible({ collapsedHeight: '10lh' });
      return (
        <div style={{ color: 'rgb(255, 255, 255)' }}>
          <CollapsibleViewport state={collapsible}>
            <pre>{lines(40)}</pre>
          </CollapsibleViewport>
          <CollapsibleToggle state={collapsible} labels={LABELS} onSolid />
        </div>
      );
    }
    render(<OnFill />);

    expect(screen.getByRole('button', { name: 'Show more' })).toHaveStyle({
      color: 'rgb(255, 255, 255)',
    });
  });

  it('renders no toggle when the content fits', () => {
    render(<Bubble text={lines(10)} />);

    expect(screen.getByText(/line 10/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows whole what a cut would hide no more than a fifth of', () => {
    // Two lines past a ten-line cut is a click to see two lines.
    const { unmount } = render(<Bubble text={lines(12)} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    unmount();

    render(<Bubble text={lines(13)} />);
    expect(
      screen.getByRole('button', { name: 'Show more' }),
    ).toBeInTheDocument();
  });

  it('keeps a state its caller holds across a remount', async () => {
    function Remounting() {
      const [expanded, setExpanded] = useState(false);
      const [key, setKey] = useState(0);
      return (
        <>
          <Bubble
            key={key}
            text={lines(40)}
            expanded={expanded}
            onExpandedChange={setExpanded}
          />
          <button type="button" onClick={() => setKey(k => k + 1)}>
            Remount
          </button>
        </>
      );
    }
    render(<Remounting />);

    await userEvent.click(screen.getByRole('button', { name: 'Show more' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remount' }));

    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  describe('on Show less', () => {
    const RealScrollIntoView = Element.prototype.scrollIntoView;
    let scrolledTo: Element[];

    beforeEach(() => {
      scrolledTo = [];
      Element.prototype.scrollIntoView = function scrollIntoView(
        this: Element,
      ) {
        scrolledTo.push(this);
      };
    });

    afterEach(() => {
      Element.prototype.scrollIntoView = RealScrollIntoView;
    });

    it('brings the cut content back into view when it went above the top', async () => {
      render(<Bubble text={lines(400)} />);
      await userEvent.click(screen.getByRole('button', { name: 'Show more' }));
      const less = screen.getByRole('button', { name: 'Show less' });
      // Read to the end: the message's top is far above the window.
      regionOf(less).getBoundingClientRect = () =>
        ({ top: -8000, bottom: 200 }) as DOMRect;

      await userEvent.click(less);

      expect(scrolledTo).toEqual([regionOf(less)]);
    });

    it('leaves the page alone when the content is in view', async () => {
      render(<Bubble text={lines(40)} />);
      await userEvent.click(screen.getByRole('button', { name: 'Show more' }));
      const less = screen.getByRole('button', { name: 'Show less' });
      regionOf(less).getBoundingClientRect = () =>
        ({ top: 100, bottom: 1000 }) as DOMRect;

      await userEvent.click(less);

      expect(scrolledTo).toEqual([]);
    });
  });

  it('shows everything when find in page scrolls a match under the cut, keeping it in place', () => {
    // The scroll container of a side panel, as the agent create assist has.
    render(
      <div data-testid="panel" style={{ overflowY: 'auto' }}>
        <Bubble text={lines(400)} />
      </div>,
    );
    const panel = screen.getByTestId('panel');
    scrollable(panel, { scrollHeight: 10_000 });
    const toggle = screen.getByRole('button', { name: 'Show more' });
    const region = regionOf(toggle);
    scrollable(region);

    region.scrollTop = 600;
    fireEvent.scroll(region);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(region.scrollTop).toBe(0);
    // The content moved down by what was scrolled inside the cut; the panel
    // follows it.
    expect(panel.scrollTop).toBe(600);
  });
});
