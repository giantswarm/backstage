import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import useDebounce from 'react-use/esm/useDebounce';
import qs from 'qs';

function useQueryParameters(key: string) {
  const location = useLocation();
  const parsed = qs.parse(location.search, {
    ignoreQueryPrefix: true,
  });
  // return parsed[key] as string | string[] | undefined;

  const queryParameter = parsed[key];
  const queryParameters = [queryParameter].flat().filter(Boolean) as string[];
  const resetValue = Array.isArray(queryParameter) && queryParameter[0] === '';

  return { queryParameters, resetValue };
}

export function useUrlState(key: string) {
  // const location = useLocation();
  const { queryParameters, resetValue } = useQueryParameters(key);
  const [value, setValue] = useState<string[]>(queryParameters);

  // useEffect(() => {
  //   if (resetValue || queryParameters.length) {
  //     setValue([]);
  //   }
  // }, [resetValue]);

  // useEffect(() => {
  //   if (queryParameter !== value) {
  //     setValue(queryParameter);
  //   }
  // }, [queryParameter, value]);

  useEffect(() => {
    // if (!value) {
    //   console.log('DISABLED', location.search);
    //   return;
    // }
    console.log('use debounce value', value, location.search);

    const queryParams =
      Array.isArray(value) && value.length === 0 ? undefined : value;

    const oldParams = qs.parse(location.search, {
      ignoreQueryPrefix: true,
    });
    console.log('oldParams', oldParams, location.search);
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
    // console.log('newParams', newParams);
    // console.log('location.search', location.search);
    if (newParams !== location.search) {
      console.log('setting newParams to URL', newParams);
      const newUrl = `${window.location.pathname}${newParams}`;
      window.history?.replaceState(null, document.title, newUrl);
    }
  }, [key, value]);

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
