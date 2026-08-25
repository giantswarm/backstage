import { useApi, fetchApiRef } from '@backstage/frontend-plugin-api';
import { useAsync } from 'react-use';
import type {
    PolicyFilter,
    SourceDetails,
} from '@internal/backstage-plugin-policy-reporter-common';

type PolicySourcesResponse = {
    filter: PolicyFilter;
    sources: SourceDetails[];
};

export function usePolicySources(cluster: string | undefined, source?: string) {
    const { fetch } = useApi(fetchApiRef);

    return useAsync(async (): Promise<PolicySourcesResponse | undefined> => {
        if (!cluster) return undefined;

        const url = new URL(`plugin://policy-reporter/${cluster}/policy-sources`);
        if (source) {
            url.searchParams.set('sources', source);
        }

        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error(`Failed to fetch policy sources: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }, [fetch, cluster, source]);
}
