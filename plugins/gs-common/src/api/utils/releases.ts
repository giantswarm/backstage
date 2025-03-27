import { compareDates, getRelativeDateFromNow } from './helpers';
import * as giantswarmRelease from '../../model/giantswarm-release';
import { Release } from '../types';

export { ReleaseKind, ReleaseNames } from '../../model/giantswarm-release';

export function getReleaseNames() {
  return giantswarmRelease.ReleaseNames;
}

export function getReleaseGVK(apiVersion?: string) {
  const gvk = giantswarmRelease.getReleaseGVK(apiVersion);
  const kind = giantswarmRelease.ReleaseKind;

  if (!gvk) {
    throw new Error(
      `${apiVersion} API version is not supported for ${kind} resource.`,
    );
  }

  return gvk;
}

export const getReleaseVersion = (release: Release) => {
  return normalizeReleaseVersion(release.metadata.name);
};

export function getKubernetesReleaseEOLStatus(eolDate: string): {
  message: string;
  isEol: boolean;
} {
  const result = {
    message: '',
    isEol: false,
  };

  if (!eolDate) return result;

  const now = new Date().toISOString();
  const relativeDate = getRelativeDateFromNow(eolDate);
  switch (compareDates(now, eolDate)) {
    case -1:
      result.message = `This Kubernetes version will reach its end of life ${relativeDate}.`;
      break;
    case 0:
      result.message = 'This Kubernetes version reached its end of life today.';
      result.isEol = true;
      break;
    case 1:
      result.message = `This Kubernetes version reached its end of life ${relativeDate}.`;
      result.isEol = true;
      break;
    default:
      return result;
  }

  return result;
}

const preReleaseRegexp = /([0-9]*)\.([0-9]*)\.([0-9]*)([-+].*)/;

/**
 * Check if a version number is a pre-release Semver version.
 * @param version
 */
export function isPreRelease(version: string): boolean {
  return preReleaseRegexp.test(version);
}

export function normalizeReleaseVersion(version: string): string {
  const normalizedVersion = version.replace(/^(aws-|azure-|vsphere-)/, '');
  if (normalizedVersion.toLowerCase().startsWith('v')) {
    return normalizedVersion.substring(1);
  }

  return normalizedVersion;
}
