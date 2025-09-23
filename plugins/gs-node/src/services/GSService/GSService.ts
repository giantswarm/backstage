import {
  BackstageCredentials,
  BackstageUserPrincipal,
  createServiceFactory,
} from '@backstage/backend-plugin-api';
import { GSService, gsServiceRef } from './types';

export class DefaultGSService implements GSService {
  private clusters: {
    [userRef: string]: {
      name: string;
      url: string;
      authProvider: string;
      oidcTokenProvider: string;
    }[];
  } = {};

  async getClusters(options: {
    credentials: BackstageCredentials<BackstageUserPrincipal>;
  }) {
    return this.clusters[options.credentials.principal.userEntityRef] ?? [];
  }

  async updateClusters(
    clustersInfo: {
      name: string;
      url: string;
      authProvider: string;
      oidcTokenProvider: string;
    }[],
    options: {
      credentials: BackstageCredentials<BackstageUserPrincipal>;
    },
  ): Promise<void> {
    this.clusters[options.credentials.principal.userEntityRef] = clustersInfo;
  }
}

export const gsServiceFactory = createServiceFactory({
  service: gsServiceRef,
  deps: {},
  factory({}) {
    return new DefaultGSService();
  },
});
