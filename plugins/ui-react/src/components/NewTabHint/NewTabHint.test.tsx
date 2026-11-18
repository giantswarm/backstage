import { render, screen } from '@testing-library/react';
import { NewTabHint, WithNewTabHint } from './NewTabHint';

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

describe('WithNewTabHint', () => {
  it('holds the launch icon to the last word of the text', () => {
    const { container } = render(
      <WithNewTabHint>Cluster overview dashboard</WithNewTabHint>,
    );
    const glued = [...container.querySelectorAll('span')].find(
      span => span.style.whiteSpace === 'nowrap',
    );
    expect(glued?.textContent).toBe('dashboard (opens in a new tab)');
    expect(glued?.querySelector('svg')).not.toBeNull();
    expect(container.textContent).toBe(
      'Cluster overview dashboard (opens in a new tab)',
    );
  });

  it('follows other content with the hint as it is', () => {
    const { container } = render(
      <WithNewTabHint>
        <code>1234</code>
      </WithNewTabHint>,
    );
    expect(container.textContent).toBe('1234 (opens in a new tab)');
  });
});
