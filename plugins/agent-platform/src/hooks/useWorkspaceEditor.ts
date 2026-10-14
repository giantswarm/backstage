import { useEffect, useState } from 'react';
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';

import type { WorkspaceManagerClient } from '../apis/WorkspaceManagerClient';
import {
  previewableSources,
  toCreateInput,
  toUpdateInput,
  type WorkspaceDraft,
} from '../lib/workspaceDraft';
import type {
  ListRepositoriesInput,
  Workspace,
  WorkspacePreview,
} from '../lib/workspaceManager';

/** How long the draft rests before it is previewed. */
export const PREVIEW_DEBOUNCE_MS = 400;

/** The preview's and the picker's page size. */
export const EDITOR_PAGE_SIZE = 25;

/**
 * The editor's reads, under the `muster` prefix like the plugin's other
 * workspace-manager reads: what a person sees depends on their Organizations
 * and their provider sign-ins, so none of it is persisted.
 */
const editorKey = (installation: string, ...rest: unknown[]) =>
  [
    'muster',
    'agent-platform',
    'workspace-editor',
    installation,
    ...rest,
  ] as const;

/** `value`, once it has not changed for `delayMs`. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/**
 * The installation's provider instances with the person's connection to each.
 * Read again when the window regains focus, so a sign-in finished in another
 * tab shows without a reload.
 */
export function useWorkspaceProviders(
  client: WorkspaceManagerClient | undefined,
) {
  return useQuery({
    queryKey: editorKey(client?.installation ?? '', 'providers'),
    enabled: Boolean(client),
    queryFn: () => client!.listProviders(),
    refetchOnWindowFocus: true,
    retry: false,
  });
}

/** The workspace being edited, as `get_workspace` reads it. */
export function useEditedWorkspace(
  client: WorkspaceManagerClient | undefined,
  name: string | undefined,
) {
  return useQuery({
    queryKey: editorKey(client?.installation ?? '', 'workspace', name),
    enabled: Boolean(client && name),
    queryFn: () => client!.getWorkspace(name!),
    retry: false,
    // The form is seeded once; a background read must not reset it.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/**
 * One page of an owner's repositories, as the server searches, filters and
 * pages them: the picker never holds an owner's full listing.
 */
export function useRepositoriesPage(
  client: WorkspaceManagerClient | undefined,
  input: ListRepositoriesInput | undefined,
) {
  return useQuery({
    queryKey: editorKey(client?.installation ?? '', 'repositories', input),
    enabled: Boolean(client && input && input.owner && input.provider),
    queryFn: () => client!.listRepositories(input!),
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 60_000,
  });
}

export type PreviewQuery = {
  page: number;
  search: string;
};

/**
 * What the draft selects now: `preview_workspace` with the draft's complete
 * sources, debounced. A failed preview is shown, never blocks the edit.
 */
export function useWorkspacePreview(
  client: WorkspaceManagerClient | undefined,
  organization: string | undefined,
  draft: WorkspaceDraft,
  { page, search }: PreviewQuery,
) {
  const sources = previewableSources(draft);
  const sizing = {
    ...(draft.headroom.trim() ? { headroom: draft.headroom.trim() } : {}),
    ...(draft.minimum.trim() ? { minimum: draft.minimum.trim() } : {}),
  };
  const request = useDebouncedValue(
    JSON.stringify({ sources, sizing, page, search }),
    PREVIEW_DEBOUNCE_MS,
  );
  const parsed = JSON.parse(request) as {
    sources: typeof sources;
    sizing: typeof sizing;
    page: number;
    search: string;
  };
  const query = useQuery<WorkspacePreview>({
    queryKey: editorKey(
      client?.installation ?? '',
      'preview',
      organization,
      request,
    ),
    enabled: Boolean(client && organization && parsed.sources.length > 0),
    queryFn: () =>
      client!.previewWorkspace({
        organization: organization!,
        sources: parsed.sources,
        ...(Object.keys(parsed.sizing).length > 0
          ? { sizing: parsed.sizing }
          : {}),
        page: parsed.page,
        pageSize: EDITOR_PAGE_SIZE,
        ...(parsed.search ? { search: parsed.search } : {}),
      }),
    placeholderData: keepPreviousData,
    retry: false,
  });
  return {
    ...query,
    hasSources: sources.length > 0,
    /** The draft changed since the preview shown was asked for. */
    isStale:
      request !== JSON.stringify({ sources, sizing, page, search }) ||
      query.isPlaceholderData,
  };
}

export type SaveWorkspace = {
  draft: WorkspaceDraft;
  organization: string;
  /** Set when editing: the stored workspace's version. */
  edit?: { resourceVersion?: string };
};

/**
 * `create_workspace` or `update_workspace` as the person. The manager checks
 * the spec and the membership; its refusal is the mutation's error, a
 * `WorkspaceManagerError` of its kind.
 */
export function useSaveWorkspace(client: WorkspaceManagerClient | undefined) {
  const queryClient = useQueryClient();
  return useTrackedMutation({
    event: (_workspace, { edit }) => ({
      name: 'AgentPlatform.workspaceSaved',
      attributes: { kind: edit ? 'updated' : 'created' },
    }),
    mutationFn: ({ draft, organization, edit }: SaveWorkspace) => {
      if (!client) {
        throw new Error('The workspace-manager is not reachable.');
      }
      return edit
        ? client.updateWorkspace(toUpdateInput(draft, edit.resourceVersion))
        : client.createWorkspace(toCreateInput(draft, organization));
    },
    onSuccess: (workspace: Workspace) => {
      // The Workspaces tab's lists, and this editor's reading of the workspace.
      void queryClient.invalidateQueries({
        queryKey: ['muster', 'agent-platform', 'workspaces'],
      });
      void queryClient.invalidateQueries({
        queryKey: editorKey(
          client?.installation ?? '',
          'workspace',
          workspace.name,
        ),
      });
    },
  });
}
