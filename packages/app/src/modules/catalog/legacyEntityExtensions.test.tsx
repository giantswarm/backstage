import { configApiRef } from '@backstage/core-plugin-api';
import {
  coreExtensionData,
  createExtension,
  createExtensionInput,
} from '@backstage/frontend-plugin-api';
import {
  createExtensionTester,
  mockApis,
} from '@backstage/frontend-test-utils';
import {
  EntityCardBlueprint,
  EntityContentBlueprint,
} from '@backstage/plugin-catalog-react/alpha';
import { Entity } from '@backstage/catalog-model';
import {
  GSAuthProvidersApi,
  gsAuthProvidersApiRef,
} from '@giantswarm/backstage-plugin-gs';
import {
  GitHubPullRequestsEntityContent,
  GrafanaDashboardsEntityCard,
} from './legacyEntityExtensions';

// A stand-in for the catalog's overview content, the extension every entity
// card attaches to; the tester resolves it to the real extension's id.
const overviewContent = createExtension({
  kind: 'entity-content',
  name: 'catalog/overview',
  attachTo: { id: 'app', input: 'root' },
  inputs: {
    cards: createExtensionInput([coreExtensionData.reactElement]),
  },
  output: [coreExtensionData.reactElement],
  factory: ({ inputs }) => [
    coreExtensionData.reactElement(<>{inputs.cards.length}</>),
  ],
});

function group(annotations?: Record<string, string>): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Group',
    metadata: { name: 'team-bumblebee', annotations },
    spec: { type: 'team' },
  };
}

describe('GrafanaDashboardsEntityCard', () => {
  it('attaches to the entity page disabled, until a portal enables it', () => {
    // A portal whose app-config carries the plugin's required `grafana`
    // section but no `/grafana/api` proxy entry renders neither the card nor
    // its fetch error on the shared catalog's annotated team Groups; the
    // portals that wire the plugin switch it on through `app.extensions`.
    const snapshot = createExtensionTester(overviewContent)
      .add(GrafanaDashboardsEntityCard)
      .snapshot();

    expect(snapshot.children?.cards).toEqual([
      expect.objectContaining({
        id: 'entity-card:grafana-dashboards',
        disabled: true,
      }),
    ]);
  });

  it('renders only for entities carrying grafana/dashboard-selector', () => {
    const filter = createExtensionTester(GrafanaDashboardsEntityCard).get(
      EntityCardBlueprint.dataRefs.filterFunction,
    );
    if (!filter) {
      throw new Error('the card declares no filter function');
    }

    expect(
      filter(group({ 'grafana/dashboard-selector': "tags @> 'team'" })),
    ).toBe(true);
    expect(filter(group({ 'grafana/dashboard-selector': '' }))).toBe(false);
    expect(filter(group())).toBe(false);
  });
});

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
