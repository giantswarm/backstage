import { useApi, fetchApiRef } from '@backstage/frontend-plugin-api';
import { useAsync } from 'react-use';
import type {
    ResourceResultList,
} from '@internal/backstage-plugin-policy-reporter-common';

export function useClusterResources(cluster: string, source?: string, category?: string) {
    const { fetch } = useApi(fetchApiRef);

    return useAsync(async (): Promise<ResourceResultList | undefined> => {
        if (!cluster) return undefined;

        const url = new URL(`plugin://policy-reporter/${cluster}/cluster-scoped/resource-results`);
        if (source) {
            url.searchParams.set('sources', source);
        }
        if (category) {
            url.searchParams.set('categories', category);
        }

        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error(`Failed to fetch cluster resources: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }, [fetch, cluster, source, category]);
}
