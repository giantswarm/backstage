import { useApi, fetchApiRef } from '@backstage/frontend-plugin-api';
import { useAsync } from 'react-use';
import type { ResultList } from '@internal/backstage-plugin-policy-reporter-common';

export function useNamespaceResults(cluster: string, namespace: string, source: string, policy?: string) {
    const { fetch } = useApi(fetchApiRef);

    return useAsync(async (): Promise<ResultList | undefined> => {
        if (!cluster || !namespace || !source) return undefined;

        const url = new URL(`plugin://policy-reporter/${cluster}/namespace-scoped/results`);
        url.searchParams.set('namespaces', namespace);
        url.searchParams.set('sources', source);
        if (policy) {
            url.searchParams.set('policies', policy);
        }

        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error(`Failed to fetch namespace resources: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }, [fetch, cluster, namespace, source, policy]);
}
