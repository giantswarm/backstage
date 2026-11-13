import { render, screen } from '@testing-library/react';
import { ExternalLink } from './ExternalLink';

describe('ExternalLink', () => {
  it('opens in a new tab and says so to a screen reader', () => {
    render(
      <ExternalLink href="/customize/connectors?installation=beta">
        Sign in to muster
      </ExternalLink>,
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
    // bui's Link, with the launch icon and no text arrow.
    expect(link).toHaveClass('bui-Link');
    expect(link.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
    expect(link).not.toHaveTextContent('↗');
  });

  it('takes the surrounding font without a variant, and its own with one', () => {
    render(
      <>
        <ExternalLink href="https://example.com/a">Inherits</ExternalLink>
        <ExternalLink href="https://example.com/b" variant="body-small">
          Small
        </ExternalLink>
      </>,
    );

    const inherits = screen.getByRole('link', { name: /^Inherits/ });
    expect(inherits.className).toMatch(/inheritFont/);
    const small = screen.getByRole('link', { name: /^Small/ });
    expect(small).toHaveAttribute('data-variant', 'body-small');
    expect(small.className).not.toMatch(/inheritFont/);
  });

  it('carries a title for a truncated text', () => {
    render(
      <ExternalLink href="https://example.com" title="example-org/api">
        example-org/api
      </ExternalLink>,
    );

    expect(
      screen.getByRole('link', {
        name: 'example-org/api (opens in a new tab)',
      }),
    ).toHaveAttribute('title', 'example-org/api');
  });
});
