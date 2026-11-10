import {
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import { InputError, NotAllowedError } from '@backstage/errors';
import {
  asConnected,
  MusterMcpClient,
  MusterServerClient,
  readMusterInstallationsFromConfig,
} from '@giantswarm/backstage-plugin-gs-node';
import { parseRepoUrl } from './discoverAgentSkills';

/** One source of `x_skill-manager_list_skill_sources`, as the person sees it. */
export interface SkillSource {
  url: string;
  ref?: string;
  path?: string;
  readOnly?: boolean;
  commit?: string;
  /** Set when the source cannot be read, or the person may not read it. */
  error?: string;
}

/** Where a skill pull request goes. */
export interface SkillTarget {
  repoUrl: string;
  kind: 'create' | 'update';
  skillName: string;
  /** For an update, the skill directory. */
  path?: string;
}

const SKILL_MANAGER_SERVER = 'skill-manager';

/**
 * Reads an installation's skill sources from its skill-manager, through the
 * installation's muster as the person whose muster token is given. A person
 * not connected to skill-manager gets `MusterServerNotConnectedError`.
 */
export function skillSourcesReader(
  config: RootConfigService,
  logger: LoggerService,
) {
  const gateways = new Map<string, MusterServerClient>();
  return async (
    installation: string,
    authToken: string,
  ): Promise<SkillSource[]> => {
    let gateway = gateways.get(installation);
    if (!gateway) {
      const muster = readMusterInstallationsFromConfig(config, logger).get(
        installation,
      );
      if (!muster) {
        throw new InputError(
          `${installation} is not one of the portal's muster installations`,
        );
      }
      gateway = new MusterServerClient(
        new MusterMcpClient(muster, logger),
        SKILL_MANAGER_SERVER,
        SKILL_MANAGER_SERVER,
      );
      gateways.set(installation, gateway);
    }
    const connected = gateway;
    const answer = await asConnected(
      connected,
      connected.server,
      authToken,
      () => connected.call('list_skill_sources', {}, authToken),
    );
    if (
      !answer ||
      typeof answer !== 'object' ||
      !Array.isArray((answer as { sources?: unknown }).sources)
    ) {
      throw new Error(
        `skill-manager on ${installation} answered list_skill_sources without sources`,
      );
    }
    return (answer as { sources: SkillSource[] }).sources;
  };
}

export function slugOf(url: string): string {
  const { owner, repo } = parseRepoUrl(url.trim().replace(/\/+$/, ''));
  return `${owner}/${repo}`.toLowerCase();
}

function within(dir: string, base: string): boolean {
  return base === '' || dir === base || dir.startsWith(`${base}/`);
}

/**
 * Refuses a pull request outside the installation's writable skill sources:
 * the catalog lists these and nothing else, so a skill anywhere else would
 * be one no one can see. A new skill goes to `<skillName>/` at the
 * repository root, so a source with a path takes updates below it only.
 */
export function requireWritableSource(
  sources: SkillSource[],
  target: SkillTarget,
): SkillSource {
  const slug = slugOf(target.repoUrl);
  const matching = sources.filter(source => {
    try {
      return slugOf(source.url) === slug;
    } catch {
      return false;
    }
  });
  if (matching.length === 0) {
    throw new InputError(
      `${target.repoUrl} is not one of the installation's skill sources`,
    );
  }
  const dir = target.kind === 'update' ? (target.path ?? '') : target.skillName;
  const source = matching.find(s => within(dir, s.path ?? ''));
  if (!source) {
    const paths = matching.map(s => s.path ?? '').join(', ');
    throw new InputError(
      `${target.repoUrl} holds skills only below ${paths}; ${dir} is outside it`,
    );
  }
  if (source.error) {
    throw new NotAllowedError(source.error);
  }
  if (source.readOnly) {
    throw new NotAllowedError(
      `${target.repoUrl} is a read-only skill source: skills there change with the platform release, not through the portal`,
    );
  }
  return source;
}
