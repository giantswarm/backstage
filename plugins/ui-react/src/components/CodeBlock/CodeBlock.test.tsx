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
});
