import { crds } from '@giantswarm/k8s-types';
import { ResourceRequest } from './ResourceRequest';

type AppDeploymentInterface = crds.giantswarm.v1beta1.AppDeployment;

export class AppDeployment extends ResourceRequest<AppDeploymentInterface> {
  static readonly supportedVersions = ['v1beta1'] as const;
  static readonly group = 'promise.platform.giantswarm.io';
  static readonly kind = 'AppDeployment' as const;
  static readonly plural = 'appdeployments';
}
