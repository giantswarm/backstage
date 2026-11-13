import { useEffect } from 'react';

import { useAgentManagerInfo } from '../../../hooks/useAgentManager';
import {
  mayCreateAgentsIn,
  ORGANIZATIONS_CAPABILITY,
} from '../../../lib/organizations';
import {
  type TenantChoicesUnread,
  useNewAgentForm,
} from '../NewAgentFormProvider';
import { useOrganizationDirectory } from '../../OrganizationDirectoryProvider';

export type TenantChoicesSync = {
  /**
   * Whether the form is still to learn where the person may create: the
   * answer is in flight, or it has answered and the form has not taken the
   * answer yet (it does in an effect, after the render that brought it).
   */
  isPending: boolean;
};

/**
 * Feeds agent-manager's answer on where the person may create agents on the
 * form's environment into the form: `setTenantChoices` takes it (and picks
 * one), `setTenantChoicesUnread` says why there is none. Where agent-manager
 * serves the organization tools (`get_info`'s `organizations` capability),
 * the answer is the organizations the person belongs to
 * (`list_organizations`' members, asked with their own token), so no Platform is
 * offered; elsewhere it is `get_info`'s `namespaces.managed`. The one place
 * that does: every step of the create wizard mounts it (`NewAgentStep`), and
 * the Owner field only reads the form. Inert while editing: an existing agent
 * stays where it is.
 *
 * Keyed on what the form holds, not only on the answer: changing the
 * environment clears the choices, and an environment switched back to whose
 * answer is cached arrives in the same render as the switch, so an answer
 * that never changed is still taken again.
 */
export function useTenantChoicesSync(): TenantChoicesSync {
  const { state, edit, setTenantChoices, setTenantChoicesUnread } =
    useNewAgentForm();
  const installation = edit ? undefined : state.installation;
  const { info, isLoading, canRead } = useAgentManagerInfo(installation);
  const byOrganization =
    info?.capabilities?.[ORGANIZATIONS_CAPABILITY] === true;
  // The organizations are read once for every page, by the directory.
  const organizations = useOrganizationDirectory();
  const mine =
    byOrganization && installation
      ? organizations.organizationsOf(installation)
      : undefined;
  const organizationsFailed =
    byOrganization &&
    Boolean(installation) &&
    Boolean(organizations.failureOf(installation ?? ''));
  // The organizations the person belongs to: those they may create agents in
  // are the choices, the others are shown disabled. A `createAgents` that
  // agent-manager does not send is not known, and keeps the organization a
  // choice (`mayCreateAgentsIn`).
  const memberships = mine?.organizations.flatMap(organization =>
    organization.permissions.member && organization.namespace
      ? [{ namespace: organization.namespace, organization }]
      : [],
  );
  const choices = byOrganization
    ? memberships?.flatMap(({ namespace, organization }) =>
        mayCreateAgentsIn(organization) ? [namespace] : [],
      )
    : info?.namespaces?.managed;
  const blocked = byOrganization
    ? memberships?.flatMap(({ namespace, organization }) =>
        mayCreateAgentsIn(organization) ? [] : [namespace],
      )
    : undefined;
  // Both lists in one key, so a change of either is taken.
  const choicesKey =
    choices === undefined
      ? undefined
      : `${choices.join(',')}|${(blocked ?? []).join(',')}`;
  const heldKey =
    state.tenantChoices === undefined
      ? undefined
      : `${state.tenantChoices.join(',')}|${(
          state.tenantChoicesBlocked ?? []
        ).join(',')}`;
  const isTaking = choicesKey !== undefined && heldKey !== choicesKey;

  useEffect(() => {
    if (choicesKey !== undefined && heldKey !== choicesKey) {
      const [taken, notTaken] = choicesKey.split('|');
      setTenantChoices(
        taken ? taken.split(',') : [],
        notTaken ? notTaken.split(',') : [],
      );
    }
  }, [choicesKey, heldKey, setTenantChoices]);

  // No muster plugin to ask, or `get_info` (or `list_organizations`)
  // failed: `failed`. Answered without a list: `unlisted`.
  let unread: TenantChoicesUnread | undefined;
  if (installation && choicesKey === undefined) {
    if (!canRead || (!isLoading && !info) || organizationsFailed) {
      unread = 'failed';
    } else if (!isLoading && info && !byOrganization) {
      unread = 'unlisted';
    }
  }
  useEffect(() => {
    setTenantChoicesUnread(unread);
  }, [unread, setTenantChoicesUnread]);

  return {
    isPending:
      Boolean(installation) &&
      (isLoading ||
        (byOrganization && !mine && !organizationsFailed) ||
        isTaking),
  };
}
