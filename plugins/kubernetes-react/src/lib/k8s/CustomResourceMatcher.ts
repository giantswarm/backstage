export interface CustomResourceMatcher {
  group: string;
  apiVersion: string;
  plural: string;
  isCore: boolean;
}

/**
 * Extended resource matcher that supports multiple API versions.
 * Used by resource classes that need to work with different API versions
 * across different clusters.
 */
export interface MultiVersionResourceMatcher extends CustomResourceMatcher {
  /** All versions supported by the resource class */
  supportedVersions: readonly string[];
}
