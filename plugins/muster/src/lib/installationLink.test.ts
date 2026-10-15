import { withInstallationQuery } from './installationLink';

describe('withInstallationQuery', () => {
  it('adds the installation as the query', () => {
    expect(withInstallationQuery('/workflows/deploy', 'lab')).toBe(
      '/workflows/deploy?installation=lab',
    );
  });

  it('encodes the installation', () => {
    expect(withInstallationQuery('/workflows/deploy', 'a b&c')).toBe(
      '/workflows/deploy?installation=a%20b%26c',
    );
  });

  it('adds nothing for an empty installation', () => {
    expect(withInstallationQuery('/workflows/deploy', '')).toBe(
      '/workflows/deploy',
    );
  });
});
