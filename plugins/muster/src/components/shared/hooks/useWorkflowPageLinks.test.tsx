import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { workflowsRouteRef } from '../../../routes';
import { useWorkflowPageLinks } from './useWorkflowPageLinks';

function Probe() {
  const links = useWorkflowPageLinks();
  return (
    <span data-testid="href">{String(links.workflow('deploy', 'lab'))}</span>
  );
}

describe('useWorkflowPageLinks', () => {
  it('links a workflow on the installation it runs on', async () => {
    await renderInTestApp(<Probe />, {
      mountedRoutes: { '/customize/workflows': workflowsRouteRef },
    });

    expect(screen.getByTestId('href')).toHaveTextContent(
      '/customize/workflows/lab/deploy',
    );
  });

  it('has no link without an installation', async () => {
    function NoInstallation() {
      const links = useWorkflowPageLinks();
      return (
        <span data-testid="href">{String(links.workflow('deploy', ''))}</span>
      );
    }
    await renderInTestApp(<NoInstallation />, {
      mountedRoutes: { '/customize/workflows': workflowsRouteRef },
    });

    expect(screen.getByTestId('href')).toHaveTextContent('undefined');
  });

  it('has no link while the workflows route is not mounted', async () => {
    await renderInTestApp(<Probe />);

    expect(screen.getByTestId('href')).toHaveTextContent('undefined');
  });
});
