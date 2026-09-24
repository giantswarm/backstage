import { fireEvent, render, screen } from '@testing-library/react';
import { CollapsibleMarkdown } from './CollapsibleMarkdown';

const TOGGLE_LABELS = { expand: 'Show all', collapse: 'Show less' };

// jsdom lays nothing out and has no ResizeObserver. The stub reports this
// height for every observed element, as the observer's first notification.
let contentHeight = 0;

function stubContentHeight(height: number) {
  contentHeight = height;
}

function stubBottom(element: Element, bottom: number) {
  element.getBoundingClientRect = () => ({ top: 0, bottom }) as DOMRect;
}

describe('CollapsibleMarkdown', () => {
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

  it('renders the markdown', () => {
    stubContentHeight(100);

    render(
      <CollapsibleMarkdown
        content={'## Working method\n\nAlways **bound** time ranges.'}
        toggleLabels={TOGGLE_LABELS}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Working method' }),
    ).toBeInTheDocument();
    expect(screen.getByText('bound').tagName).toBe('STRONG');
  });

  it('shows short content whole, without a toggle', () => {
    stubContentHeight(100);

    render(
      <CollapsibleMarkdown
        content="A short prompt."
        toggleLabels={TOGGLE_LABELS}
      />,
    );

    expect(screen.getByText('A short prompt.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('collapses long content behind a toggle', () => {
    stubContentHeight(1000);

    render(
      <CollapsibleMarkdown
        content="A long prompt."
        toggleLabels={TOGGLE_LABELS}
      />,
    );

    const toggle = screen.getByRole('button', { name: 'Show all' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    const region = document.getElementById(
      toggle.getAttribute('aria-controls')!,
    );
    expect(region).toHaveStyle({ maxHeight: '250px' });
  });

  it('expands and collapses again on the toggle', () => {
    stubContentHeight(1000);

    render(
      <CollapsibleMarkdown
        content="A long prompt."
        toggleLabels={TOGGLE_LABELS}
        collapsedHeight={120}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));

    const toggle = screen.getByRole('button', { name: 'Show less' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(
      document.getElementById(toggle.getAttribute('aria-controls')!),
    ).not.toHaveStyle({ maxHeight: '120px' });

    fireEvent.click(toggle);

    expect(screen.getByRole('button', { name: 'Show all' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('expands when keyboard focus reaches a link past the cut', () => {
    stubContentHeight(1000);

    render(
      <CollapsibleMarkdown
        content={'Intro.\n\nSee [the runbook](https://example.com/runbook).'}
        toggleLabels={TOGGLE_LABELS}
      />,
    );

    const toggle = screen.getByRole('button', { name: 'Show all' });
    const region = document.getElementById(
      toggle.getAttribute('aria-controls')!,
    )!;
    const link = screen.getByRole('link', { name: 'the runbook' });
    stubBottom(region, 250);
    stubBottom(link, 400);

    fireEvent.focusIn(link);

    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('stays collapsed when keyboard focus lands on a visible link', () => {
    stubContentHeight(1000);

    render(
      <CollapsibleMarkdown
        content="See [the runbook](https://example.com/runbook) first."
        toggleLabels={TOGGLE_LABELS}
      />,
    );

    const toggle = screen.getByRole('button', { name: 'Show all' });
    const region = document.getElementById(
      toggle.getAttribute('aria-controls')!,
    )!;
    const link = screen.getByRole('link', { name: 'the runbook' });
    stubBottom(region, 250);
    stubBottom(link, 40);

    fireEvent.focusIn(link);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});
