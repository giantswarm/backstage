import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Alert, Button, Flex, Skeleton, Text, TextField } from '@backstage/ui';
import {
  EmptyStateCard,
  fieldErrorProps,
  useFieldValidation,
  useProvidePageHeaderActions,
  useWizardFrameRail,
  WizardFrame,
  WizardStepHeading,
} from '@giantswarm/backstage-plugin-ui-react';
import { useServerSignIn } from '@giantswarm/backstage-plugin-muster';

import { useMusterPluginApi } from '../../hooks/useMusterPluginApi';
import {
  useWorkspaceManagerAvailability,
  useWorkspaceManagerClient,
} from '../../hooks/useWorkspaceManager';
import {
  useEditedWorkspace,
  useSaveWorkspace,
  useWorkspacePreview,
  useWorkspaceProviders,
} from '../../hooks/useWorkspaceEditor';
import {
  draftFromWorkspace,
  draftProblems,
  emptyDraft,
  emptySource,
  fieldOfManagerMessage,
  managerMessageText,
  type SourceDraft,
  type WorkspaceDraft,
} from '../../lib/workspaceDraft';
import {
  classifyWorkspaceManagerError,
  WORKSPACE_MANAGER_SERVER,
  type PreviewRepository,
  type WorkspaceManagerError,
} from '../../lib/workspaceManager';
import { SHELL_CUSTOMIZE_PATH } from '../ShellCustomizeRedirect';
import {
  editorGate,
  WorkspaceEditorGate,
  type EditorGate,
} from './WorkspaceEditorGate';
import { WorkspacePreviewPanel } from './WorkspacePreviewPanel';
import { WorkspaceSourceEditor } from './WorkspaceSourceEditor';

/** The manager's sources limit (the CRD's `maxItems`). */
const MAX_SOURCES = 32;

/** The Workspaces tab, scoped to the Organization. */
export function workspacesTabHref(organization?: string): string {
  return `${SHELL_CUSTOMIZE_PATH}/workspaces${
    organization ? `?organization=${encodeURIComponent(organization)}` : ''
  }`;
}

/** Where a save's refusal shows: on a field, or above the form. */
type SaveProblem = { field?: string; message: string };

function saveProblem(
  error: WorkspaceManagerError,
  organization: string,
): SaveProblem {
  switch (error.kind) {
    case 'invalid': {
      const field = fieldOfManagerMessage(error.message);
      return { field, message: managerMessageText(error.message) };
    }
    case 'already_exists':
      return {
        field: 'name',
        message: 'A workspace with this name exists on the installation.',
      };
    case 'not_member':
      return {
        message: `You are not a member of Organization ${organization}, so you cannot change its workspaces.`,
      };
    case 'conflict':
      return {
        message:
          'The workspace changed since you opened it. Reopen it to see the change, then edit again.',
      };
    default:
      return { message: error.message };
  }
}

export type WorkspaceEditorPageProps = {
  installation: string;
  organization: string;
  /** The workspace edited; absent to create one. */
  name?: string;
};

/**
 * Creates or edits a workspace of one Organization on one installation: its
 * name, its sources (each a provider instance and an owner, with
 * repositories by name, language and topic filters, exclusions, archived
 * and forks), and its storage. Every change is previewed, debounced, with
 * `preview_workspace`; Save calls `create_workspace` or `update_workspace`
 * as the person, and the manager's validation message lands on the field it
 * names. Nothing here knows one provider's conventions: the provider
 * instances come from `list_providers`. A sign-in it needs first (muster's
 * to workspace-manager, or a provider instance) shows in place of the form.
 */
export function WorkspaceEditorPage(props: WorkspaceEditorPageProps) {
  return useMusterPluginApi() ? (
    <SignedInWorkspaceEditor {...props} />
  ) : (
    <WorkspaceEditor {...props} needsManagerSignIn={false} />
  );
}

/** The editor, with whether muster waits for the person's sign-in to it. */
function SignedInWorkspaceEditor(props: WorkspaceEditorPageProps) {
  const signIn = useServerSignIn(WORKSPACE_MANAGER_SERVER, props.installation, {
    noun: 'connector',
  });
  return <WorkspaceEditor {...props} needsManagerSignIn={signIn.needsLogin} />;
}

