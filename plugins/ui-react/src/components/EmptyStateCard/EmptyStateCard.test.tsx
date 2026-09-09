import { render, screen } from '@testing-library/react';
import { EmptyStateCard } from './EmptyStateCard';

describe('EmptyStateCard', () => {
  it('renders the title as a heading', () => {
    render(<EmptyStateCard title="No agents yet" />);

    expect(
      screen.getByRole('heading', { name: 'No agents yet' }),
    ).toBeInTheDocument();
  });

  it('renders the description, the actions and richer content', () => {
    render(
      <EmptyStateCard
        title="No agents yet"
        description="Create your first one to get started."
        actions={<button type="button">Create your first agent</button>}
      >
        <input aria-label="Prompt" />
      </EmptyStateCard>,
    );

    expect(
      screen.getByText('Create your first one to get started.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create your first agent' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Prompt' })).toBeInTheDocument();
  });
});
