import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('lets a long crumb break inside a phone’s width', () => {
    render(
      <Breadcrumbs
        items={[
          { label: 'Workflows', href: '/workflows' },
          {
            label: 'rotate_cluster_certificates_for_all_workload_clusters',
            href: '/workflows/rotate',
          },
          { label: 'check_certificate_expiry_and_renew_if_needed' },
        ]}
      />,
    );

    for (const item of screen.getAllByRole('listitem')) {
      expect(item).toHaveStyle({ minWidth: '0' });
    }
    expect(
      screen.getByRole('link', {
        name: 'rotate_cluster_certificates_for_all_workload_clusters',
      }),
    ).toHaveStyle({ overflowWrap: 'anywhere' });
    expect(
      screen.getByText('check_certificate_expiry_and_renew_if_needed'),
    ).toHaveStyle({ overflowWrap: 'anywhere' });
  });

  describe('the back arrow', () => {
    it('leads to the parent, first in the trail and reachable by keyboard', async () => {
      render(
        <Breadcrumbs
          items={[
            { label: 'Connectors', href: '/connectors' },
            { label: 'kubernetes', href: '/connectors/kubernetes' },
            { label: 'get_pods' },
          ]}
        />,
      );

      const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
      const back = within(nav).getByRole('link', {
        name: 'Back to kubernetes',
      });
      expect(back).toHaveAttribute('href', '/connectors/kubernetes');
      expect(back).not.toHaveAttribute('target');
      expect(within(nav).getAllByRole('link')[0]).toBe(back);

      await userEvent.tab();
      expect(back).toHaveFocus();
    });

    it('skips an unlinked ancestor for the nearest linked one', () => {
      render(
        <Breadcrumbs
          items={[
            { label: 'Workflows', href: '/workflows' },
            { label: 'Runs' },
            { label: 'run-42' },
          ]}
        />,
      );

      expect(
        screen.getByRole('link', { name: 'Back to Workflows' }),
      ).toHaveAttribute('href', '/workflows');
    });

    it('is absent when no ancestor has a link', () => {
      render(
        <Breadcrumbs
          items={[{ label: 'Workflows' }, { label: 'run-42', href: '/r' }]}
        />,
      );

      expect(screen.queryByRole('link', { name: /^Back to/ })).toBeNull();
    });

    it('is absent on a one-item trail', () => {
      render(<Breadcrumbs items={[{ label: 'Agents', href: '/agents' }]} />);

      expect(screen.queryByRole('link')).toBeNull();
    });
  });
});