function WorkspaceEditor({
  installation,
  organization,
  name,
  needsManagerSignIn,
}: WorkspaceEditorPageProps & { needsManagerSignIn: boolean }) {
  const isEdit = Boolean(name);
  const navigate = useNavigate();
  const managerClient = useWorkspaceManagerClient(installation);
  // Nothing is read until muster is signed in to the manager: the reads would
  // only fail, and run once the sign-in lands.
  const client = needsManagerSignIn ? undefined : managerClient;
  const availability = useWorkspaceManagerAvailability(installation);
  const providersQuery = useWorkspaceProviders(client);
  const providers = useMemo(
    () => providersQuery.data ?? [],
    [providersQuery.data],
  );
  const edited = useEditedWorkspace(client, name);
  const closeHref = workspacesTabHref(organization);

  const [draft, setDraft] = useState<WorkspaceDraft | undefined>(
    isEdit ? undefined : emptyDraft(),
  );
  useEffect(() => {
    if (isEdit && !draft && edited.data) {
      setDraft(draftFromWorkspace(edited.data.workspace));
    }
  }, [isEdit, draft, edited.data]);
  // With one provider instance there is nothing to choose.
  useEffect(() => {
    if (
      providers.length === 1 &&
      draft?.sources.some(source => !source.provider)
    ) {
      setDraft({
        ...draft,
        sources: draft.sources.map(source =>
          source.provider ? source : { ...source, provider: providers[0].name },
        ),
      });
    }
  }, [providers, draft]);

  const [problem, setProblem] = useState<SaveProblem | undefined>();
  const [previewPage, setPreviewPage] = useState(1);
  const [previewSearch, setPreviewSearch] = useState('');
  const preview = useWorkspacePreview(
    client,
    organization,
    draft ?? emptyDraft(),
    { page: previewPage, search: previewSearch },
  );

  // Only the person's edits count: the loaded workspace and the one provider
  // chosen for them leave nothing to discard.
  const [isDirty, setIsDirty] = useState(false);
  const update = useCallback((next: WorkspaceDraft) => {
    setDraft(next);
    setIsDirty(true);
    setProblem(undefined);
    setPreviewPage(1);
  }, []);
  const updateSource = useCallback(
    (index: number, source: SourceDraft) => {
      if (draft) {
        update({
          ...draft,
          sources: draft.sources.map((s, i) => (i === index ? source : s)),
        });
      }
    },
    [draft, update],
  );

  const problems = useMemo(
    () => (draft ? draftProblems(draft, isEdit) : {}),
    [draft, isEdit],
  );
  const validation = useFieldValidation();
  const errorFor = useCallback(
    (field: string) =>
      problem?.field === field
        ? problem.message
        : validation.errorFor(problems[field]),
    [problem, problems, validation],
  );

  const save = useSaveWorkspace(client);
  const onSave = useCallback(async () => {
    if (!draft) {
      return;
    }
    if (Object.keys(problems).length > 0) {
      validation.reveal();
      return;
    }
    try {
      await save.mutateAsync({
        draft,
        organization,
        ...(isEdit
          ? {
              edit: {
                resourceVersion: edited.data?.workspace.resourceVersion,
              },
            }
          : {}),
      });
      navigate(closeHref);
    } catch (cause) {
      setProblem(
        saveProblem(classifyWorkspaceManagerError(cause), organization),
      );
    }
  }, [
    draft,
    problems,
    validation,
    save,
    organization,
    isEdit,
    edited.data,
    navigate,
    closeHref,
  ]);

  // A repository a filter took is excluded on the source that took it.
  const sourceOf = useCallback(
    (repository: PreviewRepository) =>
      draft?.sources.findIndex(
        source =>
          source.provider === repository.provider &&
          repository.repository
            .toLowerCase()
            .startsWith(`${source.owner.trim().toLowerCase()}/`),
      ) ?? -1,
    [draft],
  );
  const canExclude = useCallback(
    (repository: PreviewRepository) =>
      sourceOf(repository) >= 0 &&
      repository.why.some(reason => reason !== 'name'),
    [sourceOf],
  );
  const onExclude = useCallback(
    (repository: PreviewRepository) => {
      const index = sourceOf(repository);
      if (!draft || index < 0) {
        return;
      }
      const source = draft.sources[index];
      const short = repository.repository.slice(source.owner.trim().length + 1);
      updateSource(index, {
        ...source,
        exclude: [...new Set([...source.exclude, short])],
        repositories: source.repositories.filter(r => r !== short),
      });
    },
    [draft, sourceOf, updateSource],
  );

  const gate = editorGate({ needsManagerSignIn, providers, draft, isEdit });
  const actions = useMemo(
    () =>
      draft && !gate ? (
        <Button
          variant="primary"
          isDisabled={save.isPending || !client}
          onPress={onSave}
        >
          {(() => {
            if (save.isPending) {
              return 'Saving…';
            }
            return isEdit ? 'Save changes' : 'Create workspace';
          })()}
        </Button>
      ) : null,
    [draft, gate, save.isPending, client, onSave, isEdit],
  );
  useProvidePageHeaderActions(actions);

  const previewPanel = (
    <Flex direction="column" gap="2">
      <Text variant="title-x-small" as="h2">
        Preview
      </Text>
      <WorkspacePreviewPanel
        preview={preview.data}
        error={preview.error}
        isLoading={preview.isFetching}
        isStale={preview.isStale}
        hasSources={preview.hasSources}
        page={previewPage}
        onPage={setPreviewPage}
        search={previewSearch}
        onSearch={value => {
          setPreviewSearch(value);
          setPreviewPage(1);
        }}
        onExclude={onExclude}
        canExclude={canExclude}
      />
    </Flex>
  );

  const title = isEdit ? `Edit ${name}` : 'Create workspace';
  return (
    <WizardFrame
      title={title}
      documentTitle={[title, 'Workspaces']}
      context={`Customize / Workspaces / ${organization}`}
      closeHref={closeHref}
      confirmDiscard={isDirty}
      width="wide"
      rail={previewPanel}
    >
      <EditorBody
        gate={gate}
        client={managerClient}
        onRecheckProviders={() => void providersQuery.refetch()}
        availability={availability}
        isEdit={isEdit}
        isLoading={
          !needsManagerSignIn &&
          // Until the provider instances are read, the gate cannot tell
          // whether the form is any use.
          ((!providersQuery.data && !providersQuery.error) ||
            (!draft && (edited.isLoading || availability.isLoading)))
        }
        loadError={edited.error}
        installation={installation}
        organization={organization}
        draft={draft}
        problem={problem}
        errorFor={errorFor}
        update={update}
        sourceEditors={
          draft && client
            ? draft.sources.map((source, index) => (
                <WorkspaceSourceEditor
                  key={source.key}
                  client={client}
                  organization={organization}
                  index={index}
                  source={source}
                  providers={providers}
                  onChange={next => updateSource(index, next)}
                  onRemove={
                    draft.sources.length > 1
                      ? () =>
                          update({
                            ...draft,
                            sources: draft.sources.filter(
                              (_, i) => i !== index,
                            ),
                          })
                      : undefined
                  }
                  onRecheckProviders={() => void providersQuery.refetch()}
                  errorFor={errorFor}
                />
              ))
            : null
        }
        providersError={providersQuery.error}
        previewPanel={previewPanel}
        storage={{
          neededSize: edited.data?.workspace.neededSize,
          volumeSize: edited.data?.workspace.volumeSize,
          estimated: preview.data?.estimatedVolumeSize,
        }}
      />
    </WizardFrame>
  );
}

