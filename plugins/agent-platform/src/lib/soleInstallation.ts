import {
  ALL_INSTALLATIONS,
  type InstallationScope,
} from '@giantswarm/backstage-plugin-gs';

/** The hide list for a table whose rows can only come from one installation. */
export const HIDE_INSTALLATION: ReadonlyArray<'installation'> = [
  'installation',
];

export type SoleInstallationInput = {
  scope: InstallationScope;
  /** Some installation asked has not answered yet. */
  isLoading: boolean;
  /** The installations the list was read from. */
  installations: string[];
  /** Installations asked that could not be read. */
  unreachableInstallations: string[];
};

/**
 * Whether a list can only hold one installation's rows, so an Installation
 * column would repeat it on every row: the scope pins one, or only one of the
 * installations asked answered. Not decided while any is still resolving: the
 * first to answer would hide the column and the next would bring it back.
 */
export function isSoleInstallation({
  scope,
  isLoading,
  installations,
  unreachableInstallations,
}: SoleInstallationInput): boolean {
  if (scope !== ALL_INSTALLATIONS) {
    return true;
  }
  if (isLoading) {
    return false;
  }
  const answered = installations.filter(
    installation => !unreachableInstallations.includes(installation),
  );
  return answered.length === 1;
}
