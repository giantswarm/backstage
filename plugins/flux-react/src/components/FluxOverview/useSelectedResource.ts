import { useNavigate, useSearchParams } from 'react-router-dom';
import qs from 'qs';

export function useSelectedResource() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const kind = searchParams.get('kind');
  const namespace = searchParams.get('namespace');
  const name = searchParams.get('name');

  const selectedResourceRef =
    kind && namespace && name ? { kind, namespace, name } : undefined;

  return {
    selectedResourceRef,
    clearSelectedResource: () => {
      const oldParams = qs.parse(location.search, {
        ignoreQueryPrefix: true,
        allowEmptyArrays: true,
      });
      const newParams = qs.stringify(
        {
          ...oldParams,
          kind: undefined,
          namespace: undefined,
          name: undefined,
        },
        {
          addQueryPrefix: true,
          arrayFormat: 'repeat',
          allowEmptyArrays: true,
        },
      );
      if (newParams !== location.search) {
        const newUrl = `${window.location.pathname}${newParams}`;
        navigate(newUrl);
      }
    },
  };
}
