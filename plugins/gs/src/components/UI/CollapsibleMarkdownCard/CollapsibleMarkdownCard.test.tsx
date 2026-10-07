import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { CollapsibleMarkdownCard } from './CollapsibleMarkdownCard';

const TOGGLE_LABELS = { expand: 'Show all', collapse: 'Show less' };

describe('CollapsibleMarkdownCard', () => {
  const RealResizeObserver = globalThis.ResizeObserver;
  const RealScrollIntoView = Element.prototype.scrollIntoView;
  const RealGetBoundingClientRect = Element.prototype.getBoundingClientRect;
  let scrolledTo: Element[];

  beforeAll(() => {
    // jsdom lays nothing out, has no ResizeObserver and does not scroll.
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    jest
      .spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
      .mockReturnValue(1000);
    // Headings sit past the 250px cut, everything else at the top.
    Element.prototype.getBoundingClientRect = function getBoundingClientRect(
      this: Element,
    ) {
      const bottom = /^H\d$/.test(this.tagName) ? 400 : 0;
      return { top: 0, bottom } as DOMRect;
    };
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
      scrolledTo.push(this);
    };
  });

  afterAll(() => {
    globalThis.ResizeObserver = RealResizeObserver;
    Element.prototype.getBoundingClientRect = RealGetBoundingClientRect;
    Element.prototype.scrollIntoView = RealScrollIntoView;
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    scrolledTo = [];
  });

  it('expands when a #heading link points past the cut', async () => {
    await renderInTestApp(
      <CollapsibleMarkdownCard
        title="README"
        content={'[Upgrading](#upgrading)\n\n## Upgrading\n\nRead first.'}
        isLoading={false}
        emptyMessage="No README."
        toggleLabels={TOGGLE_LABELS}
      />,
    );

    expect(screen.getByRole('button', { name: 'Show all' })).toBeVisible();
    const heading = screen.getByRole('heading', { name: 'Upgrading' });

    fireEvent.click(screen.getByRole('link', { name: 'Upgrading' }));

    expect(screen.getByRole('button', { name: 'Show less' })).toBeVisible();
    expect(heading).toHaveFocus();
    await waitFor(() => expect(scrolledTo).toEqual([heading]));
  });
});
