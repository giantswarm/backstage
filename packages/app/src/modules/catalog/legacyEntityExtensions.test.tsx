import {
  coreExtensionData,
  createExtension,
  createExtensionInput,
} from '@backstage/frontend-plugin-api';
import { createExtensionTester } from '@backstage/frontend-test-utils';
import { EntityCardBlueprint } from '@backstage/plugin-catalog-react/alpha';
import { Entity } from '@backstage/catalog-model';
import { GrafanaDashboardsEntityCard } from './legacyEntityExtensions';

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
