import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Button, Flex, Skeleton, Text, TextField } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  EmptyStateCard,
  fieldErrorProps,
  SimpleAccordion,
  useFieldValidation,
  useProvidePageHeaderActions,
  useWizardFrameRail,
  WizardFrame,
} from '@giantswarm/backstage-plugin-ui-react';
import { useServerSignIn } from '@giantswarm/backstage-plugin-muster';

import { useCustomizePaths } from '../../hooks/useCustomizePaths';
import { useMusterPluginApi } from '../../hooks/useMusterPluginApi';
import {
  useWorkspaceManagerAvailability,
  useWorkspaceManagerClient,
} from '../../hooks/useWorkspaceManager';
import {
  NAME_CHECK_DEBOUNCE_MS,
  useDebouncedValue,
  useEditedWorkspace,
  useNameAvailability,
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
  type WorkspaceManagerError,
  type WorkspacePreview,
  type WorkspaceStorage,
} from '../../lib/workspaceManager';
import {
  editorGate,
  WorkspaceEditorGate,
  type EditorGate,
} from './WorkspaceEditorGate';
import {
  formatKiB,
  formatQuantity,
  WorkspacePreviewPanel,
} from './WorkspacePreviewPanel';
import { WorkspaceSourceEditor } from './WorkspaceSourceEditor';
import { workspaceDetailRouteRef } from '../../routes';

const useStyles = makeStyles({
  // The unit after the number, outside the editable value: bui's TextField
  // only places an icon before it.
  unitField: {
    '& .bui-InputWrapper': { position: 'relative' },
    '& .bui-Input': { paddingRight: 44 },
    '& .bui-InputWrapper::after': {
      content: '"GiB"',
      position: 'absolute',
      right: 12,
      top: '50%',
      transform: 'translateY(-50%)',
      color: 'var(--bui-fg-secondary)',
      fontSize: 'var(--bui-font-size-2)',
      pointerEvents: 'none',
    },
  },
});

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
        message: 'A workspace with this name exists in this environment.',
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
  const tabHref = useWorkspacesTabHref(organization);
  // Editing closes to the workspace's page, its address's parent; creating to
  // the Workspaces tab.
  const detailRoute = useRouteRef(workspaceDetailRouteRef);
  const closeHref =
    (name && detailRoute?.({ installation, organization, name })) || tabHref;

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
  // Editing opens one source at a time; the first until another is chosen.
  const [expanded, setExpanded] = useState<string | undefined>();
  const expandedKey = expanded ?? draft?.sources[0]?.key;

  const [problem, setProblem] = useState<SaveProblem | undefined>();
  const [previewPage, setPreviewPage] = useState(1);
  const preview = useWorkspacePreview(
    client,
    organization,
    draft ?? emptyDraft(),
    { page: previewPage, search: '' },
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
  // The name is checked once typing pauses too, and whether it is free.
  const typedName = draft?.name.trim() ?? '';
  const pausedName = useDebouncedValue(typedName, NAME_CHECK_DEBOUNCE_MS);
  const nameAvailability = useNameAvailability(
    isEdit ? undefined : client,
    typedName,
    !problems.name,
  );
  const errorFor = useCallback(
    (field: string) => {
      if (problem?.field === field) {
        return problem.message;
      }
      if (field === 'name') {
        if (nameAvailability.state === 'taken') {
          return `A workspace named ${typedName} exists on ${installation}. Choose another name.`;
        }
        if (typedName && pausedName === typedName) {
          return problems.name;
        }
      }
      return touched.has(field)
        ? problems[field]
        : validation.errorFor(field, problems[field]);
    },
    [
      problem,
      problems,
      validation,
      touched,
      nameAvailability.state,
      typedName,
      pausedName,
      installation,
    ],
  );

  const save = useSaveWorkspace(client);
  const onSave = useCallback(async () => {
    if (!draft) {
      return;
    }
    if (
      Object.keys(problems).length > 0 ||
      nameAvailability.state === 'taken'
    ) {
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
    nameAvailability.state,
    validation,
    save,
    organization,
    isEdit,
    edited.data,
    navigate,
    closeHref,
  ]);

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

  const storage = edited.data?.storage;
  const minimum = Number(draft?.minimumGiB || '0');
  let disk: string | undefined;
  const volumeSize = storage?.volumeSize ?? edited.data?.workspace.volumeSize;
  if (volumeSize) {
    disk = `${formatQuantity(volumeSize)}, ${
      minimum > 0 ? `at least ${minimum} GiB` : 'automatic'
    }`;
  } else if (minimum > 0 && preview.data) {
    disk = `about ${formatQuantity(preview.data.estimatedVolumeSize)}, at least ${minimum} GiB`;
  }
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
        providerCount={
          new Set(draft?.sources.map(source => source.provider)).size
        }
        disk={disk}
        excluded={draft?.sources.flatMap(source => source.exclude) ?? []}
      />
    </Flex>
  );

  const title = isEdit ? `Edit ${name}` : 'New workspace';
  return (
    <WizardFrame
      title={title}
      documentTitle={[title, 'Workspaces']}
      context={
        isEdit ? `Customize / Workspaces / ${name}` : 'Customize / Workspaces'
      }
      meta={`Organization ${organization} · ${installation}`}
      closeHref={closeHref}
      confirmDiscard={isDirty}
      width="wide"
      rail={previewPanel}
    >
      <EditorBody
        gate={gate}
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
        draft={draft}
        problem={problem}
        errorFor={errorFor}
        touch={touch}
        onNameBlur={nameAvailability.checkNow}
        nameAvailable={nameAvailability.state === 'available'}
        update={update}
        sourcesSummary={
          draft && isEdit
            ? sourcesSummary(draft, preview.data?.total)
            : undefined
        }
        onAddSource={() => {
          if (draft) {
            const source = emptySource(
              providers.length === 1 ? providers[0].name : '',
            );
            update({ ...draft, sources: [...draft.sources, source] });
            setExpanded(source.key);
          }
        }}
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
                  errorFor={errorFor}
                  touch={touch}
                  onExpand={
                    isEdit && source.key !== expandedKey
                      ? () => setExpanded(source.key)
                      : undefined
                  }
                />
              ))
            : null
        }
        providersError={providersQuery.error}
        previewPanel={previewPanel}
        diskLine={diskLine({
          isEdit,
          storage,
          volumeSize,
          preview: preview.data,
        })}
      />
    </WizardFrame>
  );
}

