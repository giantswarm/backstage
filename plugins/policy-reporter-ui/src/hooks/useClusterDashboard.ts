import { useApi, fetchApiRef } from '@backstage/frontend-plugin-api';
import { useAsync } from 'react-use';
import type { Dashboard } from '@internal/backstage-plugin-policy-reporter-common';

export function useClusterDashboard() {
    const { fetch } = useApi(fetchApiRef);

    return useAsync(async (): Promise<Dashboard | undefined> => {
        const url = new URL(`plugin://policy-reporter/clusters`);

        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error(`Failed to fetch dashboard: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }, [fetch]);
}
