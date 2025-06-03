export interface Config {
  /** @visibility frontend */
  gs?: {
    /** @visibility frontend */
    authProvider: string;

    /** @deepVisibility frontend */
    clusterDetails?: {
      resources?: {
        label: string;
        icon: string;
        url: string;
        clusterType?: 'management' | 'workload';
      }[];
    };

    /** @deepVisibility frontend */
    gitopsRepositories?: {
      targetUrl: string;
      gitRepositoryUrlPattern: string;
    }[];

    /** @deepVisibility frontend */
    homepage?: {
      resources?: {
        label: string;
        icon: string;
        url: string;
      }[];
    };

    /** @deepVisibility frontend */
    installations: {
      [installationName: string]: {
        pipeline: string;
        providers?: string[];
        apiEndpoint: string;
        authProvider: string;
        oidcTokenProvider?: string;
        grafanaUrl?: string;
        backendUrl?: string;
        baseDomain?: string;
        region?: string;
        apiVersionOverrides?: {
          [pluralKind: string]: string;
        };
      };
    };
    /** @visibility frontend */
    features?: {
      [featureName: string]: {
        /** @visibility frontend */
        enabled: boolean;
      };
    };
    /** @deepVisibility frontend */
    kubernetesVersions?: {
      [minorVersion: string]: {
        eolDate: string;
        minorVersion: string;
      };
    };
    /** @visibility frontend */
    adminGroups?: string[];
  };

  auth?: {
    providers?: {
      [provider: string]: {
        [authEnv: string]: {
          /** @visibility frontend */
          dexClientId?: string;
          /** @visibility frontend */
          dexClientSecret?: string;
          /** @visibility frontend */
          dexMetadataUrl?: string;
          /** @visibility frontend */
          dexTokenEndpoint?: string;
          /** @visibility frontend */
          dexUserinfoEndpoint?: string;
        };
      };
    };
  };
}
