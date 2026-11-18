import { fireEvent, render, screen } from '@testing-library/react';
import { errorApiRef } from '@backstage/core-plugin-api';
import { TestApiProvider } from '@backstage/test-utils';
import { CodeBlock } from './CodeBlock';

const errorApi = { post: jest.fn(), error$: jest.fn() };

function renderCodeBlock(props: Parameters<typeof CodeBlock>[0]) {
  return render(
    <TestApiProvider apis={[[errorApiRef, errorApi]]}>
      <CodeBlock {...props} />
    </TestApiProvider>,
  );
}

describe('CodeBlock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the given text', () => {
    renderCodeBlock({ text: 'kubectl gs login example' });

    expect(screen.getByText('kubectl gs login example')).toBeInTheDocument();
  });

  it('shows a copy button by default', () => {
    renderCodeBlock({ text: 'some command' });

    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('hides the copy button when copyEnabled is false', () => {
    renderCodeBlock({ text: 'some command', copyEnabled: false });

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('copies the text and shows feedback when clicked', () => {
    // react-use's useCopyToClipboard copies via document.execCommand under the
    // hood; stub it so jsdom doesn't fall back to window.prompt().
    document.execCommand = jest.fn(() => true);

    renderCodeBlock({ text: 'copy me' });

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(errorApi.post).not.toHaveBeenCalled();
  });

  it('grows with its text by default', () => {
    renderCodeBlock({ text: 'some command' });

    const block = screen.getByText('some command');
    expect(block.style.getPropertyValue('--code-block-max-height')).toBe('');
    expect(block).not.toHaveAttribute('tabindex');
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  describe('with a maximum height', () => {
    // jsdom lays nothing out; these stand in for the block's measured box.
    const box = { scrollHeight: 0, clientHeight: 0 };
    const scrollTop = jest.fn();
    const originals = ['scrollHeight', 'clientHeight', 'scrollTop'].map(
      name =>
        [
          name,
          Object.getOwnPropertyDescriptor(Element.prototype, name),
        ] as const,
    );

    beforeAll(() => {
      Object.defineProperty(Element.prototype, 'scrollHeight', {
        configurable: true,
        get: () => box.scrollHeight,
      });
      Object.defineProperty(Element.prototype, 'clientHeight', {
        configurable: true,
        get: () => box.clientHeight,
      });
      Object.defineProperty(Element.prototype, 'scrollTop', {
        configurable: true,
        get: () => 0,
        set: scrollTop,
      });
    });

    afterAll(() => {
      for (const [name, descriptor] of originals) {
        if (descriptor)
          Object.defineProperty(Element.prototype, name, descriptor);
      }
    });

    it('caps the block, and adds no tab stop while its text fits', () => {
      box.scrollHeight = 40;
      box.clientHeight = 40;
      renderCodeBlock({ text: 'line 1\nline 2', maxHeight: '400px' });

      const block = screen.getByText(/line 1/);
      expect(block.style.getPropertyValue('--code-block-max-height')).toBe(
        '400px',
      );
      expect(block).toHaveStyle({ overflowY: 'auto' });
      expect(block).not.toHaveAttribute('tabindex');
      expect(screen.queryByRole('region')).not.toBeInTheDocument();
    });

    it('is a named region that scrolls from the keyboard once its text overflows', () => {
      box.scrollHeight = 1200;
      box.clientHeight = 400;
      render(
        <TestApiProvider apis={[[errorApiRef, errorApi]]}>
          <span id="log-heading">Build log</span>
          <CodeBlock
            text={'line 1\nline 2'}
            maxHeight="400px"
            aria-labelledby="log-heading"
          />
        </TestApiProvider>,
      );

      const region = screen.getByRole('region', { name: 'Build log' });
      expect(region).toHaveAttribute('tabindex', '0');
      expect(scrollTop).not.toHaveBeenCalled();
    });

    it('opens at the end of its text with scrollToEnd', () => {
      box.scrollHeight = 1200;
      box.clientHeight = 400;
      renderCodeBlock({
        text: 'line 1\nline 2',
        maxHeight: '400px',
        scrollToEnd: true,
      });

      expect(scrollTop).toHaveBeenCalledWith(1200);
    });
  });
});
