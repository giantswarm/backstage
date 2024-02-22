export interface Config {
  /** @visibility frontend */
  gs?: {
    /** @visibility frontend */
    installations:
      | Array<string>
      | {
          [installationName: string]: {}
        }
  }
}
