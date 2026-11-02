import { joinNames } from '@giantswarm/backstage-plugin-ui-react';

/**
 * Why a manager reached as the person is withheld on installations whose
 * muster has no per-user sign-in in this portal (presence `sharedIdentity`,
 * `useMusterServerAvailability`): muster-backend refuses the manager's tools
 * there rather than run them under muster's identity, shared by every portal
 * user. `via` says what goes through the manager, as the sentence's subject:
 * "Agents are created through agent-manager".
 */
export function sharedIdentityReason(
  via: string,
  installations: readonly string[],
): string {
  return `${via} as you, and muster on ${joinNames(
    installations,
  )} has no per-user sign-in in this portal, so it would act under muster's shared identity instead. A platform admin can give the installation's muster entry an authProvider.`;
}

/**
 * The note's title: what cannot be done, on which installations, from this
 * portal. `blocked` is the clause, "Agents cannot be created".
 */
export function sharedIdentityTitle(
  blocked: string,
  installations: readonly string[],
): string {
  return installations.length === 1
    ? `${blocked} on ${installations[0]} from this portal`
    : `${blocked} on some environments from this portal`;
}
