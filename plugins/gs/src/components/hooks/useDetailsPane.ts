import { useSearchParams } from 'react-router-dom';

type DetailsPaneParams = {
  installationName: string;
  apiVersion: string;
  kind: string;
  namespace?: string;
  name: string;
};

export const DEPLOYMENT_DETAILS_PANE_ID = 'deploymentDetails';
export const KRATIX_RESOURCE_REQUEST_DETAILS_PANE_ID =
  'kratixResourceRequestDetails';

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

      return `${baseRoute}?${params.toString()}`;
    },
    getParams(): {
      installationName: string | null;
      kind: string | null;
      namespace: string | null;
      name: string | null;
    } {
      const installationName = searchParams.get('installation');
      const kind = searchParams.get('kind');
      const namespace = searchParams.get('namespace');
      const name = searchParams.get('name');

      return {
        installationName,
        kind,
        namespace,
        name,
      };
    },
    close() {
      setSearchParams(params => {
        params.delete('installation');
        params.delete('kind');
        params.delete('apiVersion');
        params.delete('name');
        params.delete('namespace');
        params.delete('pane');

        return params;
      });
    },
  };
}
