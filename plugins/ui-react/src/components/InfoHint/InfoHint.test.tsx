import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InfoHint } from './InfoHint';

describe('InfoHint', () => {
  it('is a button named by what it reveals, and shows its text on focus', async () => {
    const user = userEvent.setup();
    render(
      <InfoHint label="Why this agent is not accepted">It broke.</InfoHint>,
    );

    const button = screen.getByRole('button', {
      name: 'Why this agent is not accepted',
    });
    await user.tab();
    expect(button).toHaveFocus();
    expect(await screen.findByText('It broke.')).toBeInTheDocument();
  });
});
