import {
  convertLegacyPlugin,
  convertLegacyPageExtension,
} from '@backstage/core-compat-api';
import {
  circleCIPlugin,
  EntityCircleCIContent,
} from '@backstage/plugin-circleci';
import {
  githubPullRequestsPlugin,
  EntityGithubPullRequestsContent,
} from '@roadiehq/backstage-plugin-github-pull-requests';

export const circleCINfsPlugin = convertLegacyPlugin(circleCIPlugin, {
  extensions: [convertLegacyPageExtension(EntityCircleCIContent)],
});

export const githubPullRequestsNfsPlugin = convertLegacyPlugin(
  githubPullRequestsPlugin,
  {
    extensions: [convertLegacyPageExtension(EntityGithubPullRequestsContent)],
  },
);