type EditorBodyProps = {
  gate: EditorGate | undefined;
  client: ReturnType<typeof useWorkspaceManagerClient>;
  onRecheckProviders: () => void;
  availability: ReturnType<typeof useWorkspaceManagerAvailability>;
  isEdit: boolean;
  isLoading: boolean;
  loadError: unknown;
  installation: string;
  organization: string;
  draft: WorkspaceDraft | undefined;
  problem: SaveProblem | undefined;
  errorFor: (field: string) => string | undefined;
  update: (draft: WorkspaceDraft) => void;
  sourceEditors: React.ReactNode;
  providersError: unknown;
  previewPanel: React.ReactNode;
  storage: { neededSize?: string; volumeSize?: string; estimated?: string };
};

/** The form inside the frame: it reads whether the frame docks the preview. */
function EditorBody({
  gate,
  client,
  onRecheckProviders,
  availability,
  isEdit,
  isLoading,
  loadError,
  installation,
  organization,
  draft,
  problem,
  errorFor,
  update,
  sourceEditors,
  providersError,
  previewPanel,
  storage,
}: EditorBodyProps) {
  const { docked } = useWizardFrameRail();

  if (!availability.isLoading && !availability.isAvailable) {
    return (
      <EmptyStateCard
        title="Workspaces are not available here"
        description={`The installation ${installation} does not offer workspaces.`}
      />
    );
  }
  if (gate) {
    return (
      <WorkspaceEditorGate
        gate={gate}
        installation={installation}
        client={client}
        onRecheckProviders={onRecheckProviders}
      />
    );
  }
  if (loadError) {
    return (
      <Alert
        status="danger"
        title="Could not read the workspace"
        description={classifyWorkspaceManagerError(loadError).message}
      />
    );
  }
  if (isLoading || !draft) {
    return <Skeleton width="100%" height={240} />;
  }

  return (
    <Flex direction="column" gap="4">
      <WizardStepHeading
        title={isEdit ? 'Sources and storage' : 'Name and sources'}
      >
        A workspace is the set of repositories an agent Session works on, for
        everyone in {organization}. The filters are applied again at every sync,
        so a new repository that matches joins on its own.
      </WizardStepHeading>

      {problem && !problem.field && (
        <Alert
          status="danger"
          title="The workspace was not saved"
          description={problem.message}
        />
      )}
      {Boolean(providersError) && (
        <Alert
          status="warning"
          title="Could not read the provider instances"
          description={classifyWorkspaceManagerError(providersError).message}
        />
      )}

      {isEdit ? (
        <TextField
          label="Name"
          description="It cannot be changed."
          value={draft.name}
          isReadOnly
        />
      ) : (
        <TextField
          label="Name"
          isRequired
          description="Lowercase letters, digits and dashes, unique on the installation, e.g. platform-mcp."
          value={draft.name}
          onChange={value => update({ ...draft, name: value })}
          {...fieldErrorProps(errorFor('name'))}
        />
      )}

      {sourceEditors}
      {draft.sources.length < MAX_SOURCES && (
        <div>
          <Button
            variant="secondary"
            size="small"
            onPress={() =>
              update({ ...draft, sources: [...draft.sources, emptySource()] })
            }
          >
            Add source
          </Button>
        </div>
      )}

      <Flex direction="column" gap="2">
        <Text variant="title-x-small" as="h2">
          Sync
        </Text>
        <Text variant="body-small" color="secondary">
          There is no schedule. The mirrors sync after every save, on Sync now,
          and when a Session starts on a mirror older than the installation's
          refresh threshold.
        </Text>
      </Flex>

      <Flex direction="column" gap="2">
        <Text variant="title-x-small" as="h2">
          Storage
        </Text>
        <Text
          variant="body-small"
          color="secondary"
          data-testid="storage-estimate"
        >
          {storageLine(storage)}
        </Text>
        <Flex gap="3" style={{ flexWrap: 'wrap' }}>
          <TextField
            label="More headroom"
            description="Replaces the computed headroom when larger, e.g. 8Gi."
            value={draft.headroom}
            onChange={value => update({ ...draft, headroom: value })}
            {...fieldErrorProps(errorFor('sizing.headroom'))}
          />
          <TextField
            label="Minimum size"
            description="The smallest share the workspace gets, e.g. 20Gi."
            value={draft.minimum}
            onChange={value => update({ ...draft, minimum: value })}
            {...fieldErrorProps(errorFor('sizing.minimum'))}
          />
        </Flex>
        <Text variant="body-small" color="secondary">
          Session directories are cleaned up 30 days after their Session's last
          turn.
        </Text>
      </Flex>

      {!docked && previewPanel}
    </Flex>
  );
}

