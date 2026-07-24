import { fireEvent, render, screen } from '@testing-library/react';
import { CodeBlock } from './CodeBlock';

describe('CodeBlock', () => {
  it('renders the given text', () => {
    render(<CodeBlock text="kubectl gs login example" />);

    expect(screen.getByText('kubectl gs login example')).toBeInTheDocument();
  });

  it('shows a copy button by default', () => {
    render(<CodeBlock text="some command" />);

    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('hides the copy button when copyEnabled is false', () => {
    render(<CodeBlock text="some command" copyEnabled={false} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('copies the text and shows feedback when clicked', () => {
    // react-use's useCopyToClipboard copies via document.execCommand under the
    // hood; stub it so jsdom doesn't fall back to window.prompt().
    document.execCommand = jest.fn(() => true);

    render(<CodeBlock text="copy me" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });
});
