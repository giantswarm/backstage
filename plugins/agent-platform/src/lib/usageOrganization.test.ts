import {
  formatUsageOrganizationParam,
  parseUsageOrganizationParam,
  USAGE_ORGANIZATION_PARAM,
  withUsageOrganization,
} from './usageOrganization';

describe('parseUsageOrganizationParam', () => {
  it('reads a namespace', () => {
    expect(parseUsageOrganizationParam('org-acme')).toBe('org-acme');
    expect(parseUsageOrganizationParam('kagent')).toBe('kagent');
    expect(parseUsageOrganizationParam(' team-x ')).toBe('team-x');
  });

  it('is every organization when the parameter is absent', () => {
    expect(parseUsageOrganizationParam(null)).toBeUndefined();
    expect(parseUsageOrganizationParam(undefined)).toBeUndefined();
    expect(parseUsageOrganizationParam('')).toBeUndefined();
  });

  it('is every organization for a value that is no namespace name', () => {
    // A hand-edited URL must not leave the control claiming one scope while
    // the page queries another.
    expect(parseUsageOrganizationParam('Org Acme')).toBeUndefined();
    expect(parseUsageOrganizationParam('org-acme"}')).toBeUndefined();
    expect(parseUsageOrganizationParam('-leading')).toBeUndefined();
    expect(parseUsageOrganizationParam('*')).toBeUndefined();
  });
});

describe('formatUsageOrganizationParam', () => {
  it('keeps every organization out of the URL', () => {
    expect(formatUsageOrganizationParam(undefined)).toBeUndefined();
    expect(formatUsageOrganizationParam('')).toBeUndefined();
  });

  it('writes what parse reads', () => {
    expect(
      parseUsageOrganizationParam(formatUsageOrganizationParam('org-acme')),
    ).toBe('org-acme');
  });
});

describe('withUsageOrganization', () => {
  it('sets the scope beside the other parameters', () => {
    expect(withUsageOrganization('/usage/cost', '?window=7d', 'org-acme')).toBe(
      `/usage/cost?window=7d&${USAGE_ORGANIZATION_PARAM}=org-acme`,
    );
  });

  it('replaces a scope already there', () => {
    expect(
      withUsageOrganization(
        '/usage/cost',
        `?${USAGE_ORGANIZATION_PARAM}=kagent&window=7d`,
        'org-acme',
      ),
    ).toBe(`/usage/cost?${USAGE_ORGANIZATION_PARAM}=org-acme&window=7d`);
  });

  it('removes the scope for every organization, and the question mark with it', () => {
    expect(
      withUsageOrganization(
        '/usage/cost',
        `?${USAGE_ORGANIZATION_PARAM}=org-acme`,
        undefined,
      ),
    ).toBe('/usage/cost');
    expect(
      withUsageOrganization(
        '/usage/cost',
        `?${USAGE_ORGANIZATION_PARAM}=org-acme&window=7d`,
        undefined,
      ),
    ).toBe('/usage/cost?window=7d');
  });
});
