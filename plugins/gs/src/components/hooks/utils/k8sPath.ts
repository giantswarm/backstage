import { CustomResourceMatcher } from '@backstage/plugin-kubernetes-common';
import * as k8sUrl from './k8sUrl';

const baseUrl = 'https://base-url.io';

export function getK8sListPath(gvk: CustomResourceMatcher) {
  const url = k8sUrl.create({
    baseUrl,
    apiVersion: `${gvk.group}/${gvk.apiVersion}`,
    kind: gvk.plural,
  });

  return url.pathname;
}

export function getK8sGetPath(
  gvk: CustomResourceMatcher,
  name: string,
  namespace?: string,
) {
  const url = k8sUrl.create({
    baseUrl,
    apiVersion: `${gvk.group}/${gvk.apiVersion}`,
    kind: gvk.plural,
    name,
    namespace,
  });

  return url.pathname;
}
