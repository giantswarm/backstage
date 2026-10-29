import { useAgentManagerInfo } from '../../hooks/useAgentManager';
import { useHarnessChoices } from '../../hooks/useHarnessChoices';
import { useNewAgentForm } from '../NewAgentFormProvider';

/**
 * The runtimes the agent wizard offers, read where the runtime field reads
 * them: the chosen model's namespace, or a tenant other than the platform's
 * (an Organization's namespace), which runs its agents on the platform
 * Harness alone. The review steps and the Details step's summary read the
 * same query, so they name the Harness the field shows.
 */
export function useRuntimeChoices() {
  const { state } = useNewAgentForm();
  const { installation, modelConfigNamespace: namespace } = state;
  // The tenant the agent is created in; editing, its own namespace.
  const tenant = state.tenant ?? namespace;
  const { info } = useAgentManagerInfo(installation);
  const platformNamespace = info?.namespaces?.default;
  const inOtherTenant = Boolean(
    tenant && platformNamespace && tenant !== platformNamespace,
  );
  const choices = useHarnessChoices(
    installation,
    inOtherTenant ? tenant : namespace,
  );
  return { ...choices, tenant, inOtherTenant };
}
