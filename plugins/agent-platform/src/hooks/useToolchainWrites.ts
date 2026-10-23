import { useQueryClient } from '@tanstack/react-query';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';

import {
  musterToolchainSourcesQueryKey,
  musterToolchainsQueryKey,
} from '../lib/queryKeys';
import type {
  AddSourceInput,
  AddSourceResult,
  CreateToolchainResult,
} from '../lib/toolchainManager';
import { useToolchainManagerClient } from './useToolchainManager';

function requireClient<T>(client: T | undefined): T {
  if (!client) {
    throw new Error(
      'The toolchain-manager is reached through muster, and the muster plugin is not installed in this portal.',
    );
  }
  return client;
}

/**
 * Adds a repository the person maintains as a toolchain source. An answer
 * with a `status` (the App's grant or installation still missing) added
 * nothing: it is data for the dialog, not a success to report.
 */
export function useAddToolchainSource(installation: string) {
  const client = useToolchainManagerClient(installation);
  const queryClient = useQueryClient();
  return useTrackedMutation({
    event: (result: AddSourceResult) =>
      result.source
        ? {
            name: 'AgentPlatform.toolchainSourceAdded',
            attributes: {
              approval: result.source.offered ? 'approved' : 'pending',
            },
          }
        : null,
    mutationFn: (input: AddSourceInput) =>
      requireClient(client).addSource(input),
    onSuccess: result => {
      if (result.source) {
        void queryClient.invalidateQueries({
          queryKey: musterToolchainSourcesQueryKey(installation),
        });
        void queryClient.invalidateQueries({
          queryKey: musterToolchainsQueryKey(installation),
        });
      }
    },
  });
}

/**
 * Opens the pull request, as the person, that adds a new toolchain to a
 * source. An answer with a `status` opened none.
 */
export function useCreateToolchain(installation: string) {
  const client = useToolchainManagerClient(installation);
  return useTrackedMutation({
    event: (result: CreateToolchainResult) =>
      result.created
        ? { name: 'AgentPlatform.toolchainCreated', attributes: {} }
        : null,
    mutationFn: (input: { dockerfile: string; name: string; source: string }) =>
      requireClient(client).createToolchain(input),
  });
}
