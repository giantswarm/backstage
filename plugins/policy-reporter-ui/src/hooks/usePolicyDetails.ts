import { useApi, fetchApiRef } from '@backstage/frontend-plugin-api';
import { useAsync } from 'react-use';
import type { PolicyDetails } from '@internal/backstage-plugin-policy-reporter-common';

export function usePolicyDetails(cluster: string, source: string, policy: string) {
    const { fetch } = useApi(fetchApiRef);

    return useAsync(async (): Promise<PolicyDetails | undefined> => {
        if (!cluster) return undefined;

        const url = new URL(`plugin://policy-reporter/${cluster}/${source}/policy/details`);
        url.searchParams.set('policy', policy);

        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error(`Failed to fetch policy details: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }, [fetch, cluster, source, policy]);
}
