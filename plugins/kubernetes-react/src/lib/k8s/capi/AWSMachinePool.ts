import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from '../KubeObject';

type AWSMachinePoolInterface = crds.capa.v1beta2.AWSMachinePool;

export class AWSMachinePool extends KubeObject<AWSMachinePoolInterface> {
  static readonly supportedVersions = ['v1beta2'] as const;
  static readonly group = 'infrastructure.cluster.x-k8s.io';
  static readonly kind = 'AWSMachinePool' as const;
  static readonly plural = 'awsmachinepools';

  getInstanceType(): string | undefined {
    return this.jsonData.spec?.awsLaunchTemplate?.instanceType;
  }

  getAvailabilityZones(): string[] | undefined {
    return this.jsonData.spec?.availabilityZones;
  }

  getMinSize(): number | undefined {
    return this.jsonData.spec?.minSize;
  }

  getMaxSize(): number | undefined {
    return this.jsonData.spec?.maxSize;
  }
}
