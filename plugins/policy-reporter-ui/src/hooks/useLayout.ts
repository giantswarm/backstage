import { useApi, fetchApiRef } from '@backstage/frontend-plugin-api';
import { useAsync } from 'react-use';
import type { LayoutConfig } from '@internal/backstage-plugin-policy-reporter-common';

export function useLayout(cluster: string | undefined) {
    const { fetch } = useApi(fetchApiRef);

    return useAsync(async (): Promise<LayoutConfig | undefined> => {
        if (!cluster) return undefined;

        const url = new URL(`plugin://policy-reporter/${cluster}/layout`);

        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error(`Failed to fetch policy sources: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }, [fetch, cluster]);
}
