import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from '../KubeObject';

type AzureMachineTemplateInterface = crds.capz.v1beta1.AzureMachineTemplate;

export class AzureMachineTemplate extends KubeObject<AzureMachineTemplateInterface> {
  static readonly supportedVersions = ['v1beta1'] as const;
  static readonly group = 'infrastructure.cluster.x-k8s.io';
  static readonly kind = 'AzureMachineTemplate' as const;
  static readonly plural = 'azuremachinetemplates';

  getVmSize(): string | undefined {
    return this.jsonData.spec?.template?.spec?.vmSize;
  }
}
