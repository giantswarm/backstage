import {
  ExtensionBoundary,
  coreExtensionData,
  createExtensionBlueprint,
} from '@backstage/frontend-plugin-api';

/**
 * Blueprint for creating filter extensions for the Flux list view.
 * Follows the same pattern as CatalogFilterBlueprint from @backstage/plugin-catalog-react.
 *
 * @public
 */
export const FluxListFilterBlueprint = createExtensionBlueprint({
  kind: 'flux-list-filter',
  attachTo: { id: 'page:flux', input: 'listFilters' },
  output: [coreExtensionData.reactElement],
  factory(params: { loader: () => Promise<JSX.Element> }, { node }) {
    return [
      coreExtensionData.reactElement(
        ExtensionBoundary.lazy(node, params.loader),
      ),
    ];
  },
});
