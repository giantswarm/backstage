import { useCallback, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import useMountedState from 'react-use/esm/useMountedState';
import useDebounce from 'react-use/esm/useDebounce';
import qs from 'qs';
import { FacetFilter, KindFilter } from '../DeploymentsPage/filters/filters';

export type DefaultDeploymentFilters = {
  kind?: KindFilter;
};

export type FiltersData<
  DeploymentFilters extends DefaultDeploymentFilters = DefaultDeploymentFilters,
> = {
  filters: DeploymentFilters;
  updateFilters: (filters: Partial<DeploymentFilters>) => void;
  queryParameters: Record<string, string | string[]>;
};

export function useFilters<
  DeploymentFilters extends DefaultDeploymentFilters = DefaultDeploymentFilters,
>(): FiltersData<DeploymentFilters> {
  const [requestedFilters, setRequestedFilters] = useState<DeploymentFilters>(
    {} as DeploymentFilters,
  );

  const updateFilters = useCallback(
    (newFilters: Partial<DeploymentFilters>) => {
      setRequestedFilters(prevFilters => {
        return { ...prevFilters, ...newFilters };
      });
    },
    [],
  );

  const location = useLocation();
  const isMounted = useMountedState();
  const { queryParameters } = useMemo(() => {
    const parsed = qs.parse(location.search, {
      ignoreQueryPrefix: true,
    });

    return {
      queryParameters: (parsed.filters ?? {}) as Record<
        string,
        string | string[]
      >,
    };
  }, [location.search]);

  useDebounce(
    () => {
      const queryParams = Object.keys(requestedFilters).reduce(
        (params, key) => {
          const filter = requestedFilters[key as keyof DeploymentFilters] as
            | FacetFilter
            | undefined;
          if (filter?.toQueryValue) {
            params[key] = filter.toQueryValue();
          }
          return params;
        },
        {} as Record<string, string | string[]>,
      );

      if (isMounted()) {
        const oldParams = qs.parse(location.search, {
          ignoreQueryPrefix: true,
        });
        const newParams = qs.stringify(
          { ...oldParams, filters: queryParams },
          { addQueryPrefix: true, arrayFormat: 'repeat' },
        );
        const newUrl = `${window.location.pathname}${newParams}`;
        window.history?.replaceState(null, document.title, newUrl);
      }
    },
    10,
    [isMounted, location.search, requestedFilters],
  );

  return useMemo(
    () => ({
      filters: requestedFilters,
      queryParameters,
      updateFilters,
    }),
    [requestedFilters, queryParameters, updateFilters],
  );
}
