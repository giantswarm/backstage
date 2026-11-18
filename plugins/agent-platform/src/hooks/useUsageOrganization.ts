import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  formatUsageOrganizationParam,
  parseUsageOrganizationParam,
  USAGE_ORGANIZATION_PARAM,
} from '../lib/usageOrganization';

export type UsageOrganizationView = {
  /**
   * The namespace the gateway views are narrowed to, or `undefined` for every
   * organization.
   */
  namespace: string | undefined;
  setNamespace: (namespace: string | undefined) => void;
};

/**
 * The Usage screen's selected organization, kept in the URL
 * (`?organization=org-acme`), beside the window (`useUsageWindow`) and for
 * the same reasons: the scope survives a tab switch and travels in a shared
 * link, and the default (every organization) stays out of the URL.
 *
 * `replace` rather than push: narrowing the view is scope, not navigation.
 */
export function useUsageOrganization(): UsageOrganizationView {
  const [searchParams, setSearchParams] = useSearchParams();
  const namespace = parseUsageOrganizationParam(
    searchParams.get(USAGE_ORGANIZATION_PARAM),
  );

  const setNamespace = useCallback(
    (next: string | undefined) => {
      setSearchParams(
        current => {
          const params = new URLSearchParams(current);
          const value = formatUsageOrganizationParam(next);
          if (value === undefined) {
            params.delete(USAGE_ORGANIZATION_PARAM);
          } else {
            params.set(USAGE_ORGANIZATION_PARAM, value);
          }
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return { namespace, setNamespace };
}
