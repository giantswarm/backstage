import { useApi, fetchApiRef } from '@backstage/frontend-plugin-api';
import { useAsync } from 'react-use';
import type { ResultList } from '@internal/backstage-plugin-policy-reporter-common';

export function useResourceResults(cluster: string, resource: string, source?: string, category?: string) {
    const { fetch } = useApi(fetchApiRef);

    return useAsync(async (): Promise<ResultList | undefined> => {
        if (!cluster || !resource) return undefined;

        const url = new URL(`plugin://policy-reporter/${cluster}/resource/${resource}/results`);
        if (source) {
            url.searchParams.set('sources', source);
        }
        if (category) {
            url.searchParams.set('categories', category);
        }

        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error(`Failed to fetch resource results: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }, [fetch, cluster, resource, source, category]);
}
