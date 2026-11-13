/**
 * The installation fixture mode serves, the same as the fixture `MusterApi`'s
 * (`plugins/muster/src/apis/fixtures/MusterFixtureApi.ts`).
 */
export const FIXTURE_INSTALLATION = 'meadow';

/** The person fixture mode signs in: the guest of the dev server. */
export const FIXTURE_USER = {
  sub: 'user:development/guest',
  email: 'guest@example.com',
} as const;
