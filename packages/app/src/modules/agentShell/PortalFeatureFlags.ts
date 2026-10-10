import { LocalStorageFeatureFlags } from '@backstage/core-app-api';
import type {
  ConfigApi,
  FeatureFlag,
  FeatureFlagsApi,
  FeatureFlagsSaveOptions,
} from '@backstage/frontend-plugin-api';
import {
  AGENT_SHELL_FLAG,
  isAgentShellOptInOffered,
  readPortals,
} from '@giantswarm/backstage-plugin-agent-platform-common';

/**
 * The app's FeatureFlagsApi: the upstream localStorage flags, except that
 * `agent-platform-shell` reports what the deployment decided
 * (`app.portals`, see `readPortals`) with the person's own flag as the
 * opt-in while the deployment has the Agent Platform off.
 *
 * Extension `if` predicates can only read feature flags (and permissions),
 * and the shell's extensions (its `/` home, Customize, the classic home's
 * hand-over) as well as the plugins rendering inside it all key on this one
 * flag — so the deployment's choice reaches every one of them through here,
 * at app start, exactly as a flag would.
 *
 * The flag is listed on the settings page only while it means something
 * (the deployment has the Agent Platform off); otherwise toggling it would
 * change nothing.
 */
export class PortalFeatureFlags implements FeatureFlagsApi {
  constructor(
    private readonly config: ConfigApi,
    private readonly flags: FeatureFlagsApi = new LocalStorageFeatureFlags(),
  ) {}

  registerFlag(flag: FeatureFlag): void {
    this.flags.registerFlag(flag);
  }

  getRegisteredFlags(): FeatureFlag[] {
    const flags = this.flags.getRegisteredFlags();
    if (isAgentShellOptInOffered(this.config)) {
      return flags;
    }
    return flags.filter(flag => flag.name !== AGENT_SHELL_FLAG);
  }

  isActive(name: string): boolean {
    if (name !== AGENT_SHELL_FLAG) {
      return this.flags.isActive(name);
    }
    return readPortals(this.config, {
      agentShellOptIn: this.flags.isActive(name),
    }).agentPlatform;
  }

  save(options: FeatureFlagsSaveOptions): void {
    this.flags.save(options);
  }
}