/** "2 sources on 2 providers · 9 repositories". */
function sourcesSummary(draft: WorkspaceDraft, total: number | undefined) {
  const count = draft.sources.length;
  const providers = new Set(draft.sources.map(source => source.provider)).size;
  return [
    `${count} ${count === 1 ? 'source' : 'sources'} on ${providers} ${
      providers === 1 ? 'provider' : 'providers'
    }`,
    total === undefined
      ? undefined
      : `${total} ${total === 1 ? 'repository' : 'repositories'}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** What the disk holds and how big it is, or will start. */
function diskLine({
  isEdit,
  storage,
  volumeSize,
  preview,
}: {
  isEdit: boolean;
  storage: WorkspaceStorage | undefined;
  volumeSize: string | undefined;
  preview: WorkspacePreview | undefined;
}): string {
  const lead =
    'The disk holds the copies of the repositories, each session’s directory, and room for the changes agents make. It is sized automatically, grows when more is needed and never shrinks.';
  if (isEdit && volumeSize && storage) {
    return `${lead} Right now it is ${formatQuantity(volumeSize)}: ${formatKiB(
      storage.mirrorsBytes / 1024,
    )} of repositories and ${formatKiB(
      storage.sessionsBytes / 1024,
    )} of session directories, plus room to work, rounded up.`;
  }
  if (preview) {
    return `${lead} It will start at about ${formatQuantity(
      preview.estimatedVolumeSize,
    )}: an estimated ${formatKiB(
      preview.providerSizeKiB,
    )} for the repositories plus room to work. The exact size is known after the first synchronization.`;
  }
  return `${lead} Its first size is estimated once a source selects repositories.`;
}

type EditorBodyProps = {
  gate: EditorGate | undefined;
  availability: ReturnType<typeof useWorkspaceManagerAvailability>;
  isEdit: boolean;
  isLoading: boolean;
  loadError: unknown;
  installation: string;
  draft: WorkspaceDraft | undefined;
  problem: SaveProblem | undefined;
  errorFor: (field: string) => string | undefined;
  /** Marks a field the person left, so its problem shows at once. */
  touch: (field: string) => void;
  onNameBlur: () => void;
  nameAvailable: boolean;
  update: (draft: WorkspaceDraft) => void;
  /** Editing: the sources in one line, above them. */
  sourcesSummary: string | undefined;
  onAddSource: () => void;
  sourceEditors: React.ReactNode;
  providersError: unknown;
  previewPanel: React.ReactNode;
  diskLine: string;
};

/** The form inside the frame: it reads whether the frame docks the preview. */
function EditorBody({
  gate,
  availability,
  isEdit,
  isLoading,
  loadError,
  installation,
  draft,
  problem,
  errorFor,
  touch,
  onNameBlur,
  nameAvailable,
  update,
  sourcesSummary: summary,
  onAddSource,
  sourceEditors,
  providersError,
  previewPanel,
  diskLine: disk,
}: EditorBodyProps) {
  const { docked } = useWizardFrameRail();
  const classes = useStyles();

  if (!availability.isLoading && !availability.isAvailable) {
    return (
      <EmptyStateCard
        title="Workspaces are not available here"
        description={`Workspaces are not turned on for ${installation}. Ask your platform team to turn them on.`}
      />
    );
  }
  if (gate) {
    return <WorkspaceEditorGate gate={gate} installation={installation} />;
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

  const nameError = errorFor('name');
  return (
    <Flex direction="column" gap="4">
      {!isEdit && (
        <Text variant="body-medium" color="secondary">
          Choose the source code repositories agents can work with. Each source
          is a GitHub or GitLab owner, such as an organization or a group, and
          the repositories you pick from it.
        </Text>
      )}

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
          title="Could not read the providers"
          description={classifyWorkspaceManagerError(providersError).message}
        />
      )}

      {!isEdit && (
        <Flex direction="column" gap="1">
          <TextField
            label="Name"
            isRequired
            description="Lowercase letters, digits and dashes, up to 40 characters. It can’t be changed later."
            value={draft.name}
            onChange={value => update({ ...draft, name: value })}
            onBlur={() => {
              touch('name');
              onNameBlur();
            }}
            {...fieldErrorProps(nameError)}
          />
          {nameAvailable && !nameError && (
            <Text variant="body-small" color="success" role="status">
              {draft.name.trim()} is available
            </Text>
          )}
        </Flex>
      )}

      {summary && (
        <Flex direction="column" gap="1">
          <Text variant="title-x-small" as="h2">
            Sources
          </Text>
          <Text variant="body-small" color="secondary">
            {summary}
          </Text>
        </Flex>
      )}
      {sourceEditors}
      {draft.sources.length < MAX_SOURCES && (
        <div>
          <Button variant="secondary" size="small" onPress={onAddSource}>
            Add source
          </Button>
        </div>
      )}

      <SimpleAccordion title="Advanced options" headingLevel={2}>
        <Flex direction="column" gap="2">
          <Text variant="body-small" weight="bold">
            Disk space
          </Text>
          <Text
            variant="body-small"
            color="secondary"
            data-testid="storage-estimate"
          >
            {disk}
          </Text>
          <div style={{ maxWidth: 240 }} className={classes.unitField}>
            <TextField
              label="Minimum size"
              inputMode="numeric"
              // The unit drawn after the number is no text a screen reader
              // reads: the description names it.
              description="The disk never gets smaller than this many GiB. 0 means automatic sizing only. Raise it if agents need a lot of room, for example for large builds."
              value={draft.minimumGiB}
              onChange={value => update({ ...draft, minimumGiB: value })}
              onBlur={() => touch('sizing.minimum')}
              {...fieldErrorProps(errorFor('sizing.minimum'))}
            />
          </div>
        </Flex>
      </SimpleAccordion>

      {!docked && previewPanel}
    </Flex>
  );
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
