import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShellScopeProvider } from '../ShellScope';
import { StatusWithHint } from './StatusWithHint';

describe('StatusWithHint', () => {
  it('shows the state alone when there is nothing to explain', () => {
    render(
      <StatusWithHint
        tone="success"
        label="Ready"
        hintLabel="About the state of Sonnet"
      />,
    );

    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('puts the explanation in a hint beside the state, opened by a press in the shell', async () => {
    render(
      <ShellScopeProvider>
        <StatusWithHint
          tone="danger"
          label="Not accepted"
          hint="Secret kagent/sonnet-key not found"
          hintLabel="About the state of Sonnet"
        />
      </ShellScopeProvider>,
    );

    expect(screen.getByText('Not accepted')).toBeInTheDocument();
    expect(screen.queryByText('Secret kagent/sonnet-key not found')).toBeNull();

    await userEvent.click(
      screen.getByRole('button', { name: 'About the state of Sonnet' }),
    );

    expect(
      await screen.findByRole('dialog', { name: 'About the state of Sonnet' }),
    ).toHaveTextContent('Secret kagent/sonnet-key not found');
  });
});
