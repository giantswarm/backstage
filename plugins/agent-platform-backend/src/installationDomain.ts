import { Config } from '@backstage/config';

/**
 * The base domain of one of the portal's installations, read from the
 * backend-only `gs.installations.<name>.baseDomain`; `undefined` when the name
 * is not a configured installation or its entry carries no base domain.
 *
 * The name comes from a request, so membership is checked against the
 * configured names rather than used as a config key: a dotted name would
 * otherwise be read as a path into somebody else's entry.
 */
export function readInstallationBaseDomain(
  config: Config,
  installation: string,
): string | undefined {
  const installations = config.getOptionalConfig('gs.installations');
  if (!installations?.keys().includes(installation)) {
    return undefined;
  }
  return installations.getConfig(installation).getOptionalString('baseDomain');
}
