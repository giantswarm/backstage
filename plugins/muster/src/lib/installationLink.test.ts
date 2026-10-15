import { withInstallationQuery } from './installationLink';

describe('withInstallationQuery', () => {
  it('adds the installation as the query', () => {
    expect(withInstallationQuery('/workflows/deploy', 'lab')).toBe(
      '/workflows/deploy?installation=lab',
    );
  });

  it('puts further parameters after the installation', () => {
    expect(
      withInstallationQuery('/connectors', 'lab', { q: 'get pods', x: '' }),
    ).toBe('/connectors?installation=lab&q=get+pods');
  });

  it('encodes the values', () => {
    expect(withInstallationQuery('/workflows/deploy', 'a&b')).toBe(
      '/workflows/deploy?installation=a%26b',
    );
  });

  it('adds nothing for an empty installation', () => {
    expect(withInstallationQuery('/workflows/deploy', '')).toBe(
      '/workflows/deploy',
    );
  });
});
