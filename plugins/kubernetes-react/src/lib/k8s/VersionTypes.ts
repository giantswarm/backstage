export type ApiVersionString = string;

/**
 * Result of checking version compatibility between client and server.
 */
export interface VersionCompatibility {
  /** Whether there is at least one compatible version */
  isCompatible: boolean;
  /** The resolved version to use (latest compatible), undefined if incompatible */
  resolvedVersion: ApiVersionString | undefined;
  /** All versions that are compatible (intersection of client and server) */
  compatibleVersions: ApiVersionString[];
  /** Versions supported by the client (resource class) */
  clientVersions: readonly ApiVersionString[];
  /** Versions available on the server (from API discovery) */
  serverVersions: ApiVersionString[];
  /** Whether the server has newer versions than the client supports */
  isClientOutdated: boolean;
}

/**
 * State representing an incompatibility between client and server versions.
 */
export interface IncompatibilityState {
  /** The resource class name */
  resourceClass: string;
  /** The cluster name */
  cluster: string;
  /** Versions supported by the client (resource class) */
  clientVersions: readonly ApiVersionString[];
  /** Versions available on the server (from API discovery) */
  serverVersions: ApiVersionString[];
}

/**
 * State representing that the client is outdated (server supports newer versions).
 * This is a warning, not an error - the client can still communicate with the server.
 */
export interface ClientOutdatedState {
  /** The resource class name */
  resourceClass: string;
  /** The cluster name */
  cluster: string;
  /** The latest version supported by the client */
  clientLatestVersion: ApiVersionString;
  /** The latest version supported by the server */
  serverLatestVersion: ApiVersionString;
  /** Versions supported by the client (resource class) */
  clientVersions: readonly ApiVersionString[];
  /** Versions available on the server (from API discovery) */
  serverVersions: ApiVersionString[];
}
