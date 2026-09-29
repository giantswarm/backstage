import { getChangeRequestTerm } from './getChangeRequestTerm';

describe('getChangeRequestTerm', () => {
  it.each([
    'ssh://git@gitlab.example.com/test-project/test-repo.git',
    'https://gitlab.com/test-project/test-repo',
    'git@gitlab.example.com:test-project/test-repo.git',
    'ssh://git@GitLab.Example.com:2222/test-project/test-repo.git',
  ])('says "merge request" for GitLab (%s)', url => {
    expect(getChangeRequestTerm(url)).toBe('merge request');
  });

  it.each([
    'ssh://git@github.com/giantswarm/management-clusters',
    'https://github.com/giantswarm/management-clusters',
    'https://bitbucket.example.net/scm/test-project/test-repo.git',
    'https://dev.azure.com/org/project/_git/repo',
  ])('says "pull request" elsewhere (%s)', url => {
    expect(getChangeRequestTerm(url)).toBe('pull request');
  });

  it('reads only the host, not a path that mentions GitLab', () => {
    expect(
      getChangeRequestTerm('https://github.com/giantswarm/gitlab-mirror'),
    ).toBe('pull request');
  });
});
