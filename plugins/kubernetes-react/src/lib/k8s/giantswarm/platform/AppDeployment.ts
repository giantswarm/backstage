import { crds } from '@giantswarm/k8s-types';
import { ResourceRequest } from './ResourceRequest';

type AppDeploymentInterface = crds.giantswarm.v1beta1.AppDeployment;

export class AppDeployment extends ResourceRequest<AppDeploymentInterface> {
  static apiVersion = 'v1beta1';
  static group = 'promise.platform.giantswarm.io';
  static kind = 'AppDeployment' as const;
  static plural = 'appdeployments';
}
