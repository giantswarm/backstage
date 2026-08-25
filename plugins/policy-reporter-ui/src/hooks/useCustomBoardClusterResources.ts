import { useApi, fetchApiRef } from '@backstage/frontend-plugin-api';
import { useAsync } from 'react-use';
import type {
    ResourceResultList,
} from '@internal/backstage-plugin-policy-reporter-common';

export function useCustomBoardClusterResources(cluster: string, customBoard: string) {
    const { fetch } = useApi(fetchApiRef);

    return useAsync(async (): Promise<ResourceResultList | undefined> => {
        if (!customBoard) return undefined;

        const url = new URL(`plugin://policy-reporter/${cluster}/custom-board/${customBoard}/cluster-resource-results`);

        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error(`Failed to fetch cluster resources: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }, [fetch, cluster, customBoard]);
}
