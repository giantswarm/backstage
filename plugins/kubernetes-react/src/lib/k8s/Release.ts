import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from './KubeObject';

export const RELEASE_VERSION_PREFIXES: Record<string, string> = {
  capa: 'aws-',
  capz: 'azure-',
  capv: 'vsphere-',
};

function normalizeReleaseVersion(version: string): string {
  const versionPrefixRegExp = new RegExp(
    `^(${Object.values(RELEASE_VERSION_PREFIXES).join('|')})`,
  );
  const normalizedVersion = version.replace(versionPrefixRegExp, '');
  if (normalizedVersion.toLowerCase().startsWith('v')) {
    return normalizedVersion.substring(1);
  }

  return normalizedVersion;
}

type ReleaseInterface = crds.giantswarm.v1alpha1.Release;

export class Release extends KubeObject<ReleaseInterface> {
  static apiVersion = 'v1alpha1';
  static group = 'release.giantswarm.io';
  static kind = 'Release' as const;
  static plural = 'releases';

  getVersion() {
    return normalizeReleaseVersion(this.getName());
  }
}
