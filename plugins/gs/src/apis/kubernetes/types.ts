export interface ClusterConfiguration {
  name: string;
  apiEndpoint: string;
  authProvider: string;
  oidcTokenProvider?: string;
}

export interface CustomResourceMatcher {
  group: string;
  apiVersion: string;
  plural: string;
}
