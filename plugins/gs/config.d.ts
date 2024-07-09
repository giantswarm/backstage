export interface Config {
  /** @visibility frontend */
  gs?: {
    /** @visibility frontend */
    installations:
      | Array<string>
      | {
          [installationName: string]: {
            /** @visibility frontend */
            pipeline: string;
          };
        };
    /** @visibility frontend */
    features?: {
      [featureName: string]: {
        /** @visibility frontend */
        enabled: boolean;
      };
    };
  };
}
