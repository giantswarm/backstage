import {
  organizationsUndecided,
  type OrganizationDirectoryValue,
} from '../components/OrganizationDirectoryProvider';
import { MODEL_CONFIG_NAMESPACE } from '../lib/modelConfigs';

/**
 * Why a model write in `namespace` is refused because the portal cannot tell
 * whether the namespace is an organization's or the installation's, or
 * `undefined` when it can. The scope decides which credential form finishes
 * the write, so it is never guessed.
 */
export function modelScopeRefusal(
  organizations: OrganizationDirectoryValue,
  installation: string,
  namespace: string,
): string | undefined {
  if (
    namespace === MODEL_CONFIG_NAMESPACE ||
    organizations.directory.get(namespace)
  ) {
    return undefined;
  }
  const undecided = organizationsUndecided(organizations, installation);
  return undecided
    ? `Could not tell whether ${namespace} is an organization's namespace or the installation's, so no model was written. Try again once agent-manager answers: ${undecided}`
    : undefined;
}
