import { useEffect, useMemo, useState } from 'react';
import qs from 'qs';

function useQueryParameters(key: string) {
  const parsed = qs.parse(location.search, {
    ignoreQueryPrefix: true,
    allowEmptyArrays: true,
  });

  const queryParameter = parsed[key];
  const queryParameters = [queryParameter].flat().filter(Boolean) as string[];

  return {
    queryParameters,
  };
}

export function useUrlState(
  key: string,
  { multiple, enabled }: { multiple: boolean; enabled: boolean } = {
    multiple: false,
    enabled: true,
  },
) {
  const { queryParameters } = useQueryParameters(key);
  const [value, setValue] = useState<string[]>(queryParameters);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const queryParams = multiple ? value : value[0];

    const oldParams = qs.parse(location.search, {
      ignoreQueryPrefix: true,
      allowEmptyArrays: true,
    });

    const newParams = qs.stringify(
      {
        ...oldParams,
        [key]: queryParams,
      },
      {
        addQueryPrefix: true,
        arrayFormat: 'repeat',
        allowEmptyArrays: true,
      },
    );

    if (newParams !== location.search) {
      const newUrl = `${window.location.pathname}${newParams}`;
      window.history?.replaceState(null, document.title, newUrl);
    }
  }, [key, multiple, value, enabled]);

  return useMemo(
    () => ({
      value,
      setValue: (item: string | string[] | null) => {
        const itemsToSave = [item].flat().filter(Boolean) as string[];
        setValue(itemsToSave);
      },
    }),
    [value],
  );
}
