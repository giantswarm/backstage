export interface Config {
  /** @visibility frontend */
  gs?: {
    /** @visibility frontend */
    installations: {
      [installationName: string]: {
        /** @visibility frontend */
        pipeline: string;
        /** @visibility frontend */
        grafanaUrl?: string;
        /** @deepVisibility frontend */
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
}
