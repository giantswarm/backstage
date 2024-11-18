export interface Config {
  /** @visibility frontend */
  gs?: {
    /** @deepVisibility frontend */
    installations: {
      [installationName: string]: {
        pipeline: string;
        apiEndpoint: string;
        authProvider: string;
        oidcTokenProvider?: string;
        grafanaUrl?: string;
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
