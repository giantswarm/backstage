import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { formatTemplateString } from '../utils/formatTemplateString';

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

  if (!url || !revision || !path || !gitopsRepositoriesConfig) {
    return undefined;
  }

  const data = {
    PATH: path,
    REVISION: revision,
  };

  const gitopsRepositoryConfig = gitopsRepositoriesConfig.find(configItem => {
    const pattern = configItem.getString('gitRepositoryUrlPattern');
    const regexp = new RegExp(pattern);
    return regexp.test(url);
  });

  if (gitopsRepositoryConfig) {
    const pattern = gitopsRepositoryConfig.getString('gitRepositoryUrlPattern');
    const targetUrl = gitopsRepositoryConfig.getString('targetUrl');

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
