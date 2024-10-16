import * as v1 from './v1';

export const LocalSubjectAccessReviewKind = 'LocalSubjectAccessReview';
export const LocalSubjectAccessReviewApiGroup = 'authorization.k8s.io';
export const LocalSubjectAccessReviewNames = {
  plural: 'localsubjectaccessreviews',
  singular: 'localsubjectaccessreview',
};

export function getLocalSubjectAccessReviewGVK(apiVersion?: string) {
  if (!apiVersion) {
    return v1.LocalSubjectAccessReviewGVK;
  }

  switch (apiVersion) {
    case v1.LocalSubjectAccessReviewApiVersion:
      return v1.LocalSubjectAccessReviewGVK;
    default:
      return undefined;
  }
}

export const SelfSubjectAccessReviewKind = 'SelfSubjectAccessReview';
export const SelfSubjectAccessReviewApiGroup = 'authorization.k8s.io';
export const SelfSubjectAccessReviewNames = {
  plural: 'selfsubjectaccessreviews',
  singular: 'selfsubjectaccessreview',
};

export function getSelfSubjectAccessReviewGVK(apiVersion?: string) {
  if (!apiVersion) {
    return v1.SelfSubjectAccessReviewGVK;
  }

  switch (apiVersion) {
    case v1.SelfSubjectAccessReviewApiVersion:
      return v1.SelfSubjectAccessReviewGVK;
    default:
      return undefined;
  }
}

export function createSelfSubjectAccessReview(
  resourceAttributes: { verb: string; group: string; resource: string },
  apiVersion?: string,
) {
  if (!apiVersion) {
    return {
      apiVersion: v1.SelfSubjectAccessReviewApiVersion,
      kind: SelfSubjectAccessReviewKind,
      spec: {
        resourceAttributes,
      },
    };
  }

  switch (apiVersion) {
    case v1.SelfSubjectAccessReviewApiVersion:
      return {
        apiVersion: v1.SelfSubjectAccessReviewApiVersion,
        kind: SelfSubjectAccessReviewKind,
        spec: {
          resourceAttributes,
        },
      };
    default:
      return undefined;
  }
}

export const SelfSubjectRulesReviewKind = 'SelfSubjectRulesReview';
export const SelfSubjectRulesReviewApiGroup = 'authorization.k8s.io';
export const SelfSubjectRulesReviewNames = {
  plural: 'selfsubjectrulesreviews',
  singular: 'selfsubjectrulesreview',
};

export function getSelfSubjectRulesReviewGVK(apiVersion?: string) {
  if (!apiVersion) {
    return v1.SelfSubjectRulesReviewGVK;
  }

  switch (apiVersion) {
    case v1.SelfSubjectRulesReviewApiVersion:
      return v1.SelfSubjectRulesReviewGVK;
    default:
      return undefined;
  }
}

export function createSelfSubjectRulesReview(apiVersion?: string) {
  if (!apiVersion) {
    return {
      apiVersion: v1.SelfSubjectRulesReviewApiVersion,
      kind: SelfSubjectRulesReviewKind,
      spec: {
        namespace: 'default',
      },
    };
  }

  switch (apiVersion) {
    case v1.SelfSubjectRulesReviewApiVersion:
      return {
        apiVersion: v1.SelfSubjectRulesReviewApiVersion,
        kind: SelfSubjectRulesReviewKind,
        spec: {
          namespace: 'default',
        },
      };
    default:
      return undefined;
  }
}
