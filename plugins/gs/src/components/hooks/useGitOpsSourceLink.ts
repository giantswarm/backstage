import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { formatTemplateString } from '../utils/formatTemplateString';

const defaultGitOpsRepositories = [
  {
    targetUrl:
      'https://${{HOSTNAME}}/${{REPOSITORY_PATH}}/blob/${{REVISION}}/${{PATH}}',
    gitRepositoryUrlPattern:
      '^ssh:\/\/git@(ssh\.)?(?<HOSTNAME>github.+?)(:443)?\/(?<REPOSITORY_PATH>.+?)(\.git)?$',
  },
  {
    targetUrl:
      'https://${{HOSTNAME}}/${{REPOSITORY_PATH}}/blob/${{REVISION}}/${{PATH}}',
    gitRepositoryUrlPattern:
      '^https:\/\/(?<HOSTNAME>github.+?)\/(?<REPOSITORY_PATH>.+?)$',
  },
];

export const useGitOpsSourceLink = ({
  url,
  revision,
  path,
}: {
  url?: string;
  revision?: string;
  path?: string;
}) => {
  const config = useApi(configApiRef);
  const gitopsRepositoriesConfig = config.getOptionalConfigArray(
    `gs.gitopsRepositories`,
  );

  if (!url || !revision || !path) {
    return undefined;
  }

  const gitopsRepositories = gitopsRepositoriesConfig
    ? [
        ...defaultGitOpsRepositories,
        ...gitopsRepositoriesConfig.map(configItem => ({
          targetUrl: configItem.getString('targetUrl'),
          gitRepositoryUrlPattern: configItem.getString(
            'gitRepositoryUrlPattern',
          ),
        })),
      ]
    : defaultGitOpsRepositories;

  const data = {
    PATH: path,
    REVISION: revision,
  };

  const gitopsRepository = gitopsRepositories.find(item => {
    const pattern = item.gitRepositoryUrlPattern;
    const regexp = new RegExp(pattern);
    return regexp.test(url);
  });

  if (gitopsRepository) {
    const pattern = gitopsRepository.gitRepositoryUrlPattern;
    const targetUrl = gitopsRepository.targetUrl;

    const regexp = new RegExp(pattern);
    const matchResult = url.match(regexp);

    if (matchResult && matchResult.groups) {
      const formattedUrl = formatTemplateString(targetUrl, {
        data: {
          ...data,
          ...matchResult.groups,
        },
      });

      return new URL(formattedUrl).toString();
    }
  }

  return undefined;
};
