import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/test-utils';
import { GitOpsManagedLabel } from './GitOpsManagedLabel';

describe('GitOpsManagedLabel', () => {
  it('makes the claim on its own when there is no source to offer', async () => {
    // A caller that reads provenance off plain labels (muster's MCP servers)
    // knows the resource is GitOps-managed but has no path to its manifest.
    // The trailing slot must then be absent, not an empty "not available".
    await renderInTestApp(<GitOpsManagedLabel />);

    expect(screen.getByText('Managed through GitOps')).toBeInTheDocument();
    expect(screen.queryByText('Source')).not.toBeInTheDocument();
    expect(screen.queryByText('n/a')).not.toBeInTheDocument();
  });

  it('links the resolved source', async () => {
    await renderInTestApp(
      <GitOpsManagedLabel
        source={{
          url: 'https://github.com/example/repo/tree/main',
          isLoading: false,
        }}
      />,
    );

    expect(screen.getByRole('link', { name: /Source/ })).toHaveAttribute(
      'href',
      'https://github.com/example/repo/tree/main',
    );
  });

  it('keeps the claim while the source is still being looked up', async () => {
    // The label is the assertion; the link is an extra. A slow lookup must not
    // hold back the one thing the caller has already established.
    await renderInTestApp(<GitOpsManagedLabel source={{ isLoading: true }} />);

    expect(screen.getByText('Managed through GitOps')).toBeInTheDocument();
    expect(screen.queryByText('Source')).not.toBeInTheDocument();
  });

  it('replaces the link with the failure reason when the lookup failed', async () => {
    const { container } = await renderInTestApp(
      <GitOpsManagedLabel
        source={{ isLoading: false, errorMessage: 'GitRepository not found' }}
      />,
    );

    expect(screen.getByText('Managed through GitOps')).toBeInTheDocument();
    expect(screen.queryByText('Source')).not.toBeInTheDocument();

    // ErrorStatus stands in for the link, and keeps the reason on a tooltip
    // that only reaches the DOM on hover -- so the icon beside the label's own
    // is what there is to assert on here.
    expect(container.querySelectorAll('svg')).toHaveLength(2);
  });
});
