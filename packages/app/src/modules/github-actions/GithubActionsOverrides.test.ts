import { Entity } from '@backstage/catalog-model';
import { configApiRef } from '@backstage/core-plugin-api';
import {
  createExtensionTester,
  mockApis,
} from '@backstage/frontend-test-utils';
import {
  EntityCardBlueprint,
  EntityContentBlueprint,
} from '@backstage/plugin-catalog-react/alpha';
import {
  GSAuthProvidersApi,
  gsAuthProvidersApiRef,
} from '@giantswarm/backstage-plugin-gs';
import {
  GithubActionsEntityContent,
  GithubActionsRecentRunsEntityCard,
} from './GithubActionsOverrides';

const component: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'external-secrets',
    annotations: { 'github.com/project-slug': 'giantswarm/external-secrets' },
  },
  spec: { type: 'service' },
};

function loginApis(musterGrant: boolean) {
  return [
    [configApiRef, mockApis.config({ data: {} })],
    [
      gsAuthProvidersApiRef,
      { hasGithubAuthApi: () => musterGrant } as Partial<GSAuthProvidersApi>,
    ],
  ] as const;
}

describe.each([
  [
    'the GitHub Actions tab',
    (musterGrant: boolean) =>
      createExtensionTester(GithubActionsEntityContent, {
        apis: loginApis(musterGrant),
      }).get(EntityContentBlueprint.dataRefs.filterFunction),
  ],
  [
    'the recent-runs card',
    (musterGrant: boolean) =>
      createExtensionTester(GithubActionsRecentRunsEntityCard, {
        apis: loginApis(musterGrant),
      }).get(EntityCardBlueprint.dataRefs.filterFunction),
  ],
])('%s', (_, filterOf) => {
  it("is offered with a GitHub login, on the plugin's own filter", () => {
    const filter = filterOf(true);

    expect(filter?.(component)).toBe(true);
    expect(filter?.({ ...component, metadata: { name: 'no-slug' } })).toBe(
      false,
    );
  });

  it('is not offered without a GitHub login', () => {
    expect(filterOf(false)?.(component)).toBe(false);
  });
});
