import { KubernetesRequestAuth } from '@backstage/plugin-kubernetes-common';
import { LoggerService } from '@backstage/backend-plugin-api';
import {
  AuthMetadata,
  AuthenticationStrategy,
  ClusterDetails,
  KubernetesCredential,
  PinnipedClientCerts,
  PinnipedHelper,
  PinnipedParameters,
} from '@backstage/plugin-kubernetes-node';
import { JsonObject } from '@backstage/types';

export class PinnipedStrategy implements AuthenticationStrategy {
  private pinnipedHelper: PinnipedHelper;

  constructor(private readonly logger: LoggerService) {
    this.pinnipedHelper = new PinnipedHelper(this.logger);
  }

  public async getCredential(
    clusterDetails: ClusterDetails,
    requestAuth: KubernetesRequestAuth,
  ): Promise<KubernetesCredential> {
    const pinnipedAuthTokens = requestAuth.pinniped as JsonObject;
    const token = pinnipedAuthTokens[
      clusterDetails.authMetadata['kubernetes.io/oidc-token-provider']
    ] as string;
    const params: PinnipedParameters = {
      clusterScopedIdToken: token || '',
      authenticator: {
        apiGroup: 'authentication.concierge.pinniped.dev',
        kind: 'JWTAuthenticator',
        name: 'supervisor-jwt-authenticator',
      },
      tokenCredentialRequest: {
        apiGroup: 'login.concierge.pinniped.dev/v1alpha1',
      },
    };

    const x509Data: PinnipedClientCerts =
      await this.pinnipedHelper.tokenCredentialRequest(clusterDetails, params);

    return {
      type: 'x509 client certificate',
      cert: x509Data.cert,
      key: x509Data.key,
    };
  }

  public validateCluster(): Error[] {
    return [];
  }

  public presentAuthMetadata(authMetadata: AuthMetadata): AuthMetadata {
    return {
      audience: authMetadata['kubernetes.io/x-pinniped-audience'],
    };
  }
}
