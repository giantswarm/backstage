import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { NewTabLink } from './NewTabLink';

describe('NewTabLink', () => {
  it('opens in a new tab and says so to a screen reader', () => {
    render(
      <MemoryRouter>
        <NewTabLink href="/customize/connectors?installation=beta">
          Sign in to muster
        </NewTabLink>
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', {
      name: 'Sign in to muster (opens in a new tab)',
    });
    expect(link).toHaveAttribute(
      'href',
      '/customize/connectors?installation=beta',
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
