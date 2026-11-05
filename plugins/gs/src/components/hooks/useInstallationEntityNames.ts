import { useApi } from '@backstage/core-plugin-api';
import { Entity } from '@backstage/catalog-model';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { useQuery } from '@tanstack/react-query';

type NamesResponse = { items: Entity[] };

// Every table cell observes this query. A stable selector lets react-query
// skip it on re-renders, and the WeakMap builds one Set per catalog answer
// for all the cells together, rather than one per cell.
const nameSets = new WeakMap<NamesResponse, Set<string>>();
const toNameSet = (response: NamesResponse) => {
  let names = nameSets.get(response);
  if (!names) {
    names = new Set(response.items.map(entity => entity.metadata.name));
    nameSets.set(response, names);
  }
  return names;
};

/**
 * Names of the installations that have a catalog entity
 * (`resource:default/<name>` of type `installation`). One request, shared by
 * every consumer through the query cache.
 */
export function useInstallationEntityNames() {
  const catalogApi = useApi(catalogApiRef);

  const { data } = useQuery({
    queryKey: [
      'catalog-entities',
      'kind',
      'resource',
      'type',
      'installation',
      'namespace',
      'default',
      'names',
    ],
    queryFn: () =>
      catalogApi.getEntities({
        filter: {
          kind: 'resource',
          'metadata.namespace': 'default',
          'spec.type': 'installation',
        },
        fields: ['metadata.name'],
      }),
    select: toNameSet,
  });

  return { installationEntityNames: data };
}
