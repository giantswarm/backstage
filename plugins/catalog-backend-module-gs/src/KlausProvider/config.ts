import { readSchedulerServiceTaskScheduleDefinitionFromConfig } from '@backstage/backend-plugin-api';
import type { SchedulerServiceTaskScheduleDefinition } from '@backstage/backend-plugin-api';
import type { Config } from '@backstage/config';

export type KlausSourceKind = 'personalities' | 'toolchains' | 'plugins';

export interface KlausSourceConfig {
  kind: KlausSourceKind;
  sourceRepository: string;
  owner: string;
  repo: string;
  ociRepository: string;
}

export interface KlausInstanceConfig {
  id: string;
  system?: string;
  owner: string;
  namespace?: string;
  namePostfix: string;
  titlePostfix: string;
  tags: string[];
  schedule: SchedulerServiceTaskScheduleDefinition;
  personalities?: KlausSourceConfig;
  toolchains?: KlausSourceConfig;
  plugins?: KlausSourceConfig;
}

const DEFAULT_SCHEDULE: SchedulerServiceTaskScheduleDefinition = {
  frequency: { hours: 6 },
  timeout: { minutes: 5 },
  initialDelay: { minutes: 1 },
};

export function readKlausInstanceConfigs(
  rootConfig: Config,
): KlausInstanceConfig[] {
  const klausConfig = rootConfig.getOptionalConfig('catalog.providers.klaus');
  if (!klausConfig) {
    return [];
  }

  const instanceIds = klausConfig.keys();
  return instanceIds.map(id => readInstance(id, klausConfig.getConfig(id)));
}

function readInstance(id: string, c: Config): KlausInstanceConfig {
  const scheduleConfig = c.getOptionalConfig('schedule');
  const schedule = scheduleConfig
    ? readSchedulerServiceTaskScheduleDefinitionFromConfig(scheduleConfig)
    : DEFAULT_SCHEDULE;

  return {
    id,
    system: c.getOptionalString('system'),
    owner: c.getString('owner'),
    namespace: c.getOptionalString('namespace'),
    namePostfix: c.getOptionalString('namePostfix') ?? '',
    titlePostfix: c.getOptionalString('titlePostfix') ?? '',
    tags: c.getOptionalStringArray('tags') ?? [],
    schedule,
    personalities: readSource(
      'personalities',
      c.getOptionalConfig('personalities'),
    ),
    toolchains: readSource('toolchains', c.getOptionalConfig('toolchains')),
    plugins: readSource('plugins', c.getOptionalConfig('plugins')),
  };
}

function readSource(
  kind: KlausSourceKind,
  c: Config | undefined,
): KlausSourceConfig | undefined {
  if (!c) {
    return undefined;
  }
  const sourceRepository = c.getString('sourceRepository');
  const { owner, repo } = parseGithubRepoUrl(sourceRepository);
  const ociRepository = c.getString('ociRepository').replace(/\/+$/, '');
  return { kind, sourceRepository, owner, repo, ociRepository };
}

export function parseGithubRepoUrl(url: string): {
  owner: string;
  repo: string;
} {
  const trimmed = url
    .trim()
    .replace(/\/+$/, '')
    .replace(/\.git$/, '');
  const match = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)$/);
  if (!match) {
    throw new Error(
      `Invalid GitHub repository URL: "${url}" (expected https://github.com/<owner>/<repo>)`,
    );
  }
  return { owner: match[1], repo: match[2] };
}
