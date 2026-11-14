import {
  FIXTURE_INSTALLATION,
  FIXTURE_INSTALLATIONS,
  isFixtureInstallation,
} from '@giantswarm/backstage-plugin-gs-common';

export { FIXTURE_INSTALLATION };

/** The person fixture mode signs in: the guest of the dev server. */
export const FIXTURE_USER = {
  sub: 'user:development/guest',
  email: 'guest@example.com',
} as const;

/**
 * Fails a call for an installation fixture mode does not serve, loudly, like
 * the fixture Kubernetes API and `MusterApi`: a page that targets the wrong
 * installation must not show a fixture installation's data.
 */
export function served(installation: string): void {
  if (!isFixtureInstallation(installation)) {
    const error = new Error(
      `Fixture mode serves no installation ${installation}, only ${FIXTURE_INSTALLATIONS.join(', ')}.`,
    );
    error.name = 'NotFoundError';
    // eslint-disable-next-line no-console
    console.error(error.message);
    throw error;
  }
}
