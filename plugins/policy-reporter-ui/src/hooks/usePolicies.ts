import { useApi, fetchApiRef } from '@backstage/frontend-plugin-api';
import { useAsync } from 'react-use';
import type { PolicyResult } from '@internal/backstage-plugin-policy-reporter-common';


export function usePolicies(cluster: string | undefined, source: string, category?: string) {
    const { fetch } = useApi(fetchApiRef);

    return useAsync(async (): Promise<{ [key: string]: PolicyResult[] } | undefined> => {
        if (!cluster) return undefined;

        const url = new URL(`plugin://policy-reporter/${cluster}/${source}/policies`);
        if (category) {
            url.searchParams.set('categories', category);
        }

        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error(`Failed to fetch policy sources: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }, [fetch, cluster, source, category]);
}
