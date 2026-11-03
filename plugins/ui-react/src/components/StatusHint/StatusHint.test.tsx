import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatusHint } from './StatusHint';

describe('StatusHint', () => {
  it('names the button after its subject and says each sentence on a line', async () => {
    const user = userEvent.setup();
    render(
      <StatusHint
        subject="qwen3"
        explanation={['0/3 nodes are available.', '', 'Add a GPU node.']}
      />,
    );

    await user.tab();
    expect(
      screen.getByRole('button', { name: 'About the state of qwen3' }),
    ).toHaveFocus();
    // `toHaveTextContent` collapses whitespace, so it would pass with the
    // sentences run together: read the newline, and the `white-space` that
    // keeps it on screen.
    const tooltip = await screen.findByRole('tooltip');
    const lines = Array.from(tooltip.querySelectorAll('span')).find(
      span => span.textContent === '0/3 nodes are available.\nAdd a GPU node.',
    );
    expect(lines).toBeDefined();
    expect(lines).toHaveStyle({ whiteSpace: 'pre-line' });
  });

  it('renders nothing without an explanation', () => {
    const { container } = render(
      <>
        <StatusHint subject="a" />
        <StatusHint subject="b" explanation="  " />
        <StatusHint subject="c" explanation={[]} />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
