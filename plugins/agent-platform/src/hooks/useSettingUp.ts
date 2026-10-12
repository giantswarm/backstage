import {
  type ProvisioningParts,
  settingUpUntil,
} from '../lib/agentProvisioning';
import { useBeforeDeadline } from './useDeadlinePassed';
import type { ServerNow } from './useServerClock';

/**
 * Whether the agent reads as being set up now ({@link settingUpUntil}, on the
 * server's clock). The end of the window renders on its own, so a failure
 * that persists is shown without waiting for either object to change.
 */
export function useSettingUp(
  parts: ProvisioningParts,
  now: ServerNow,
): boolean {
  return useBeforeDeadline(settingUpUntil(parts), now);
}
