import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { ReleaseInfo } from './ReleaseInfo';

function renderReleaseInfo(releaseVersion?: string) {
  return renderInTestApp(<ReleaseInfo />, {
    config: releaseVersion ? { app: { releaseVersion } } : {},
  });
}

describe('ReleaseInfo', () => {
  it('links the repository and the release tag', async () => {
    await renderReleaseInfo('2.81.5');

    expect(
      screen.getByText(/provided by Giant Swarm, release/).textContent,
    ).toBe('This is backstage provided by Giant Swarm, release v2.81.5');
    expect(screen.getByRole('link', { name: 'backstage' })).toHaveAttribute(
      'href',
      'https://github.com/giantswarm/backstage',
    );
    expect(screen.getByRole('link', { name: 'v2.81.5' })).toHaveAttribute(
      'href',
      'https://github.com/giantswarm/backstage/releases/tag/v2.81.5',
    );
  });

  it('links a release candidate to its tag', async () => {
    await renderReleaseInfo('v2.81.6-rc.2');

    expect(screen.getByRole('link', { name: 'v2.81.6-rc.2' })).toHaveAttribute(
      'href',
      'https://github.com/giantswarm/backstage/releases/tag/v2.81.6-rc.2',
    );
  });

  it('shows a version without a tag as it is, unlinked', async () => {
    await renderReleaseInfo('2.81.5-3f2a9c1');

    expect(
      screen.getByText(/provided by Giant Swarm, release 2\.81\.5-3f2a9c1$/),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('renders nothing when the release version is unset', async () => {
    await renderReleaseInfo();

    expect(
      screen.queryByText(/provided by Giant Swarm/),
    ).not.toBeInTheDocument();
  });
});
