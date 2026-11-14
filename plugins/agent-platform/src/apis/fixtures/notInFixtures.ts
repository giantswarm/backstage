/**
 * The error of a call fixture mode does not answer yet. It fails the call and
 * logs, so a page that reaches it shows an error rather than made-up
 * emptiness: extend the fixtures (docs/fixtures.md).
 */
export function notInFixtures(what: string): Error {
  const error = new Error(
    `Fixture mode does not answer ${what} yet: extend the fixtures (docs/fixtures.md).`,
  );
  // eslint-disable-next-line no-console
  console.error(error.message);
  return error;
}