function storageLine({
  neededSize,
  volumeSize,
  estimated,
}: {
  neededSize?: string;
  volumeSize?: string;
  estimated?: string;
}): string {
  if (neededSize && volumeSize) {
    return `The mirrors need ${neededSize}; the share is ${volumeSize} with its headroom.${
      estimated ? ` With these sources: about ${estimated}.` : ''
    }`;
  }
  if (estimated) {
    return `Estimated share with these sources: ${estimated}. No cap; the share grows with the mirrors.`;
  }
  return 'The share is sized from what the mirrors need, with headroom. No cap.';
}

/** The page at its address: `new?installation=&organization=`, or `…/edit`. */
export function WorkspaceEditorRoute({ mode }: { mode: 'create' | 'edit' }) {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const installation =
    mode === 'edit'
      ? params.installation
      : (searchParams.get('installation') ?? undefined);
  const organization =
    mode === 'edit'
      ? params.organization
      : (searchParams.get('organization') ?? undefined);
  if (!installation || !organization) {
    return (
      <WizardFrame title="Create workspace" closeHref={workspacesTabHref()}>
        <EmptyStateCard
          title="Choose the Organization first"
          description="Start from the Workspaces tab, which knows your Organizations and installations."
        />
      </WizardFrame>
    );
  }
  return (
    <WorkspaceEditorPage
      installation={installation}
      organization={organization}
      name={mode === 'edit' ? params.name : undefined}
    />
  );
}
