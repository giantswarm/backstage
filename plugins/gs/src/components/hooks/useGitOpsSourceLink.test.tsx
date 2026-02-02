import { configApiRef } from '@backstage/core-plugin-api';
import { ApiProvider } from '@backstage/core-app-api';
import { mockApis, TestApiRegistry } from '@backstage/test-utils';
import { renderHook } from '@testing-library/react';
import { useGitOpsSourceLink } from './useGitOpsSourceLink';

const testDefaultBehaviour = (renderHookFn: any) => {
  it('should return undefined if url, revision, or path is missing', () => {
    const { result: result1 } = renderHookFn({});
    expect(result1.current).toBeUndefined();

    const { result: result2 } = renderHookFn({
      url: 'https://example.com',
    });
    expect(result2.current).toBeUndefined();

    const { result: result3 } = renderHookFn({
      revision: '1234567890',
    });
    expect(result3.current).toBeUndefined();

    const { result: result4 } = renderHookFn({
      path: './test/repo/path',
    });
    expect(result4.current).toBeUndefined();
  });

  it('should return correct URL for GitHub (SSH)', () => {
    const url1 = 'ssh://git@github.example.com:443/test-project/test-repo.git';
    const url2 = 'ssh://git@github.example.com/test-project/test-repo';
    const revision = '1234567890';
    const path = './test/repo/path';

    const { result: result1 } = renderHookFn({
      url: url1,
      revision,
      path,
    });

    expect(result1.current).toEqual(
      'https://github.example.com/test-project/test-repo/blob/1234567890/test/repo/path',
    );

    const { result: result2 } = renderHookFn({
      url: url2,
      revision,
      path,
    });

    expect(result2.current).toEqual(
      'https://github.example.com/test-project/test-repo/blob/1234567890/test/repo/path',
    );
  });

  it('should return correct URL for GitHub (HTTPS)', () => {
    const url = 'https://github.example.com/test-project/test-repo';
    const revision = '1234567890';
    const path = './test/repo/path';

    const { result } = renderHookFn({ url, revision, path });

    expect(result.current).toBe(
      'https://github.example.com/test-project/test-repo/blob/1234567890/test/repo/path',
    );
  });

  it('should correctly parse branch@sha1:commit revision format', () => {
    const url = 'https://github.example.com/test-project/test-repo';
    const revision = 'main@sha1:abc123def456';
    const path = './test/repo/path';

    const { result } = renderHookFn({ url, revision, path });

    expect(result.current).toBe(
      'https://github.example.com/test-project/test-repo/blob/abc123def456/test/repo/path',
    );
  });

  it('should return undefined if url does not math any known patterns', () => {
    const url = 'https://example.net/test-project/test-repo.git';
    const revision = '1234567890';
    const path = './test/repo/path';

    const { result } = renderHookFn({ url, revision, path });

    expect(result.current).toBeUndefined();
  });
};

describe('useGitOpsSourceLink', () => {
  describe('when configuration for Git repository URL patterns is not provided', () => {
    const configApiMock = mockApis.config({
      data: {},
    });

    const apis = TestApiRegistry.from([configApiRef, configApiMock]);
    const wrapper = ({ children }: { children?: any }) => {
      return <ApiProvider apis={apis}>{children}</ApiProvider>;
    };

    const renderHookWithWrapper = ({
      url,
      revision,
      path,
    }: {
      url?: string;
      revision?: string;
      path?: string;
    }) => {
      return renderHook(
        () => {
          return useGitOpsSourceLink({ url, revision, path });
        },
        {
          wrapper,
        },
      );
    };

    testDefaultBehaviour(renderHookWithWrapper);
  });

  describe('when configuration for Git repository URL patterns is provided', () => {
    const configApiMock = mockApis.config({
      data: {
        gs: {
          gitopsRepositories: [
            {
              targetUrl:
                'https://${{HOSTNAME}}/projects/${{PROJECT_NAME}}/repos/${{REPOSITORY_NAME}}/browse/${{PATH}}?at=${{REVISION}}',
              gitRepositoryUrlPattern:
                '^https:\/\/(?<HOSTNAME>bitbucket.+?)\/scm\/(?<PROJECT_NAME>.+?)\/(?<REPOSITORY_NAME>.+?)(\.git)?$',
            },
            {
              targetUrl:
                'https://${{HOSTNAME}}/${{REPOSITORY_PATH}}/-/tree/${{REVISION}}/${{PATH}}',
              gitRepositoryUrlPattern:
                '^ssh:\/\/git@(?<HOSTNAME>gitlab.+?)\/(?<REPOSITORY_PATH>.+?)(\.git)?$',
            },
          ],
        },
      },
    });

    const apis = TestApiRegistry.from([configApiRef, configApiMock]);
    const wrapper = ({ children }: { children?: any }) => {
      return <ApiProvider apis={apis}>{children}</ApiProvider>;
    };

    const renderHookWithWrapper = ({
      url,
      revision,
      path,
    }: {
      url?: string;
      revision?: string;
      path?: string;
    }) => {
      return renderHook(
        () => {
          return useGitOpsSourceLink({ url, revision, path });
        },
        {
          wrapper,
        },
      );
    };

    testDefaultBehaviour(renderHookWithWrapper);

    it('should return correct URL for BitBucket', () => {
      const url =
        'https://bitbucket.example.net/scm/test-project/test-repo.git';
      const revision = '1234567890';
      const path = './test/repo/path';

      const { result } = renderHookWithWrapper({ url, revision, path });

      expect(result.current).toEqual(
        'https://bitbucket.example.net/projects/test-project/repos/test-repo/browse/test/repo/path?at=1234567890',
      );
    });

    it('should return correct URL for GitLab', () => {
      const url = 'ssh://git@gitlab.example.com/test-project/test-repo.git';
      const revision = '1234567890';
      const path = './test/repo/path';

      const { result } = renderHookWithWrapper({ url, revision, path });

      expect(result.current).toEqual(
        'https://gitlab.example.com/test-project/test-repo/-/tree/1234567890/test/repo/path',
      );
    });
  });
});
