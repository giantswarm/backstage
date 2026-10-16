import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CollapsibleToggle,
  CollapsibleViewport,
  useCollapsible,
} from './Collapsible';

// jsdom lays nothing out and has no ResizeObserver. The stub reports this
// height for every observed element, as the observer's first notification.
let contentHeight = 0;

const LABELS = { expand: 'Show more', collapse: 'Show less' };

/** The toggle outside the box the content is cut in, as under a bubble. */
function Bubble({ text }: { text: string }) {
  const collapsible = useCollapsible({ collapsedHeight: 224 });
  return (
    <div>
      <div data-testid="bubble">
        <CollapsibleViewport state={collapsible}>
          <p>{text}</p>
        </CollapsibleViewport>
      </div>
      <CollapsibleToggle state={collapsible} labels={LABELS} />
    </div>
  );
}

describe('Collapsible', () => {
  const RealResizeObserver = globalThis.ResizeObserver;

  beforeAll(() => {
    globalThis.ResizeObserver = class {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [
            {
              target,
              contentRect: { width: 600, height: contentHeight },
            } as unknown as ResizeObserverEntry,
          ],
          this as unknown as ResizeObserver,
        );
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });

  afterAll(() => {
    globalThis.ResizeObserver = RealResizeObserver;
  });

  it('ties a toggle placed outside the cut to the content it shows', async () => {
    contentHeight = 1000;
    render(<Bubble text="A long message." />);

    const toggle = screen.getByRole('button', { name: 'Show more' });
    expect(screen.getByTestId('bubble')).not.toContainElement(toggle);
    const region = document.getElementById(
      toggle.getAttribute('aria-controls')!,
    );
    expect(screen.getByTestId('bubble')).toContainElement(region);
    expect(region).toHaveStyle({ maxHeight: '224px' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(toggle);

    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(region).not.toHaveStyle({ maxHeight: '224px' });
  });

  it('renders no toggle when the content fits', () => {
    contentHeight = 224;
    render(<Bubble text="A short message." />);

    expect(screen.getByText('A short message.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
