import { useEffect, type ReactNode } from 'react';
import { LoadingIndicator } from '@giantswarm/backstage-plugin-ui-react';

import { useAgentManagerInfo } from '../../hooks/useAgentManager';
import { useNewAgentForm } from '../NewAgentFormProvider';

/**
 * A step of the create wizard, once the form is what it was: the kept draft
 * has been looked for, and a restored tenant has been checked against the
 * tenants the person may create in.
 *
 * Without the wait, a reload on a later step would meet an empty form and be
 * sent back to Details. The tenant choices are agent-manager's answer, not
 * part of the draft, and only the Details step's tenant picker reads them; a
 * reload on Skills, Tools or Review reads them here, so the form's tenant
 * check holds there too (a tenant no longer allowed sends the person back to
 * Details, which says so). Where agent-manager does not answer, the step goes
 * on and the create call gets agent-manager's own answer, as on Details.
 */
export function NewAgentStep({ children }: { children: ReactNode }) {
  const { state, isDraftLoaded, setTenantChoices } = useNewAgentForm();
  const { info, isLoading } = useAgentManagerInfo(state.installation);
  const choicesKey = info?.namespaces?.managed?.join(',');

  useEffect(() => {
    if (choicesKey !== undefined) {
      setTenantChoices(choicesKey ? choicesKey.split(',') : []);
    }
  }, [choicesKey, setTenantChoices]);

  const isCheckingTenant =
    state.tenant !== undefined &&
    state.tenantChoices === undefined &&
    isLoading;
  if (!isDraftLoaded || isCheckingTenant) {
    return <LoadingIndicator label="Loading your draft…" />;
  }
  return <>{children}</>;
}
