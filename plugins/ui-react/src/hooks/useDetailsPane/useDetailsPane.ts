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
    ) {
      const params = new URLSearchParams({
        [prefixKey('pane', prefix)]: paneId,
        [prefixKey('cluster', prefix)]: cluster,
        [prefixKey('kind', prefix)]: kind,
        [prefixKey('name', prefix)]: name,
      });
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
