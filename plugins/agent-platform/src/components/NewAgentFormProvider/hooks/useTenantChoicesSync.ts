import { useEffect } from 'react';

import { useAgentManagerInfo } from '../../../hooks/useAgentManager';
import {
  type TenantChoicesUnread,
  useNewAgentForm,
} from '../NewAgentFormProvider';

export type TenantChoicesSync = {
  /**
   * Whether the form is still to learn where the person may create: `get_info`
   * is in flight, or it has answered and the form has not taken the answer
   * yet (it does in an effect, after the render that brought it).
   */
  isPending: boolean;
};

/**
 * Feeds agent-manager's answer on where the person may create agents on the
 * form's environment (`get_info`'s `namespaces.managed`) into the form:
 * `setTenantChoices` takes it (and picks an owner), `setTenantChoicesUnread`
 * says why there is none. The one place that does: every step of the create
 * wizard mounts it (`NewAgentStep`), and the Owner field only reads the
 * form. Inert while editing: an existing agent stays where it is.
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
  const choicesKey = info?.namespaces?.managed?.join(',');
  const heldKey = state.tenantChoices?.join(',');
  const isTaking = choicesKey !== undefined && heldKey !== choicesKey;

  useEffect(() => {
    if (choicesKey !== undefined && heldKey !== choicesKey) {
      setTenantChoices(choicesKey ? choicesKey.split(',') : []);
    }
  }, [choicesKey, heldKey, setTenantChoices]);

  // No muster plugin to ask, or `get_info` failed: `failed`. Answered
  // without a list: `unlisted`.
  let unread: TenantChoicesUnread | undefined;
  if (installation && choicesKey === undefined) {
    if (!canRead || (!isLoading && !info)) {
      unread = 'failed';
    } else if (!isLoading && info) {
      unread = 'unlisted';
    }
  }
  useEffect(() => {
    setTenantChoicesUnread(unread);
  }, [unread, setTenantChoicesUnread]);

  return { isPending: Boolean(installation) && (isLoading || isTaking) };
}
