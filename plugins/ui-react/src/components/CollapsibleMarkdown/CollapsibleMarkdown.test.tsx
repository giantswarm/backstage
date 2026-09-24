import { fireEvent, render, screen } from '@testing-library/react';
import { CollapsibleMarkdown } from './CollapsibleMarkdown';

const TOGGLE_LABELS = { expand: 'Show all', collapse: 'Show less' };

// jsdom lays nothing out, so every element reports a scrollHeight of 0. Stub it
// to decide whether the rendered content overflows the collapsed height.
function stubScrollHeight(height: number) {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => height,
  });
}

describe('CollapsibleMarkdown', () => {
  const RealResizeObserver = globalThis.ResizeObserver;

  beforeAll(() => {
    // jsdom has no ResizeObserver; the initial measurement is all these tests
    // need.
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });

  afterAll(() => {
    globalThis.ResizeObserver = RealResizeObserver;
  });

  afterEach(() => {
    // Removing the own property restores the inherited Element getter.
    delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight;
  });

  it('renders the markdown', () => {
    stubScrollHeight(100);

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
    stubScrollHeight(100);

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
    stubScrollHeight(1000);

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
    stubScrollHeight(1000);

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
});
