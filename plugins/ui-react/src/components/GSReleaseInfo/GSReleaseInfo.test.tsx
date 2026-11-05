import { renderInTestApp } from '@backstage/test-utils';
import { screen } from '@testing-library/react';
import { ShellScopeProvider } from '../ShellScope';
import { GSReleaseInfo } from './GSReleaseInfo';

describe('GSReleaseInfo', () => {
  it('links the repository and the release tag', async () => {
    await renderInTestApp(<GSReleaseInfo version="2.81.5" />);

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
    await renderInTestApp(<GSReleaseInfo version="v2.81.6-rc.2" />);

    expect(screen.getByRole('link', { name: 'v2.81.6-rc.2' })).toHaveAttribute(
      'href',
      'https://github.com/giantswarm/backstage/releases/tag/v2.81.6-rc.2',
    );
  });

  it('shows a version without a tag as it is, unlinked', async () => {
    await renderInTestApp(<GSReleaseInfo version="2.81.5-3f2a9c1" />);

    expect(screen.getByRole('paragraph')).toHaveTextContent(
      /provided by Giant Swarm, release 2\.81\.5-3f2a9c1$/,
    );
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('shortens the commit of a branch build, the full version in its title', async () => {
    const version = '2.81.5-3f2a9c1d0e8b7a6f5e4d3c2b1a0f9e8d7c6b5a49';
    await renderInTestApp(<GSReleaseInfo version={version} />);

    expect(screen.getByText('2.81.5-3f2a9c1')).toHaveAttribute(
      'title',
      version,
    );
  });

  it('marks both new-tab links with an arrow inside the shell', async () => {
    await renderInTestApp(
      <ShellScopeProvider>
        <GSReleaseInfo version="2.81.5" />
      </ShellScopeProvider>,
    );

    for (const name of ['backstage ↗', 'v2.81.5 ↗']) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });
});
