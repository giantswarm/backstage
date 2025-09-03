import { CustomResourceMatcher } from '../../lib/k8s/CustomResourceMatcher';
import * as k8sUrl from './k8sUrl';

const baseUrl = 'https://base-url.io';

export function getK8sListPath(
  gvk: CustomResourceMatcher,
  {
    namespace,
    labelSelector,
  }: {
    namespace?: string;
    labelSelector?: k8sUrl.IK8sLabelSelector;
  } = {},
) {
  const url = k8sUrl.create({
    baseUrl,
    isCore: gvk.isCore,
    apiVersion: gvk.isCore ? undefined : `${gvk.group}/${gvk.apiVersion}`,
    kind: gvk.plural,
    namespace,
    labelSelector,
  });

  return `${url.pathname}${url.search}`;
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

export function getK8sCreatePath(gvk: CustomResourceMatcher) {
  const url = k8sUrl.create({
    baseUrl,
    apiVersion: `${gvk.group}/${gvk.apiVersion}`,
    kind: gvk.plural,
  });

  return url.pathname;
}

export function getK8sListDeploymentsPath({
  namespace,
  labelSelector,
}: {
  namespace?: string;
  labelSelector?: k8sUrl.IK8sLabelSelector;
}) {
  const url = k8sUrl.create({
    baseUrl,
    kind: 'deployments',
    namespace,
    labelSelector,
    isCore: true,
  });

  return `${url.pathname}${url.search}`;
}
