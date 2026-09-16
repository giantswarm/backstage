import { useCallback, useMemo, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useQueries, useQueryClient } from '@tanstack/react-query';

import { modelManagerApiRef } from '../apis';
import { ModelManagerToolsClient } from '../apis/ModelManagerToolsClient';
import type { ModelManagerBackend } from '../lib/modelManager';
import {
  isBackendKind,
  ModelManagerNotConnectedError,
  type AddBackendInput,
  type AddBackendResult,
  type BackendKind,
  type RemoveBackendResult,
  type WriteMode,
} from '../lib/modelManagerBackends';
import { modelManagerBackendsQueryKey } from '../lib/queryKeys';
import { BACKEND_REFETCH_MS } from '../components/ServingProvider/useModelManagerServingSource';
import { useMusterPluginApi } from './useMusterPluginApi';

/**
 * model-manager's backend-registration tools on one installation, as the
 * signed-in person — `undefined` without the muster plugin (the only way to
 * reach the tools) or without an installation.
 */
export function useModelManagerToolsClient(
  installation: string | undefined,
): ModelManagerToolsClient | undefined {
  const musterApi = useMusterPluginApi();
  return useMemo(
    () =>
      musterApi && installation
        ? new ModelManagerToolsClient(musterApi, installation)
        : undefined,
    [musterApi, installation],
  );
}

/** One backend of one installation, as `GET /backends` reports it. */
/** How long model-manager's registry takes to reflect a written document. */
const REGISTRY_SETTLE_MS = 3_000;

export type RegisteredBackend = ModelManagerBackend & {
  installation: string;
  kind: BackendKind;
};

/**
 * The backends of every installation that has a model-manager — the same
 * read (and cache entry) the serving source makes, so the group headers,
 * the kinds the Add dialog still offers and the Remove confirm agree with
 * the rows. A backend of a kind this portal has no vocabulary for is left
 * out; a static one stays (it is shown, and refused by `remove_backend`).
 */
export function useRegisteredBackends(installations: string[]) {
  const modelManagerApi = useApi(modelManagerApiRef);
  const queries = useQueries({
    queries: installations.map(installation => ({
      queryKey: modelManagerBackendsQueryKey(installation),
      queryFn: () => modelManagerApi.listBackends(installation),
      staleTime: BACKEND_REFETCH_MS,
      refetchInterval: BACKEND_REFETCH_MS,
      retry: false,
    })),
  });

  const signature = queries
    .map(query => `${query.dataUpdatedAt}:${query.isLoading ? 'l' : ''}`)
    .join('|');

  return useMemo(() => {
    const backends: RegisteredBackend[] = [];
    installations.forEach((installation, index) => {
      for (const descriptor of queries[index]?.data ?? []) {
        if (isBackendKind(descriptor.backend)) {
          backends.push({
            ...descriptor,
            installation,
            kind: descriptor.backend,
          });
        }
      }
    });
    return {
      backends,
      /** The backend of a kind on an installation, if registered or static. */
      find: (installation: string, kind: string) =>
        backends.find(
          backend =>
            backend.installation === installation && backend.kind === kind,
        ),
      isLoading: queries.some(query => query.isLoading),
    };
    // `installations` and `queries` are captured by the signature.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, installations.join(',')]);
}

export type BackendWriteFailure = {
  kind: 'refused' | 'not-connected';
  /** model-manager's answer, verbatim. */
  message: string;
};

export function classifyBackendWriteFailure(
  error: unknown,
): BackendWriteFailure {
  const message = error instanceof Error ? error.message : String(error);
  return {
    kind:
      error instanceof ModelManagerNotConnectedError
        ? 'not-connected'
        : 'refused',
    message,
  };
}

export type BackendWriteState = {
  /** `add_backend` with `dryRun`: the document, nothing written. */
  dryRunAdd: (input: AddBackendInput) => Promise<AddBackendResult>;
  /** `add_backend` as the person, `mode: apply` or `mode: commit`. */
  add: (input: AddBackendInput, mode: WriteMode) => Promise<AddBackendResult>;
  /** `remove_backend` with `dryRun`: the ModelConfigs that would go. */
  dryRunRemove: (kind: BackendKind) => Promise<RemoveBackendResult>;
  /** `remove_backend` as the person. */
  remove: (kind: BackendKind, mode: WriteMode) => Promise<RemoveBackendResult>;
  isBusy: boolean;
  failure: BackendWriteFailure | undefined;
  reset: () => void;
};

/**
 * The writes of the backend dialogs, through model-manager over muster as the
 * signed-in person. A refusal is kept in model-manager's words; a "not
 * connected" answer from muster becomes the connect step; a successful write
 * invalidates every model-manager read of the installation — the backends,
 * and with them the models, nodes and jobs the serving source derives from
 * them — so the new group appears (or the removed one goes) without a reload.
 */
export function useBackendWrite(
  installation: string | undefined,
): BackendWriteState {
  const client = useModelManagerToolsClient(installation);
  const queryClient = useQueryClient();
  const [isBusy, setBusy] = useState(false);
  const [failure, setFailure] = useState<BackendWriteFailure>();

  const run = useCallback(
    async <T>(
      write: (c: ModelManagerToolsClient) => Promise<T>,
      invalidate: boolean,
    ): Promise<T> => {
      if (!client) {
        throw new Error(
          'model-manager is not reachable: muster is not installed',
        );
      }
      setBusy(true);
      setFailure(undefined);
      try {
        const result = await write(client);
        if (invalidate) {
          // Every `['agent-platform', 'model-manager', <read>, installation]`
          // key — the prefix is shared, the installation is the last segment.
          const invalidateReads = () =>
            queryClient.invalidateQueries({
              predicate: query =>
                query.queryKey[0] === 'agent-platform' &&
                query.queryKey[1] === 'model-manager' &&
                query.queryKey[3] === client.installation,
            });
          await invalidateReads();
          // model-manager's registry follows the backend document through a
          // watch, so a read right after the write can still answer the old
          // list; read once more when it has settled.
          window.setTimeout(invalidateReads, REGISTRY_SETTLE_MS);
        }
        return result;
      } catch (error) {
        setFailure(classifyBackendWriteFailure(error));
        throw error;
      } finally {
        setBusy(false);
      }
    },
    [client, queryClient],
  );

  const dryRunAdd = useCallback(
    (input: AddBackendInput) =>
      run(c => c.addBackend(input, { dryRun: true }), false),
    [run],
  );
  const add = useCallback(
    (input: AddBackendInput, mode: WriteMode) =>
      run(c => c.addBackend(input, { mode }), true),
    [run],
  );
  const dryRunRemove = useCallback(
    (kind: BackendKind) =>
      run(c => c.removeBackend(kind, { dryRun: true }), false),
    [run],
  );
  const remove = useCallback(
    (kind: BackendKind, mode: WriteMode) =>
      run(c => c.removeBackend(kind, { mode }), true),
    [run],
  );

  return {
    dryRunAdd,
    add,
    dryRunRemove,
    remove,
    isBusy,
    failure,
    reset: useCallback(() => setFailure(undefined), []),
  };
}
