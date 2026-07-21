import { useInstallations } from '../../apis/installations';

export type InstallationInfo = {
  name: string;
  pipeline: string;
  providers: string[];
  baseDomain?: string;
  region?: string;
};

/**
 * Installation metadata for UI consumers. Sourced from the installations config
 * loaded from the authenticated backend endpoint after sign-in (no longer from
 * the frontend config), so `isLoading` is true until that fetch resolves.
 */
export function useInstallationsInfo() {
  const { installations, isLoading } = useInstallations();

  const installationsInfo: InstallationInfo[] = installations.map(
    installation => ({
      name: installation.name,
      pipeline: installation.pipeline ?? '',
      providers: installation.providers ?? [],
      baseDomain: installation.baseDomain,
      region: installation.region,
    }),
  );

  return {
    installationsInfo,
    isLoading,
  };
}
