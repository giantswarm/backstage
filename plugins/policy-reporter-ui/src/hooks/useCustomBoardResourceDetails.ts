import { useApi, fetchApiRef } from '@backstage/frontend-plugin-api';
import { useAsync } from 'react-use';
import type { ResourceDetails } from '@internal/backstage-plugin-policy-reporter-common';

export function useCustomBoardResourceDetails(cluster: string, customBoard: string, resource: string) {
    const { fetch } = useApi(fetchApiRef);

    return useAsync(async (): Promise<ResourceDetails | undefined> => {
        if (!cluster || !customBoard || !resource) return undefined;

        const url = new URL(`plugin://policy-reporter/${cluster}/custom-board/${customBoard}/resource/${resource}`);

        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error(`Failed to fetch custom board resource details: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }, [fetch, cluster, customBoard, resource]);
}
