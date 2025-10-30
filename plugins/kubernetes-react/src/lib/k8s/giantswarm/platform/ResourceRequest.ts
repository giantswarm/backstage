import { KubeObject, KubeObjectInterface } from '../../KubeObject';

interface ResourceRequestInterface extends KubeObjectInterface {
  status?: {
    message: string;
    conditions?: {
      lastTransitionTime: string;
      message: string;
      observedGeneration?: number;
      reason: string;
      status: 'True' | 'False' | 'Unknown';
      type: string;
    }[];
  };
}

export class ResourceRequest<
  T extends ResourceRequestInterface = any,
> extends KubeObject<T> {
  getStatus() {
    return this.jsonData.status;
  }

  getStatusConditions() {
    return this.jsonData.status?.conditions;
  }
}
