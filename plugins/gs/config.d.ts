export interface Config {
  /** @visibility frontend */
  gs?: {
    /** @visibility frontend */
    installations: {
      /** @visibility frontend */
      [installationName: string]: {
        /** @visibility frontend */
        apiEndpoint: string;
      }
    }
  }
}
