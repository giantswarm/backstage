import { render, screen } from '@testing-library/react';
import { Gate } from './Gate';

describe('Gate', () => {
  it('renders the label', () => {
    render(<Gate label="Tools need a live muster session." />);

    expect(
      screen.getByText('Tools need a live muster session.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders the action next to the label when given one', () => {
    render(
      <Gate label="Sign in to continue." action={<button>Sign in</button>} />,
    );

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });
});
