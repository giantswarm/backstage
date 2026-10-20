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

import { useCustomizePaths } from '../../hooks/useCustomizePaths';
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
import {
  editorGate,
  WorkspaceEditorGate,
  type EditorGate,
} from './WorkspaceEditorGate';
import { WorkspacePreviewPanel } from './WorkspacePreviewPanel';
import { WorkspaceSourceEditor } from './WorkspaceSourceEditor';

/** The manager's sources limit (the CRD's `maxItems`). */
const MAX_SOURCES = 32;

/**
 * The Workspaces tab, scoped to the Organization; the portal's home where the
 * tab's route is not bound.
 */
export function useWorkspacesTabHref(organization?: string): string {
  const { workspaces } = useCustomizePaths();
  if (!workspaces) {
    return '/';
  }
  return `${workspaces}${
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
  const closeHref = useWorkspacesTabHref(organization);

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
  // A field the person left shows its problem at once; the rest on save.
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const touch = useCallback(
    (field: string) =>
      setTouched(previous =>
        previous.has(field) ? previous : new Set(previous).add(field),
      ),
    [],
  );
  const errorFor = useCallback(
    (field: string) => {
      if (problem?.field === field) {
        return problem.message;
      }
      return touched.has(field)
        ? problems[field]
        : validation.errorFor(field, problems[field]);
    },
    [problem, problems, validation, touched],
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
        touch={touch}
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
                  touch={touch}
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
  /** Marks a field the person left, so its problem shows at once. */
  touch: (field: string) => void;
  update: (draft: WorkspaceDraft) => void;
  sourceEditors: React.ReactNode;
  providersError: unknown;
  previewPanel: React.ReactNode;
  storage: { neededSize?: string; volumeSize?: string; estimated?: string };
};

/** The form inside the frame: it reads whether the frame docks the preview. */
function EditorBody({
  gate,
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
  touch,
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
        Choose the source code repositories agents work on in a session, for
        everyone in the {organization} organization. Repositories you pick by
        language or topic are picked again at every update, so a new one that
        matches joins on its own.
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

      {!isEdit && (
        <TextField
          label="Name"
          isRequired
          description="Lowercase letters, digits and dashes, unique on the installation, e.g. platform-mcp."
          value={draft.name}
          onChange={value => update({ ...draft, name: value })}
          onBlur={() => touch('name')}
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
            label="Room to grow"
            description="Optional. Space added on top of what the repositories need, when more than the installation's default, as a size such as 8Gi."
            value={draft.headroom}
            onChange={value => update({ ...draft, headroom: value })}
            onBlur={() => touch('sizing.headroom')}
            {...fieldErrorProps(errorFor('sizing.headroom'))}
          />
          <TextField
            label="Minimum disk space"
            description="Optional. The workspace never gets less than this, as a size such as 20Gi."
            value={draft.minimum}
            onChange={value => update({ ...draft, minimum: value })}
            onBlur={() => touch('sizing.minimum')}
            {...fieldErrorProps(errorFor('sizing.minimum'))}
          />
        </Flex>
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
    return `The repositories take ${neededSize}; the workspace has ${volumeSize} of disk space with room to grow.${
      estimated ? ` With these sources: about ${estimated}.` : ''
    }`;
  }
  if (estimated) {
    return `Estimated disk space with these sources: ${estimated}, the repositories plus room to grow. It grows with them; there is no cap.`;
  }
  return 'The disk space is sized from what the repositories need, plus room to grow. There is no cap.';
}

/** The page at its address: `new?installation=&organization=`, or `…/edit`. */
export function WorkspaceEditorRoute({ mode }: { mode: 'create' | 'edit' }) {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const tabHref = useWorkspacesTabHref();
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
      <WizardFrame title="Create workspace" closeHref={tabHref}>
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
