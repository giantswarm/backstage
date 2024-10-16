import * as authorization from '../../model/authorization';

export function getLocalSubjectAccessReviewNames() {
  return authorization.LocalSubjectAccessReviewNames;
}

export function getLocalSubjectAccessReviewGVK(apiVersion?: string) {
  const gvk = authorization.getLocalSubjectAccessReviewGVK(apiVersion);
  const kind = authorization.LocalSubjectAccessReviewKind;

  if (!gvk) {
    throw new Error(
      `${apiVersion} API version is not supported for ${kind} resource.`,
    );
  }

  return gvk;
}

export function getSelfSubjectAccessReviewNames() {
  return authorization.SelfSubjectAccessReviewNames;
}

export function getSelfSubjectAccessReviewGVK(apiVersion?: string) {
  const gvk = authorization.getSelfSubjectAccessReviewGVK(apiVersion);
  const kind = authorization.SelfSubjectAccessReviewKind;

  if (!gvk) {
    throw new Error(
      `${apiVersion} API version is not supported for ${kind} resource.`,
    );
  }

  return gvk;
}

export function createSelfSubjectAccessReview(
  resourceAttributes: { verb: string; group: string; resource: string },
  apiVersion?: string,
) {
  const accessReview = authorization.createSelfSubjectAccessReview(
    resourceAttributes,
    apiVersion,
  );
  const kind = authorization.SelfSubjectAccessReviewKind;

  if (!accessReview) {
    throw new Error(
      `${apiVersion} API version is not supported for ${kind} resource.`,
    );
  }

  return accessReview;
}

export function getSelfSubjectRulesReviewNames() {
  return authorization.SelfSubjectRulesReviewNames;
}

export function getSelfSubjectRulesReviewGVK(apiVersion?: string) {
  const gvk = authorization.getSelfSubjectRulesReviewGVK(apiVersion);
  const kind = authorization.SelfSubjectRulesReviewKind;

  if (!gvk) {
    throw new Error(
      `${apiVersion} API version is not supported for ${kind} resource.`,
    );
  }

  return gvk;
}

export function createSelfSubjectRulesReview(apiVersion?: string) {
  const rulesReview = authorization.createSelfSubjectRulesReview(apiVersion);
  const kind = authorization.SelfSubjectRulesReviewKind;

  if (!rulesReview) {
    throw new Error(
      `${apiVersion} API version is not supported for ${kind} resource.`,
    );
  }

  return rulesReview;
}
