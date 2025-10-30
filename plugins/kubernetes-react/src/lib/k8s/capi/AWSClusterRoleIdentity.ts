import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from '../KubeObject';
import { extractIDFromARN } from '../../../utils/extractIDFromARN';

type AWSClusterRoleIdentityInterface = crds.capa.v1beta2.AWSClusterRoleIdentity;

export class AWSClusterRoleIdentity extends KubeObject<AWSClusterRoleIdentityInterface> {
  static apiVersion = 'v1beta2';
  static group = 'infrastructure.cluster.x-k8s.io';
  static kind = 'AWSClusterRoleIdentity' as const;
  static plural = 'awsclusterroleidentities';

  getRoleARN() {
    return this.jsonData.spec?.roleARN;
  }

  getAWSAccountId() {
    const roleARN = this.getRoleARN();

    return roleARN ? extractIDFromARN(roleARN) : undefined;
  }

  getAWSAccountUrl() {
    const awsAccountId = this.getAWSAccountId();

    return awsAccountId
      ? `https://${awsAccountId}.signin.aws.amazon.com/console`
      : undefined;
  }
}
