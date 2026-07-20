/**
 * Test helper: builds the `errors` array shape that `useResources` returns,
 * mirroring its error contract — a 403 surfaces as `ForbiddenError`, a 404 as
 * `NotFoundError` (see `useListResources` in kubernetes-react). Shared by the
 * AgentsDataProvider and ModelConfigsProvider tests so the fixture shape lives in
 * one place.
 */
export type ResourceErrorFixtureOptions = {
  /** Installations whose read errored with a 403/forbidden-style failure. */
  failed?: string[];
  /** Installations whose read 404'd (kagent API group not installed). */
  notFound?: string[];
};

export function buildResourceErrors({
  failed = [],
  notFound = [],
}: ResourceErrorFixtureOptions) {
  return [
    ...failed.map(cluster => ({ cluster, error: { name: 'ForbiddenError' } })),
    ...notFound.map(cluster => ({ cluster, error: { name: 'NotFoundError' } })),
  ];
}
