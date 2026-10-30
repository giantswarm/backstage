import { useEffect, type ReactNode } from 'react';
import { LoadingIndicator } from '@giantswarm/backstage-plugin-ui-react';

import { useAgentManagerInfo } from '../../hooks/useAgentManager';
import { useNewAgentForm } from '../NewAgentFormProvider';

/**
 * A step of the create wizard, once the form is what it was: the kept draft
 * has been looked for, and a restored tenant has been checked against the
 * tenants the person may create in.
 *
 * Without the wait, a reload on a later step would meet an empty form, or one
 * whose organization is still being read, and be sent back to Details. The tenant choices are agent-manager's answer, not
 * part of the draft, and only the Details step's tenant picker reads them; a
 * reload on Skills, Tools or Review reads them here, so the form's tenant
 * check holds there too (a tenant no longer allowed sends the person back to
 * Details, which says so). Where agent-manager does not answer, the step goes
 * on and the create call gets agent-manager's own answer, as on Details.
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
  const { state, isDraftLoaded, setTenantChoices } = useNewAgentForm();
  const { info, isLoading } = useAgentManagerInfo(state.installation);
  const choicesKey = info?.namespaces?.managed?.join(',');

  useEffect(() => {
    if (choicesKey !== undefined) {
      setTenantChoices(choicesKey ? choicesKey.split(',') : []);
    }
  }, [choicesKey, setTenantChoices]);

  // A restored tenant is checked, and on a later step a draft without one
  // gets the first place offered (`setTenantChoices`), before the step
  // decides whether the form is complete: it is not while the tenant is
  // unknown.
  const isCheckingTenant =
    state.tenantChoices === undefined &&
    isLoading &&
    (state.tenant !== undefined || !details);
  if (!isDraftLoaded || isCheckingTenant) {
    return <LoadingIndicator label="Loading your draft…" />;
  }
  return <>{children}</>;
}
