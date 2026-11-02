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

/**
 * Whether a list's every installation in view failed to read: one pinned
 * environment that could not be read, or a fleet where none could. Nothing
 * was seen then, so the list must not say it is empty ("no model is
 * running", "no GPU nodes found"); its read warning is the answer. False
 * while nothing failed, and while any installation in view was read.
 */
export function nothingCouldBeRead({
  installations,
  unreadable,
}: {
  /** The installations in view. */
  installations: string[];
  /** Those of them, or others asked, that could not be read. */
  unreadable: string[];
}): boolean {
  return (
    unreadable.length > 0 &&
    installations.every(installation => unreadable.includes(installation))
  );
}
