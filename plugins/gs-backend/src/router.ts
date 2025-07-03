import {
  AuthService,
  DiscoveryService,
  HttpAuthService,
} from '@backstage/backend-plugin-api';
import { GSService } from '@giantswarm/backstage-plugin-gs-node';
import express from 'express';
import Router from 'express-promise-router';
import { KubernetesResourceFetcher } from './utils';
import { Cluster, List } from '@giantswarm/backstage-plugin-gs-common';

const CLUSTERS_PATH = '/apis/cluster.x-k8s.io/v1beta1/clusters';

export async function createRouter({
  auth,
  httpAuth,
  discovery,
  gsService,
}: {
  auth: AuthService;
  httpAuth: HttpAuthService;
  discovery: DiscoveryService;
  gsService: GSService;
}): Promise<express.Router> {
  const router = Router();
  router.use(express.json());

  router.post('/update-clusters', async (req, res) => {
    const clusterName = req.header('backstage-kubernetes-cluster');

    if (!clusterName) {
      throw new Error('Cluster name is required');
    }

    const credentials = await httpAuth.credentials(req);

    const kubernetesResourceFetcher = new KubernetesResourceFetcher(
      discovery,
      auth,
    );

    const kubernetesHeaders = Object.entries(req.headers).filter(([key]) => {
      return key.startsWith('backstage-kubernetes-');
    }) as [string, string][];

    const clustersResponse: List<Cluster> =
      await kubernetesResourceFetcher.proxyKubernetesRequest({
        clusterName,
        path: CLUSTERS_PATH,
        credentials,
        headers: kubernetesHeaders,
      });

    const clusters = clustersResponse.items;

    const clustersInfo = clusters
      .filter(
        cluster =>
          cluster.metadata.name !== clusterName &&
          Boolean(cluster.spec?.controlPlaneEndpoint),
      )
      .map(cluster => ({
        name: `${clusterName}-${cluster.metadata.name}`,
        url: `https://${cluster.spec?.controlPlaneEndpoint?.host}`,
        authProvider: 'pinniped',
        oidcTokenProvider: `pinniped-${clusterName}`,
      }));

    await gsService.updateClusters(clustersInfo, {
      credentials: await httpAuth.credentials(req, { allow: ['user'] }),
    });

    res.status(200).send();
  });

  return router;
}
