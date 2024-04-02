import { useRouteRef } from '@backstage/core-plugin-api';
import { getDeploymentGVK } from '@internal/plugin-gs-common';
import { useSearchParams } from 'react-router-dom';
import { entityDeploymentsRouteRef } from '../../routes';

type RouteParams = {
  installationName: string;
  apiVersion: string;
  kind: string;
  namespace?: string;
  name: string;
};

const PANE_ID = 'deploymentDetails';

export function useDeploymentDetailsPane() {
  const [searchParams, setSearchParams] = useSearchParams();
  const entityDeploymentsRouteLink = useRouteRef(entityDeploymentsRouteRef);

  const pane = searchParams.get('pane');

  return {
    isOpen: pane === PANE_ID,
    getRoute({
      installationName,
      apiVersion,
      kind,
      namespace,
      name,
    }: RouteParams) {
      const params = new URLSearchParams({
        pane: PANE_ID,
        installation: installationName,
        apiVersion,
        kind,
        namespace: namespace ?? '',
        name,
      });

      return `${entityDeploymentsRouteLink()}?${params.toString()}`;
    },
    getDeploymentDetails() {
      const installationName = searchParams.get('installation');
      const kind = searchParams.get('kind');
      const apiVersion = searchParams.get('apiVersion');
      const namespace = searchParams.get('namespace');
      const name = searchParams.get('name');
      const gvk = getDeploymentGVK(kind ?? '', apiVersion ?? '');

      return {
        installationName,
        kind,
        namespace,
        name,
        gvk,
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
