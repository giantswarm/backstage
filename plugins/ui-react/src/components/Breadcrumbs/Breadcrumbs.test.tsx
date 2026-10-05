import { render, screen } from '@testing-library/react';
import { Breadcrumbs } from './Breadcrumbs';

describe('Breadcrumbs', () => {
  it('links every ancestor and marks the last item as the current page', () => {
    render(
      <Breadcrumbs
        items={[
          { label: 'MCP Servers', href: '/servers' },
          { label: 'kubernetes', href: '/servers/kubernetes' },
          { label: 'get_pods' },
        ]}
      />,
    );

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'MCP Servers' })).toHaveAttribute(
      'href',
      '/servers',
    );
    expect(screen.getByRole('link', { name: 'kubernetes' })).toHaveAttribute(
      'href',
      '/servers/kubernetes',
    );
    expect(screen.queryByRole('link', { name: 'get_pods' })).toBeNull();
    expect(screen.getByText('get_pods')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('does not link the last item even when it carries an href', () => {
    render(
      <Breadcrumbs
        items={[
          { label: 'Servers', href: '/servers' },
          { label: 'here', href: '/servers/here' },
        ]}
      />,
    );

    expect(screen.queryByRole('link', { name: 'here' })).toBeNull();
  });
});
