import { render, screen } from '@testing-library/react';
import { NewTabHint } from './NewTabHint';

describe('NewTabHint', () => {
  it('shows the launch icon and tells a screen reader about the new tab', () => {
    render(
      <a href="https://example.com">
        Docs
        <NewTabHint />
      </a>,
    );

    const link = screen.getByRole('link', {
      name: 'Docs (opens in a new tab)',
    });
    expect(link.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
  });
});
