import { configApiRef } from '@backstage/core-plugin-api';
import { coreExtensionData } from '@backstage/frontend-plugin-api';
import {
  createExtensionTester,
  mockApis,
} from '@backstage/frontend-test-utils';
import { EntityContentBlueprint } from '@backstage/plugin-catalog-react/alpha';
import {
  GSAuthProvidersApi,
  gsAuthProvidersApiRef,
} from '@giantswarm/backstage-plugin-gs';
import { GitHubPullRequestsEntityContent } from './legacyEntityExtensions';

describe('GitHubPullRequestsEntityContent', () => {
  function pullRequestsTab(apis: { config?: object; musterGrant?: boolean }) {
    return createExtensionTester(GitHubPullRequestsEntityContent, {
      apis: [
        [configApiRef, mockApis.config({ data: apis.config ?? {} })],
        [
          gsAuthProvidersApiRef,
          {
            hasGithubAuthApi: () => apis.musterGrant ?? false,
          } as Partial<GSAuthProvidersApi>,
        ],
      ],
    });
  }

  it('keeps its name, so app.extensions entries for it still apply', () => {
    // The catalog module namespaces it: entity-content:catalog/pull-requests.
    expect(pullRequestsTab({}).snapshot().id).toBe(
      'entity-content:pull-requests',
    );
  });

  it.each([
    ['the GitHub grant in muster', { musterGrant: true }],
    [
      "Backstage's own GitHub provider",
      { config: { auth: { providers: { github: {} } } } },
    ],
  ])('is offered on Components with %s', (_, apis) => {
    const tab = pullRequestsTab(apis);

    expect(tab.get(EntityContentBlueprint.dataRefs.filterExpression)).toBe(
      'kind:component',
    );
    expect(
      tab.get(EntityContentBlueprint.dataRefs.filterFunction),
    ).toBeUndefined();
    expect(tab.get(coreExtensionData.routePath)).toBe('/pull-requests');
    expect(tab.get(EntityContentBlueprint.dataRefs.title)).toBe(
      'Pull Requests',
    );
  });

  it('is not offered on a portal without a GitHub login', () => {
    // Its login dialog could not succeed there: the auth backend has no
    // GitHub provider for the upstream GitHub auth API's popup.
    const tab = pullRequestsTab({});
    const filter = tab.get(EntityContentBlueprint.dataRefs.filterFunction);

    expect(
      tab.get(EntityContentBlueprint.dataRefs.filterExpression),
    ).toBeUndefined();
    expect(
      filter?.({
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: { name: 'external-secrets' },
        spec: { type: 'service' },
      }),
    ).toBe(false);
  });
});
