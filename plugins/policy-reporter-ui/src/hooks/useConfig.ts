import { useApi, fetchApiRef } from '@backstage/frontend-plugin-api';
import { useAsync } from 'react-use';
import type { Config } from '@internal/backstage-plugin-policy-reporter-common';

export function useConfig() {
    const { fetch } = useApi(fetchApiRef);

    return useAsync(async (): Promise<Config | undefined> => {
        const url = new URL(`plugin://policy-reporter/config`);

        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error(`Failed to fetch config: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }, [fetch]);
}
