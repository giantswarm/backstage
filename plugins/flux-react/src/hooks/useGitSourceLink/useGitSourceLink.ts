import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { parseFluxRevision } from '../../utils/parseFluxRevision';

const PLACEHOLDER_REGEXP = /\$\{\{(\w+)\}\}/g;

function replaceTemplateVars(
  template: string,
  vars: Record<string, string>,
): string | undefined {
  const result = template.replace(PLACEHOLDER_REGEXP, (match, key) => {
    return vars[key] ?? match;
  });

  // If any placeholder remains unresolved, return undefined
  if (PLACEHOLDER_REGEXP.test(result)) {
    PLACEHOLDER_REGEXP.lastIndex = 0;
    return undefined;
  }
  PLACEHOLDER_REGEXP.lastIndex = 0;

  return result;
}

type GitRepositoryPattern = {
  targetUrl: string;
  targetUrlWithoutPath?: string;
  gitRepositoryUrlPattern: string;
};

const defaultGitRepositoryPatterns: GitRepositoryPattern[] = [
  {
    targetUrl:
      'https://${{HOSTNAME}}/${{REPOSITORY_PATH}}/tree/${{REVISION}}/${{PATH}}',
    targetUrlWithoutPath:
      'https://${{HOSTNAME}}/${{REPOSITORY_PATH}}/tree/${{REVISION}}',
    gitRepositoryUrlPattern:
      '^ssh:\\/\\/git@(ssh\\.)?(?<HOSTNAME>github.+?)(:443)?\\/(?<REPOSITORY_PATH>.+?)(\\.git)?$',
  },
  {
    targetUrl:
      'https://${{HOSTNAME}}/${{REPOSITORY_PATH}}/tree/${{REVISION}}/${{PATH}}',
    targetUrlWithoutPath:
      'https://${{HOSTNAME}}/${{REPOSITORY_PATH}}/tree/${{REVISION}}',
    gitRepositoryUrlPattern:
      '^https:\\/\\/(?<HOSTNAME>github.+?)\\/(?<REPOSITORY_PATH>.+?)$',
  },
];

export function useGitSourceLink({
  url,
  revision,
  path,
}: {
  url?: string;
  revision?: string;
  path?: string;
}): string | undefined {
  const config = useApi(configApiRef);
  const customPatternsConfig = config.getOptionalConfigArray(
    'gs.gitopsRepositories',
  );

  if (!url || !revision) {
    return undefined;
  }

  const customPatterns: GitRepositoryPattern[] = customPatternsConfig
    ? customPatternsConfig.map(c => ({
        targetUrl: c.getString('targetUrl'),
        gitRepositoryUrlPattern: c.getString('gitRepositoryUrlPattern'),
      }))
    : [];

  const patterns = [...defaultGitRepositoryPatterns, ...customPatterns];

  const vars: Record<string, string> = {
    REVISION: parseFluxRevision(revision),
    ...(path ? { PATH: path } : {}),
  };

  for (const pattern of patterns) {
    const regexp = new RegExp(pattern.gitRepositoryUrlPattern);
    const match = url.match(regexp);

    if (match?.groups) {
      const template = path
        ? pattern.targetUrl
        : (pattern.targetUrlWithoutPath ?? pattern.targetUrl);

      const finalUrl = replaceTemplateVars(template, {
        ...vars,
        ...match.groups,
      });

      if (finalUrl) {
        try {
          return new URL(finalUrl).toString();
        } catch {
          return undefined;
        }
      }
    }
  }

  return undefined;
}
