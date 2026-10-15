import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { workflowsRouteRef } from '../../routes';
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
      mountedRoutes: { '/agent-platform/workflows': workflowsRouteRef },
    });

    expect(screen.getByTestId('href')).toHaveTextContent(
      '/agent-platform/workflows/deploy?installation=lab',
    );
  });

  it('has no link while the workflows route is not mounted', async () => {
    await renderInTestApp(<Probe />);

    expect(screen.getByTestId('href')).toHaveTextContent('undefined');
  });
});
