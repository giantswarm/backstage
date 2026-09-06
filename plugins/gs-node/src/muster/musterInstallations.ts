import { LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import {
  MusterInstallationConfig,
  readMusterServerFromConfig,
} from './MusterMcpClient';

/**
 * Where a muster installation entry came from: `derived` from a
 * `gs.installations` entry's `baseDomain`, or `configured` in
 * `muster.installations` (which may override a derived entry of the same
 * name, or add one the fleet config does not know).
 */
export type MusterInstallationSource = NonNullable<
  MusterInstallationConfig['source']
>;

/**
 * The muster aggregator endpoint for an installation, from its base domain:
 * `https://muster.<baseDomain>/mcp` (the same derivation the kagent proxy uses
 * for `https://kagent.<baseDomain>/api`). Undefined without a base domain.
 */
export function deriveMusterUrl(
  baseDomain: string | undefined,
): string | undefined {
  if (!baseDomain) {
    return undefined;
  }
  return `https://muster.${baseDomain}/mcp`;
}

/**
 * Whether requests to the installation must carry the person's token. A
 * configured entry gates when it declares an `authProvider`; a derived entry
 * always gates -- every muster does, and the frontend mints the right token
 * for the installation (the main-login token for the home installation, the
 * installation's brokered token otherwise) without a provider name.
 */
export function musterInstallationRequiresAuth(
  installation: Pick<MusterInstallationConfig, 'authProvider' | 'source'>,
): boolean {
  return (
    Boolean(installation.authProvider) || installation.source === 'derived'
  );
}

export type MusterInstallationCounts = {
  /** Entries whose endpoint comes from a `gs.installations` base domain. */
  derived: number;
  /** Entries listed in `muster.installations` (overrides and additions). */
  configured: number;
  /** Entries in the resulting map. */
  total: number;
};

export type ResolvedMusterInstallations = {
  installations: Map<string, MusterInstallationConfig>;
  counts: MusterInstallationCounts;
};

function readHeaders(
  headersConfig: Config | undefined,
): Record<string, string> | undefined {
  if (!headersConfig) {
    return undefined;
  }
  const headers: Record<string, string> = {};
  for (const key of headersConfig.keys()) {
    headers[key] = headersConfig.getString(key);
  }
  return headers;
}

/**
 * Resolve the muster installations the proxy can target, keyed by installation
 * name: the union of the endpoints derived from the fleet configuration and
 * the entries configured for the plugin.
 *
 * 1. Every `gs.installations` entry with a `baseDomain` yields a derived entry
 *    at `https://muster.<baseDomain>/mcp`. Whether the installation actually
 *    runs muster is not this reader's question: the frontend lists only the
 *    installations whose inventory has the `muster.giantswarm.io` API group,
 *    and the reachability probe reports the endpoints this portal cannot reach.
 * 2. Every `muster.installations` entry overrides the derived entry of the same
 *    name field by field (`url`, `headers`, `prometheusServer`, `authProvider`)
 *    or, for a name the fleet configuration does not know, adds one -- then
 *    `url` is required.
 * 3. When neither source yields anything, the legacy single `aiChat.mcp` entry
 *    selected by `muster.serverName` (default `muster`) is used, as before.
 *
 * `source` on each entry says which of `derived` / `configured` it is; the
 * counts feed the one start-up log line.
 */
export function resolveMusterInstallations(
  config: Config,
  logger: LoggerService,
): ResolvedMusterInstallations {
  const installations = new Map<string, MusterInstallationConfig>();
  let derived = 0;
  let configured = 0;

  const gsInstallations = config.getOptionalConfig('gs.installations');
  for (const name of gsInstallations?.keys() ?? []) {
    const url = deriveMusterUrl(
      gsInstallations?.getOptionalString(`${name}.baseDomain`),
    );
    if (!url) {
      continue;
    }
    installations.set(name, { name, url, source: 'derived' });
    derived += 1;
  }

  const explicit = config.getOptionalConfigArray('muster.installations') ?? [];
  const seen = new Set<string>();
  for (const entry of explicit) {
    const name = entry.getString('name');
    if (seen.has(name)) {
      logger.warn(
        `Duplicate muster installation '${name}' in muster.installations; keeping the first.`,
      );
      continue;
    }
    seen.add(name);

    const base = installations.get(name);
    const url = entry.getOptionalString('url') ?? base?.url;
    if (!url) {
      logger.warn(
        `Skipping muster installation '${name}' from muster.installations: it has no url and no gs.installations entry with a baseDomain to derive one from.`,
      );
      continue;
    }

    installations.set(name, {
      name,
      url,
      authProvider:
        entry.getOptionalString('authProvider') ?? base?.authProvider,
      headers: readHeaders(entry.getOptionalConfig('headers')) ?? base?.headers,
      prometheusServer:
        entry.getOptionalString('prometheusServer') ?? base?.prometheusServer,
      source: 'configured',
    });
    if (base) {
      derived -= 1;
    }
    configured += 1;
  }

  if (installations.size === 0) {
    const legacy = readMusterServerFromConfig(config, logger);
    if (legacy) {
      const name = config.getOptionalString('muster.serverName') ?? 'muster';
      installations.set(name, { name, ...legacy, source: 'configured' });
      configured = 1;
    }
  }

  return {
    installations,
    counts: { derived, configured, total: installations.size },
  };
}
