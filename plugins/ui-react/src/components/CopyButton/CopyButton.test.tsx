import { fireEvent, render, screen } from '@testing-library/react';
import { errorApiRef } from '@backstage/core-plugin-api';
import { TestApiProvider } from '@backstage/test-utils';
import { CopyButton } from './CopyButton';

const errorApi = { post: jest.fn(), error$: jest.fn() };

function renderCopyButton(props: Parameters<typeof CopyButton>[0]) {
  return render(
    <TestApiProvider apis={[[errorApiRef, errorApi]]}>
      <CopyButton {...props} />
    </TestApiProvider>,
  );
}

describe('CopyButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('is named "Copy" by default', () => {
    renderCopyButton({ text: 'some text' });

    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('is named by its label', () => {
    renderCopyButton({ text: 'some text', label: 'Copy system prompt' });

    expect(
      screen.getByRole('button', { name: 'Copy system prompt' }),
    ).toBeInTheDocument();
  });

  it('copies and confirms when pressed', () => {
    // react-use's useCopyToClipboard copies via document.execCommand under the
    // hood; stub it so jsdom doesn't fall back to window.prompt().
    document.execCommand = jest.fn(() => true);

    renderCopyButton({ text: 'copy me', label: 'Copy system prompt' });

    fireEvent.click(screen.getByRole('button', { name: 'Copy system prompt' }));

    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(errorApi.post).not.toHaveBeenCalled();
  });
});
