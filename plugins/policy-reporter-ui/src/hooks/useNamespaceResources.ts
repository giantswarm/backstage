import { useApi, fetchApiRef } from '@backstage/frontend-plugin-api';
import { useAsync } from 'react-use';
import type {
    ResourceResultList,
} from '@internal/backstage-plugin-policy-reporter-common';

export function useNamespaceResources(cluster: string, namespace: string, source?: string, category?: string) {
    const { fetch } = useApi(fetchApiRef);

    return useAsync(async (): Promise<ResourceResultList | undefined> => {
        if (!cluster || !namespace) return undefined;

        const url = new URL(`plugin://policy-reporter/${cluster}/namespace-scoped/resource-results`);
        url.searchParams.set('namespaces', namespace);
        if (source) {
            url.searchParams.set('sources', source);
        }
        if (category) {
            url.searchParams.set('categories', category);
        }

        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error(`Failed to fetch namespace resources: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }, [fetch, cluster, namespace, source, category]);
}
