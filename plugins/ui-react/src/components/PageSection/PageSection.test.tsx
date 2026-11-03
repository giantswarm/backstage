import { render, screen, within } from '@testing-library/react';
import { PageSection } from './PageSection';

describe('PageSection', () => {
  it('names its region by its h2 heading, with the description and action under and beside it', () => {
    render(
      <PageSection
        title="What it needs"
        description="An agent passes these inputs."
        action={<button type="button">Change</button>}
      >
        <p>The inputs</p>
      </PageSection>,
    );

    const region = screen.getByRole('region', { name: 'What it needs' });
    expect(
      within(region).getByRole('heading', { level: 2, name: 'What it needs' }),
    ).toBeInTheDocument();
    expect(region).toHaveTextContent('An agent passes these inputs.');
    expect(
      within(region).getByRole('button', { name: 'Change' }),
    ).toBeInTheDocument();
    expect(within(region).getByText('The inputs')).toBeInTheDocument();
  });

  it('gives two sections distinct heading ids', () => {
    render(
      <>
        <PageSection title="One">a</PageSection>
        <PageSection title="Two">b</PageSection>
      </>,
    );

    expect(screen.getByRole('region', { name: 'One' })).toHaveTextContent('a');
    expect(screen.getByRole('region', { name: 'Two' })).toHaveTextContent('b');
  });
});
