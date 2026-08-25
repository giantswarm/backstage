import { useApi, fetchApiRef } from '@backstage/frontend-plugin-api';
import { useAsync } from 'react-use';
import type { Dashboard } from '@internal/backstage-plugin-policy-reporter-common';

export function useDashboard(
    cluster: string | undefined,
    source: string | undefined,
    category: string | undefined,
    namespace?: string
) {
    const { fetch } = useApi(fetchApiRef);

    return useAsync(async (): Promise<Dashboard | undefined> => {
        if (!cluster) return undefined;

        const url = new URL(`plugin://policy-reporter/${cluster}/dashboard`);

        if (source) {
            url.searchParams.set('sources', source);
        }

        if (category) {
            url.searchParams.set('categories', category);
        }

        if (namespace) {
            url.searchParams.set('namespaces', namespace);
        }

        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error(`Failed to fetch dashboard: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }, [fetch, cluster, source, category, namespace]);
}
