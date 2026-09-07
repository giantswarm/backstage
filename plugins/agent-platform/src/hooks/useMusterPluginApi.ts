import { useApiHolder } from '@backstage/core-plugin-api';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

/**
 * The muster plugin's API, or `undefined` when that plugin is not installed in
 * this app.
 *
 * The agent creation Tools step and the agent page read muster's presets and
 * catalogue through it — the picker *is* muster's catalogue — but the Agent
 * Platform section must still work on a portal without the muster plugin: the
 * step then offers the built-in preset names only, and the page shows the
 * declared toolset without a resolution. Read through the API holder rather
 * than `useApi`, which throws when the ref is unbound.
 */
export function useMusterPluginApi(): MusterApi | undefined {
  return useApiHolder().get(musterApiRef);
}
