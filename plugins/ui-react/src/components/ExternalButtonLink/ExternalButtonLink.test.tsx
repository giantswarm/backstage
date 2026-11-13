import { render, screen } from '@testing-library/react';
import { ExternalButtonLink } from './ExternalButtonLink';

describe('ExternalButtonLink', () => {
  it('opens in a new tab and says so, with the launch icon and to a screen reader', () => {
    render(
      <ExternalButtonLink href="https://github.com/example-org/example/pull/1">
        Review pull request
      </ExternalButtonLink>,
    );

    const link = screen.getByRole('link', {
      name: 'Review pull request (opens in a new tab)',
    });
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/example-org/example/pull/1',
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
    expect(link).not.toHaveTextContent('↗');
  });
});
