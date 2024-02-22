import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { CustomResourceMatcher } from '@backstage/plugin-kubernetes-common';
import * as k8sUrl from '../../model/services/mapi/k8sUrl';

export function useK8sListPath(gvk: CustomResourceMatcher) {
  const configApi = useApi(configApiRef);
  const baseUrl = configApi.getString('app.baseUrl');
  const url = k8sUrl.create({
    baseUrl,
    apiVersion: `${gvk.group}/${gvk.apiVersion}`,
    kind: gvk.plural,
  });

  return url.pathname;
}

export function useK8sGetPath(gvk: CustomResourceMatcher, name: string, namespace?: string) {
  const configApi = useApi(configApiRef);
  const baseUrl = configApi.getString('app.baseUrl');
  const url = k8sUrl.create({
    baseUrl,
    apiVersion: `${gvk.group}/${gvk.apiVersion}`,
    kind: gvk.plural,
    name,
    namespace,
  });

  return url.pathname;
}
