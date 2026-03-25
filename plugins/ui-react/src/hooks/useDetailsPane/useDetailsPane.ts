import { useSearchParams } from 'react-router-dom';

type DetailsPaneParams = {
  installationName: string;
  apiVersion: string;
  kind: string;
  namespace?: string;
  name: string;
  clusterName?: string;
};

export function useDetailsPane(paneId: string) {
  const [searchParams, setSearchParams] = useSearchParams();
  const pane = searchParams.get('pane');

  return {
    isOpen: pane === paneId,
    getRoute(
      baseRoute: string,
      {
        installationName,
        apiVersion,
        kind,
        namespace,
        name,
        clusterName,
      }: DetailsPaneParams,
    ) {
      const params = new URLSearchParams({
        pane: paneId,
        installation: installationName,
        apiVersion,
        kind,
        name,
      });
      if (namespace) {
        params.set('namespace', namespace);
      }
      if (clusterName) {
        params.set('cluster', clusterName);
      }

      return `${baseRoute}?${params.toString()}`;
    },
    getParams(): {
      installationName: string | null;
      kind: string | null;
      namespace: string | null;
      name: string | null;
      clusterName: string | null;
    } {
      const installationName = searchParams.get('installation');
      const kind = searchParams.get('kind');
      const namespace = searchParams.get('namespace');
      const name = searchParams.get('name');
      const clusterName = searchParams.get('cluster');

      return {
        installationName,
        kind,
        namespace,
        name,
        clusterName,
      };
    },
    close() {
      setSearchParams(params => {
        params.delete('installation');
        params.delete('kind');
        params.delete('apiVersion');
        params.delete('name');
        params.delete('namespace');
        params.delete('cluster');
        params.delete('pane');

        return params;
      });
    },
  };
}
