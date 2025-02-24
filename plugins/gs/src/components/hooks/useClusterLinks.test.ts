import { useGitOpsSourceLink } from './useClusterLinks';

describe('useGitOpsSourceLink', () => {
  it('should return undefined if url, revision, or path is missing', () => {
    expect(useGitOpsSourceLink({})).toBeUndefined();
    expect(useGitOpsSourceLink({ url: 'https://example.com' })).toBeUndefined();
    expect(useGitOpsSourceLink({ revision: '1234567890' })).toBeUndefined();
    expect(useGitOpsSourceLink({ path: './test/repo/path' })).toBeUndefined();
  });

  it('should return undefined if url does not math any known patterns', () => {
    const url = 'https://example.net/test-project/test-repo.git';
    const revision = '1234567890';
    const path = './test/repo/path';
    const result = useGitOpsSourceLink({ url, revision, path });
    expect(result).toBeUndefined();
  });

  it('should return correct URL for Bitbucket', () => {
    const url = 'https://bitbucket.example.net/scm/test-project/test-repo.git';
    const revision = '1234567890';
    const path = './test/repo/path';
    const result = useGitOpsSourceLink({ url, revision, path });
    expect(result).toBe(
      'https://bitbucket.example.net/projects/test-project/repos/test-repo/browse/test/repo/path?at=1234567890',
    );
  });

  it('should return correct URL for GitLab', () => {
    const url = 'ssh://git@gitlab.example.com/test-project/test-repo.git';
    const revision = '1234567890';
    const path = './test/repo/path';
    const result = useGitOpsSourceLink({ url, revision, path });
    expect(result).toBe(
      'https://gitlab.example.com/test-project/test-repo/-/tree/1234567890/test/repo/path',
    );
  });

  it('should return correct URL for GitHub (SSH)', () => {
    const url1 = 'ssh://git@github.example.com:443/test-project/test-repo.git';
    const url2 = 'ssh://git@github.example.com/test-project/test-repo';
    const revision = '1234567890';
    const path = './test/repo/path';

    const result1 = useGitOpsSourceLink({ url: url1, revision, path });
    expect(result1).toBe(
      'https://github.example.com/test-project/test-repo/blob/1234567890/test/repo/path',
    );

    const result2 = useGitOpsSourceLink({ url: url2, revision, path });
    expect(result2).toBe(
      'https://github.example.com/test-project/test-repo/blob/1234567890/test/repo/path',
    );
  });

  it('should return correct URL for GitHub (HTTPS)', () => {
    const url = 'https://github.example.com/test-project/test-repo';
    const revision = '1234567890';
    const path = './test/repo/path';
    const result = useGitOpsSourceLink({ url, revision, path });
    expect(result).toBe(
      'https://github.example.com/test-project/test-repo/blob/1234567890/test/repo/path',
    );
  });
});
