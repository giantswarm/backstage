import { render, screen } from '@testing-library/react';
import { NewTabLabel } from './NewTabLabel';

describe('NewTabLabel', () => {
  it('keeps the label and the hint in one box', () => {
    render(
      <button type="button">
        <NewTabLabel>Sign in to example</NewTabLabel>
      </button>,
    );

    const button = screen.getByRole('button', {
      name: 'Sign in to example (opens in a new tab)',
    });
    expect(button.children).toHaveLength(1);
    expect(button.firstElementChild?.querySelector('svg')).toBeInTheDocument();
  });
});
