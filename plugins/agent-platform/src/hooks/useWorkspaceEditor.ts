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
  toSizing,
  toUpdateInput,
  type WorkspaceDraft,
} from '../lib/workspaceDraft';
import {
  classifyWorkspaceManagerError,
  type ListRepositoriesInput,
  type Workspace,
  type WorkspacePreview,
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
 * Read again on every open of the editor and when the window regains focus,
 * so a sign-in finished elsewhere or in another tab shows without a reload.
 */
export function useWorkspaceProviders(
  client: WorkspaceManagerClient | undefined,
) {
  return useQuery({
    queryKey: editorKey(client?.installation ?? '', 'providers'),
    enabled: Boolean(client),
    queryFn: () => client!.listProviders(),
    refetchOnMount: 'always',
    // The person's return from a provider's sign-in tab is when a grant
    // shows: read again then, however fresh the last answer (the plugin
    // trusts an answer for a minute).
    refetchOnWindowFocus: 'always',
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

/**
 * The owners on a provider instance the person can pick from; an error (a
 * manager before `list_owners`) leaves the owner a free text field.
 */
export function useProviderOwners(
  client: WorkspaceManagerClient | undefined,
  organization: string,
  provider: string | undefined,
) {
  return useQuery({
    queryKey: editorKey(
      client?.installation ?? '',
      'owners',
      organization,
      provider,
    ),
    enabled: Boolean(client && provider),
    queryFn: () => client!.listOwners({ organization, provider: provider! }),
    retry: false,
    staleTime: 60_000,
  });
}

/** How long a typed name rests before its availability is checked. */
export const NAME_CHECK_DEBOUNCE_MS = 500;

export type NameAvailability = 'checking' | 'available' | 'taken' | undefined;

/**
 * Whether a valid typed name is free on the installation: `get_workspace`
 * answers not found. Checked once typing pauses, and at once on `checkNow`
 * (the field's blur); undefined while the name is invalid or unread.
 */
export function useNameAvailability(
  client: WorkspaceManagerClient | undefined,
  name: string,
  isValid: boolean,
) {
  const [blurred, setBlurred] = useState<string | undefined>();
  const debounced = useDebouncedValue(name, NAME_CHECK_DEBOUNCE_MS);
  const checked = blurred === name ? name : debounced;
  const query = useQuery({
    queryKey: editorKey(client?.installation ?? '', 'name', checked),
    enabled: Boolean(client && isValid && checked && checked === name),
    queryFn: async () => {
      try {
        await client!.getWorkspace(checked);
        return 'taken' as const;
      } catch (cause) {
        if (classifyWorkspaceManagerError(cause).kind === 'not_found') {
          return 'available' as const;
        }
        throw cause;
      }
    },
    retry: false,
    staleTime: 30_000,
  });
  let state: NameAvailability;
  if (isValid && name) {
    state = checked === name && query.data ? query.data : 'checking';
    if (query.error) {
      state = undefined;
    }
  }
  return { state, checkNow: () => setBlurred(name) };
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
  const sizing = toSizing(draft);
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
