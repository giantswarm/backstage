import { useApi, fetchApiRef } from '@backstage/frontend-plugin-api';
import { useAsync } from 'react-use';
import type { Dashboard } from '@internal/backstage-plugin-policy-reporter-common';

export function useCustomBoardNamespace(
    cluster: string | undefined,
    customBoard: string | undefined,
    namespace: string | undefined
) {
    const { fetch } = useApi(fetchApiRef);

    return useAsync(async (): Promise<Dashboard | undefined> => {
        if (!cluster) return undefined;

        const url = new URL(`plugin://policy-reporter/${cluster}/custom-board/${customBoard}/namespace/${namespace}`);

        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error(`Failed to fetch dashboard: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }, [fetch, cluster, customBoard, namespace]);
}
