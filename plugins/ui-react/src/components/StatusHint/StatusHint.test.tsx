import {
  getDefaultNormalizer,
  render,
  screen,
  within,
} from '@testing-library/react';
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
    // sentences run together: match the newline, and read the `white-space`
    // that keeps it on screen.
    expect(
      within(await screen.findByRole('tooltip')).getByText(
        '0/3 nodes are available.\nAdd a GPU node.',
        {
          normalizer: getDefaultNormalizer({
            collapseWhitespace: false,
            trim: false,
          }),
        },
      ),
    ).toHaveStyle({ whiteSpace: 'pre-line' });
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
