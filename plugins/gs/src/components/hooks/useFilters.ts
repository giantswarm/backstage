import { useCallback, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import useMountedState from 'react-use/esm/useMountedState';
import useDebounce from 'react-use/esm/useDebounce';
import qs from 'qs';

export type FacetFilter = {
  filter: (item: any) => boolean;

  toQueryValue?: () => string | string[];
};

export type DefaultFilters = {};

export type FiltersData<Filters extends DefaultFilters = DefaultFilters> = {
  filters: Filters;
  updateFilters: (filters: Partial<Filters>) => void;
  queryParameters: Record<string, string | string[]>;
};

export function useFilters<
  Filters extends DefaultFilters = DefaultFilters,
>(): FiltersData<Filters> {
  const [requestedFilters, setRequestedFilters] = useState<Filters>(
    {} as Filters,
  );

  const updateFilters = useCallback((newFilters: Partial<Filters>) => {
    setRequestedFilters(prevFilters => {
      return { ...prevFilters, ...newFilters };
    });
  }, []);

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
          const filter = requestedFilters[key as keyof Filters] as
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
