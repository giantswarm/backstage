export interface CustomResourceMatcher {
  group: string;
  apiVersion: string;
  plural: string;
  isCore: boolean;
}
