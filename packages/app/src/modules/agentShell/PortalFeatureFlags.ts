import { LocalStorageFeatureFlags } from '@backstage/core-app-api';
import {
  FeatureFlagState,
  type ConfigApi,
  type FeatureFlag,
  type FeatureFlagsApi,
  type FeatureFlagsSaveOptions,
} from '@backstage/frontend-plugin-api';
import {
  AGENT_SHELL_FLAG,
  ORGANIZATIONS_FLAG,
  isAgentShellOptInOffered,
  readPortals,
} from '@giantswarm/backstage-plugin-agent-platform-common';

/** Where fixture mode notes that it turned the Organizations flag on. */
export const FIXTURE_ORGANIZATIONS_STARTED =
  'agent-platform-fixtures-organizations-started';

/**
 * The app's FeatureFlagsApi: the upstream localStorage flags, except that
 * `agent-platform-shell` reports what the deployment decided
 * (`app.portals`, see `readPortals`) with the person's own flag as the
 * opt-in while the deployment has the Agent Platform off.
 * `agentPlatform.organizations.enabled`, when set, controls the Organizations
 * flag for everyone and hides its browser toggle. In fixture mode
 * (`agentPlatform.fixtures`, outside production builds) the Organizations flag
 * starts on in a browser that never had it set by fixture mode, and the
 * person's toggle decides from then on.
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
 *
 * `isActive` stays live, because the settings page's toggle reads it to flip
 * the flag. Render-time readers latch it instead (`isAgentShellOn`), so a
 * toggle applies on the next load rather than mixing the shells in this one.
 */
export class PortalFeatureFlags implements FeatureFlagsApi {
  constructor(
    private readonly config: ConfigApi,
    private readonly flags: FeatureFlagsApi = new LocalStorageFeatureFlags(),
  ) {
    if (
      process.env.NODE_ENV !== 'production' &&
      config.getOptionalBoolean('agentPlatform.fixtures') === true
    ) {
      this.startOrganizationsOn();
    }
  }

  /**
   * Turns the Organizations flag on once per browser: the flags keep only
   * the ones that are on, so a marker of its own tells a person's later
   * "off" apart from never set.
   */
  private startOrganizationsOn(): void {
    try {
      if (window.localStorage.getItem(FIXTURE_ORGANIZATIONS_STARTED)) {
        return;
      }
      window.localStorage.setItem(FIXTURE_ORGANIZATIONS_STARTED, 'true');
    } catch {
      return;
    }
    this.flags.save({
      states: { [ORGANIZATIONS_FLAG]: FeatureFlagState.Active },
      merge: true,
    });
  }

  registerFlag(flag: FeatureFlag): void {
    this.flags.registerFlag(flag);
  }

  getRegisteredFlags(): FeatureFlag[] {
    const flags = this.flags.getRegisteredFlags();
    return flags.filter(
      flag =>
        (flag.name !== AGENT_SHELL_FLAG ||
          isAgentShellOptInOffered(this.config)) &&
        (flag.name !== ORGANIZATIONS_FLAG ||
          this.config.getOptionalBoolean(
            'agentPlatform.organizations.enabled',
          ) === undefined),
    );
  }

  isActive(name: string): boolean {
    if (name === ORGANIZATIONS_FLAG) {
      return (
        this.config.getOptionalBoolean('agentPlatform.organizations.enabled') ??
        this.flags.isActive(name)
      );
    }
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
