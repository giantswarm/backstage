import { Alert } from '@backstage/ui';

import {
  sharedIdentityReason,
  sharedIdentityTitle,
} from '../../lib/sharedIdentity';

export type SharedIdentityNoteProps = {
  /** The installations whose manager is `sharedIdentity`; none renders nothing. */
  installations: readonly string[];
  /** What cannot be done there, as the title's clause: "Agents cannot be created". */
  blocked: string;
  /** What goes through the manager, as the reason's subject: "Agents are created through agent-manager". */
  via: string;
};

/**
 * Why a manager's actions are not offered on some installations: their
 * muster has no per-user sign-in in this portal, so muster-backend refuses
 * the manager's tools rather than run them under muster's shared identity.
 * Shown in place of what the person would otherwise have met as a 403.
 */
export function SharedIdentityNote({
  installations,
  blocked,
  via,
}: SharedIdentityNoteProps) {
  if (installations.length === 0) {
    return null;
  }
  return (
    <Alert
      status="info"
      title={sharedIdentityTitle(blocked, installations)}
      description={sharedIdentityReason(via, installations)}
    />
  );
}
