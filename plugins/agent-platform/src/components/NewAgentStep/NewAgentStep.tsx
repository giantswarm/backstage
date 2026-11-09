import type { ReactNode } from 'react';
import { LoadingIndicator } from '@giantswarm/backstage-plugin-ui-react';

import { useWarmNewAgentForm } from '../../hooks/useWarmNewAgentForm';
import { useNewAgentForm, useTenantChoicesSync } from '../NewAgentFormProvider';

/**
 * A step of the create wizard, once the form is what it was: the kept draft
 * has been looked for, and a restored tenant has been checked against the
 * tenants the person may create in.
 *
 * Without the wait, a reload on a later step would meet an empty form, or one
 * whose owner is still being read, and be sent back to Details. The
 * tenant choices are agent-manager's answer, not part of the draft; a reload
 * on Skills, Tools or Review reads them here, so `setTenantChoices` settles
 * the tenant there too: a tenant no longer allowed is replaced, and a draft
 * without one gets the default place. Where agent-manager does not answer, a
 * restored tenant stands and the create call gets agent-manager's own answer;
 * a draft without one is incomplete and goes back to Details, which says why.
 *
 * Every step also starts the form's reads for its likely environment
 * (`useWarmNewAgentForm`), so a direct link or a reload does not wait for
 * the environment to be picked before `get_info` is asked.
 */
export function NewAgentStep({
  details = false,
  children,
}: {
  /**
   * The Details step: it reads the tenant choices itself and shows its own
   * field while they load, so it waits only for a restored tenant's check.
   */
  details?: boolean;
  children: ReactNode;
}) {
  const { state, edit, isDraftLoaded } = useNewAgentForm();
  useWarmNewAgentForm({ enabled: !edit });
  const { isPending } = useTenantChoicesSync();

  // A restored tenant is checked, and on a later step a draft without one
  // gets the default place (`setTenantChoices`), before the step decides
  // whether the form is complete: it is not while the tenant is unknown.
  // That includes the render that brings the answer, before the form has
  // taken it.
  const isCheckingTenant =
    isPending && (state.tenant !== undefined || !details);
  if (!isDraftLoaded || isCheckingTenant) {
    return <LoadingIndicator label="Loading your draft…" />;
  }
  return <>{children}</>;
}
