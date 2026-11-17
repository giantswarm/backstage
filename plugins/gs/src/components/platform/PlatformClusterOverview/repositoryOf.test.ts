import { repositoryOf } from './PlatformClusterOverview';

describe('repositoryOf', () => {
  it.each([
    ['https://github.com/example/fern-gitops', 'example/fern-gitops'],
    [
      'https://github.com/example/fern-gitops/tree/main/clusters',
      'example/fern-gitops',
    ],
    [
      'https://gitlab.com/group/sub/repo/-/tree/main/clusters',
      'group/sub/repo',
    ],
    [
      'https://dev.azure.com/org/project/_git/repo?path=/clusters',
      'org/project/repo',
    ],
    ['https://bitbucket.org/team/repo/src/main/clusters', 'team/repo'],
    ['https://git.example.com/team/repo.git', 'team/repo'],
    ['not a url', 'not a url'],
  ])('names %s as %s', (url, name) => {
    expect(repositoryOf(url)).toBe(name);
  });
});
