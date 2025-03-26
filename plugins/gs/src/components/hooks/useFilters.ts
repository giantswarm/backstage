import { useCallback, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import useMountedState from 'react-use/esm/useMountedState';
import useDebounce from 'react-use/esm/useDebounce';
import qs from 'qs';
import { useInstallations } from './useInstallations';

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

type Options = {
  persistToURL?: boolean;
};

export function useFilters<Filters extends DefaultFilters = DefaultFilters>(
  options: Options = {},
): FiltersData<Filters> {
  const persistToURL = options.persistToURL ?? true;

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

  const { selectedInstallations } = useInstallations();

  useDebounce(
    () => {
      if (!persistToURL) {
        return;
      }

      const installationsQueryParams = selectedInstallations;
      const filtersQueryParams = Object.keys(requestedFilters).reduce(
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
          {
            ...oldParams,
            installations: installationsQueryParams,
            filters: filtersQueryParams,
          },
          { addQueryPrefix: true, arrayFormat: 'repeat' },
        );
        const newUrl = `${window.location.pathname}${newParams}`;
        window.history?.replaceState(null, document.title, newUrl);
      }
    },
    10,
    [
      isMounted,
      persistToURL,
      location.search,
      requestedFilters,
      selectedInstallations,
    ],
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
