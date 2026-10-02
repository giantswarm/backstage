import { useSearchParams } from 'react-router-dom';

type DetailsPaneParams = {
  cluster: string;
  clusterName?: string;
  apiVersion?: string;
  kind: string;
  namespace?: string;
  name: string;
};

type DetailsPaneOptions = {
  prefix?: string;
};

/** The query parameters a pane is described by, before any prefix. */
const PANE_KEYS = [
  'pane',
  'cluster',
  'clusterName',
  'apiVersion',
  'kind',
  'namespace',
  'name',
] as const;

function prefixKey(key: string, prefix?: string): string {
  return prefix ? `${prefix}-${key}` : key;
}

export function useDetailsPane(paneId: string, options?: DetailsPaneOptions) {
  const [searchParams, setSearchParams] = useSearchParams();
  const prefix = options?.prefix;

  const paneKey = prefixKey('pane', prefix);
  const pane = searchParams.get(paneKey);

  return {
    isOpen: pane === paneId,
    /**
     * The link that opens this pane over `baseRoute`. With `keepSearch` the
     * current query string is kept (minus any pane parameters it carries
     * already), for a link that opens the pane over the page it is on
     * without dropping that page's own parameters -- an `?installation=`
     * scope, a filter.
     */
    getRoute(
      baseRoute: string,
      {
        cluster,
        clusterName,
        apiVersion,
        kind,
        namespace,
        name,
      }: DetailsPaneParams,
      { keepSearch = false }: { keepSearch?: boolean } = {},
    ) {
      const params = new URLSearchParams(keepSearch ? searchParams : undefined);
      for (const key of PANE_KEYS) {
        params.delete(prefixKey(key, prefix));
      }
      params.set(prefixKey('pane', prefix), paneId);
      params.set(prefixKey('cluster', prefix), cluster);
      params.set(prefixKey('kind', prefix), kind);
      params.set(prefixKey('name', prefix), name);
      if (clusterName) {
        params.set(prefixKey('clusterName', prefix), clusterName);
      }
      if (apiVersion) {
        params.set(prefixKey('apiVersion', prefix), apiVersion);
      }
      if (namespace) {
        params.set(prefixKey('namespace', prefix), namespace);
      }

      return `${baseRoute}?${params.toString()}`;
    },
    getParams(): {
      cluster: string | null;
      clusterName: string | null;
      kind: string | null;
      namespace: string | null;
      name: string | null;
    } {
      const cluster = searchParams.get(prefixKey('cluster', prefix));
      const clusterName = searchParams.get(prefixKey('clusterName', prefix));
      const kind = searchParams.get(prefixKey('kind', prefix));
      const namespace = searchParams.get(prefixKey('namespace', prefix));
      const name = searchParams.get(prefixKey('name', prefix));

      return {
        cluster,
        clusterName,
        kind,
        namespace,
        name,
      };
    },
    open(params: DetailsPaneParams) {
      setSearchParams(prev => {
        prev.set(paneKey, paneId);
        prev.set(prefixKey('cluster', prefix), params.cluster);
        prev.set(prefixKey('kind', prefix), params.kind);
        prev.set(prefixKey('name', prefix), params.name);
        if (params.clusterName) {
          prev.set(prefixKey('clusterName', prefix), params.clusterName);
        } else {
          prev.delete(prefixKey('clusterName', prefix));
        }
        if (params.namespace) {
          prev.set(prefixKey('namespace', prefix), params.namespace);
        } else {
          prev.delete(prefixKey('namespace', prefix));
        }
        if (params.apiVersion) {
          prev.set(prefixKey('apiVersion', prefix), params.apiVersion);
        }

        return prev;
      });
    },
    close() {
      setSearchParams(params => {
        params.delete(prefixKey('cluster', prefix));
        params.delete(prefixKey('clusterName', prefix));
        params.delete(prefixKey('kind', prefix));
        params.delete(prefixKey('apiVersion', prefix));
        params.delete(prefixKey('name', prefix));
        params.delete(prefixKey('namespace', prefix));
        params.delete(paneKey);

        return params;
      });
    },
  };
}
