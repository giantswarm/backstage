import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/test-utils';
import { SectionHeader } from './SectionHeader';

describe('SectionHeader', () => {
  it('renders the title, description, icon, and action', async () => {
    await renderInTestApp(
      <SectionHeader
        icon={<svg data-testid="section-icon" />}
        title="Tool explorer"
        description="Browse and run tools."
        action={<button type="button">Do thing</button>}
      />,
    );

    expect(screen.getByText('Tool explorer')).toBeInTheDocument();
    expect(screen.getByText('Browse and run tools.')).toBeInTheDocument();
    expect(screen.getByTestId('section-icon')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Do thing' }),
    ).toBeInTheDocument();
  });

  it('omits the description and action when not provided', async () => {
    await renderInTestApp(<SectionHeader icon={<svg />} title="Servers" />);

    expect(screen.getByText('Servers')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
