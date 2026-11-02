import { withInstallationQuery, withQuery } from './installationLink';

describe('withQuery', () => {
  it('adds the parameters, leaving out the empty ones', () => {
    expect(
      withQuery('/connectors/lab/jira', { q: 'get pods', effect: '' }),
    ).toBe('/connectors/lab/jira?q=get+pods');
  });

  it('adds no `?` when nothing is left', () => {
    expect(withQuery('/connectors/lab/jira', { q: undefined })).toBe(
      '/connectors/lab/jira',
    );
    expect(withQuery('/connectors/lab/jira')).toBe('/connectors/lab/jira');
  });
});

describe('withInstallationQuery', () => {
  it('scopes a list to the installation', () => {
    expect(withInstallationQuery('/connectors', 'lab')).toBe(
      '/connectors?installation=lab',
    );
  });

  it('puts further parameters after the installation', () => {
    expect(
      withInstallationQuery('/connectors', 'lab', { q: 'get pods', x: '' }),
    ).toBe('/connectors?installation=lab&q=get+pods');
  });

  it('encodes the values', () => {
    expect(withInstallationQuery('/connectors', 'a&b')).toBe(
      '/connectors?installation=a%26b',
    );
  });

  it('builds no link without an installation', () => {
    expect(withInstallationQuery('/connectors', '')).toBeUndefined();
  });
});
