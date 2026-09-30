import { renderInTestApp } from '@backstage/frontend-test-utils';
import { entityRouteRef } from '@backstage/plugin-catalog-react';
import { screen } from '@testing-library/react';
import { installationsRouteRef } from '../../../routes';
import { InstallationLink } from './InstallationLink';

const entityRoute = { '/catalog/:namespace/:kind/:name': entityRouteRef };

describe('InstallationLink', () => {
  it('links to the installation entity where the installations page is enabled', async () => {
    await renderInTestApp(<InstallationLink installationName="gazelle" />, {
      mountedRoutes: {
        ...entityRoute,
        '/installations': installationsRouteRef,
      },
    });

    expect(screen.getByRole('link', { name: 'gazelle' })).toHaveAttribute(
      'href',
      '/catalog/default/resource/gazelle',
    );
  });

  it('shows the plain name where the installations page is disabled', async () => {
    await renderInTestApp(<InstallationLink installationName="gazelle" />, {
      mountedRoutes: entityRoute,
    });

    expect(screen.getByText('gazelle')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
