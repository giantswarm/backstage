import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';

import { skillsRouteRef } from '../routes';
import { useSkillPaths } from './useSkillPaths';

const github = { repoUrl: 'https://github.com/acme/skills', path: 'triage' };
// A repository path holding the address's own `-` mark has no address.
const elsewhere = { repoUrl: 'https://example.com/a/-/skills', path: '' };

function Probe() {
  const paths = useSkillPaths();
  return (
    <ul>
      <li data-testid="detail">{String(paths.detail(github))}</li>
      <li data-testid="edit">{String(paths.edit(github))}</li>
      <li data-testid="unaddressable">{String(paths.detail(elsewhere))}</li>
    </ul>
  );
}

describe('useSkillPaths', () => {
  it('builds the detail and edit hrefs under the skills route', async () => {
    await renderInTestApp(<Probe />, {
      mountedRoutes: { '/customize/skills': skillsRouteRef },
    });

    expect(screen.getByTestId('detail')).toHaveTextContent(
      '/customize/skills/acme/skills/triage',
    );
    expect(screen.getByTestId('edit')).toHaveTextContent(
      '/customize/skills/edit/acme/skills/triage',
    );
    expect(screen.getByTestId('unaddressable')).toHaveTextContent('undefined');
  });

  it('has no hrefs while the skills route is not mounted', async () => {
    await renderInTestApp(<Probe />);

    expect(screen.getByTestId('detail')).toHaveTextContent('undefined');
    expect(screen.getByTestId('edit')).toHaveTextContent('undefined');
  });
});
