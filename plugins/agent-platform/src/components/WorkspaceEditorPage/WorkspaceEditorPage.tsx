import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  Accordion,
  AccordionGroup,
  AccordionPanel,
  AccordionTrigger,
  Alert,
  Button,
  Flex,
  Skeleton,
  Text,
  TextField,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  EmptyStateCard,
  fieldErrorProps,
  SimpleAccordion,
  useFieldValidation,
  type FieldBlurProps,
  useProvidePageHeaderActions,
  useSimpleAccordionStyles,
  useWizardFrameRail,
  WizardFrame,
} from '@giantswarm/backstage-plugin-ui-react';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- Provider sign-in uses the muster frontend API.
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
  WORKSPACE_NAME_MAX,
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
import { slugify } from '../../lib/slugify';
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
import { previewCount } from './sourceCount';
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

  // Creating: the name as the person types it, which only the form holds.
  // The technical name is filled in from it until the person types one of
  // their own, as on agent creation; clearing theirs (or typing the one it
  // would be) hands it back to the name.
  const [displayName, setDisplayName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const onNameChange = useCallback(
    (value: string) => {
      if (draft) {
        setDisplayName(value);
        update({
          ...draft,
          name: nameEdited ? draft.name : slugify(value, WORKSPACE_NAME_MAX),
        });
      }
    },
    [draft, update, nameEdited],
  );
  const onTechnicalNameChange = useCallback(
    (value: string) => {
      if (draft) {
        setNameEdited(
          value.trim() !== '' &&
            value !== slugify(displayName, WORKSPACE_NAME_MAX),
        );
        update({ ...draft, name: value });
      }
    },
    [draft, update, displayName],
  );

  const problems = useMemo(
    () =>
      draft
        ? draftProblems(draft, isEdit, isEdit ? undefined : displayName)
        : {},
    [draft, isEdit, displayName],
  );
  // A filled-in technical name's problem shows on the name it came from; one
  // the person typed, or none filled in at all, on the technical name.
  const technicalOnNameField =
    !isEdit && !nameEdited && Boolean(draft?.name.trim());
  const displayNameProblem =
    problems.displayName ?? (technicalOnNameField ? problems.name : undefined);
  const validation = useFieldValidation();
  const blurProps = useCallback(
    (field: string, worded?: string) =>
      validation.blurProps(
        field,
        worded ??
          (field === 'displayName' ? displayNameProblem : problems[field]),
      ),
    [validation, problems, displayNameProblem],
  );
  // Read, none to pick from, and a source that names none: it cannot be saved.
  const providersMissing =
    (Boolean(providersQuery.data) || Boolean(providersQuery.error)) &&
    providers.length === 0 &&
    Boolean(draft?.sources.some(source => !source.provider));
  const providersAlert = useRef<HTMLDivElement>(null);
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
      return validation.errorFor(
        field,
        field === 'displayName' ? displayNameProblem : problems[field],
      );
    },
    [
      problem,
      problems,
      validation,
      nameAvailability.state,
      typedName,
      pausedName,
      installation,
      displayNameProblem,
    ],
  );

  // Opens what hides a field with a problem, so its error and the focus can
  // reach it: Advanced options, and in the edit flow the first source at
  // fault while the open one has none.
  const unfold = useCallback(
    (fields: string[]) => {
      if (
        fields.includes('sizing.minimum') ||
        (!technicalOnNameField && fields.includes('name'))
      ) {
        setAdvancedOpen(true);
      }
      if (!draft) {
        return;
      }
      const faulty = draft.sources.filter((_, index) =>
        fields.some(
          field =>
            field === `sources.${index}` ||
            field.startsWith(`sources.${index}.`),
        ),
      );
      if (
        faulty.length > 0 &&
        !faulty.some(source => source.key === expandedKey)
      ) {
        setExpanded(faulty[0].key);
      }
    },
    [draft, expandedKey, technicalOnNameField],
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
      unfold([
        ...Object.keys(problems),
        ...(nameAvailability.state === 'taken' ? ['name'] : []),
      ]);
      // The provider field is not on screen: the warning takes the focus,
      // and `reveal()` moves it on to the first invalid field, if any.
      if (providersMissing) {
        providersAlert.current?.focus();
      }
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
      const refusal = saveProblem(
        classifyWorkspaceManagerError(cause),
        organization,
      );
      setProblem(refusal);
      if (refusal.field) {
        // The refused field takes the focus, so its message is read out.
        unfold([refusal.field]);
        validation.reveal();
      }
    }
  }, [
    draft,
    problems,
    nameAvailability.state,
    unfold,
    providersMissing,
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
      />
    </Flex>
  );

  // With one source the draft's preview counts it: it needs no preview of
  // its own.
  const onlySourceCount =
    draft?.sources.length === 1
      ? previewCount(preview, Boolean(client))
      : undefined;

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
        blurProps={blurProps}
        displayName={displayName}
        technicalOnNameField={technicalOnNameField}
        technicalNameValid={
          !problems.name && nameAvailability.state !== 'taken'
        }
        advancedOpen={advancedOpen}
        onAdvancedOpenChange={setAdvancedOpen}
        onNameChange={onNameChange}
        onTechnicalNameChange={onTechnicalNameChange}
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
                  blurProps={blurProps}
                  showsPicksFirst={isEdit}
                  onExpand={
                    isEdit && source.key !== expandedKey
                      ? () => setExpanded(source.key)
                      : undefined
                  }
                  draftCount={onlySourceCount}
                />
              ))
            : null
        }
        providersError={providersQuery.error}
        providersMissing={providersMissing}
        providersAlert={providersAlert}
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
  /**
   * Spread on a field so leaving it checks it; `problem` replaces the form's
   * own problem for the field.
   */
  blurProps: (field: string, problem?: string) => FieldBlurProps;
  /** Creating: the name as typed, which the technical name comes from. */
  displayName: string;
  /** Whether the technical name's problem shows on the name field. */
  technicalOnNameField: boolean;
  technicalNameValid: boolean;
  advancedOpen: boolean;
  onAdvancedOpenChange: (open: boolean) => void;
  onNameChange: (displayName: string) => void;
  onTechnicalNameChange: (name: string) => void;
  onNameBlur: () => void;
  nameAvailable: boolean;
  update: (draft: WorkspaceDraft) => void;
  /** Editing: the sources in one line, above them. */
  sourcesSummary: string | undefined;
  onAddSource: () => void;
  sourceEditors: React.ReactNode;
  providersError: unknown;
  /** No provider can be picked and a source names none, so it cannot be saved. */
  providersMissing: boolean;
  providersAlert: React.RefObject<HTMLDivElement>;
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
  blurProps,
  displayName,
  technicalOnNameField,
  technicalNameValid,
  advancedOpen,
  onAdvancedOpenChange,
  onNameChange,
  onTechnicalNameChange,
  onNameBlur,
  nameAvailable,
  update,
  sourcesSummary: summary,
  onAddSource,
  sourceEditors,
  providersError,
  providersMissing,
  providersAlert,
  previewPanel,
  diskLine: disk,
}: EditorBodyProps) {
  const { docked } = useWizardFrameRail();
  const classes = useStyles();
  const accordionClasses = useSimpleAccordionStyles();

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
  const nameBlur = blurProps('name');
  const displayNameBlur = blurProps('displayName');
  const technicalName = draft.name.trim();
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
          role="alert"
          status="danger"
          title="The workspace was not saved"
          description={problem.message}
        />
      )}
      {providersMissing && (
        <div ref={providersAlert} tabIndex={-1}>
          <Alert
            status="warning"
            title={
              providersError
                ? 'Could not read the providers'
                : 'No provider to pick from'
            }
            description={
              <Flex direction="column" gap="1">
                <Text variant="body-medium">
                  {providersError
                    ? 'A source needs a provider, so the workspace cannot be saved until the providers can be read. Try again later, or ask your platform team.'
                    : `A source needs a provider, and none is configured on ${installation}. Ask your platform team to add one.`}
                </Text>
                {Boolean(providersError) && (
                  <SimpleAccordion title="Technical details" headingLevel={2}>
                    <Text
                      variant="body-small"
                      style={{ overflowWrap: 'anywhere' }}
                    >
                      {classifyWorkspaceManagerError(providersError).message}
                    </Text>
                  </SimpleAccordion>
                )}
              </Flex>
            }
          />
        </div>
      )}
      {Boolean(providersError) && !providersMissing && (
        <Alert
          status="warning"
          title="Could not read the providers"
          description={
            <Flex direction="column" gap="1">
              <Text variant="body-medium">
                The existing sources can still be saved. Try again later to read
                the available providers, or ask your platform team.
              </Text>
              <SimpleAccordion title="Technical details" headingLevel={2}>
                <Text variant="body-small" style={{ overflowWrap: 'anywhere' }}>
                  {classifyWorkspaceManagerError(providersError).message}
                </Text>
              </SimpleAccordion>
            </Flex>
          }
        />
      )}

      {!isEdit && (
        <Flex direction="column" gap="1">
          <TextField
            label="Name"
            isRequired
            value={displayName}
            onChange={onNameChange}
            onFocus={displayNameBlur.onFocus}
            onBlur={event => {
              displayNameBlur.onBlur(event);
              if (technicalOnNameField) {
                onNameBlur();
              }
            }}
            placeholder="e.g. Platform repositories"
            // Always there: react-aria links a description to the field only
            // when it renders with it.
            description={
              technicalName && technicalNameValid
                ? `Its technical name is ${technicalName}; it cannot be changed once the workspace exists.`
                : 'Its technical name is filled in from it; it cannot be changed once the workspace exists.'
            }
            {...fieldErrorProps(
              errorFor('displayName') ??
                (technicalOnNameField ? nameError : undefined),
            )}
          />
          {nameAvailable && !nameError && (
            <Text variant="body-small" color="success" role="status">
              {technicalName} is available
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

      <AccordionGroup
        className={accordionClasses.group}
        expandedKeys={advancedOpen ? ['advanced'] : []}
        onExpandedChange={keys => onAdvancedOpenChange(keys.has('advanced'))}
      >
        <Accordion id="advanced">
          <AccordionTrigger level={2}>Advanced options</AccordionTrigger>
          <AccordionPanel>
            <Flex direction="column" gap="4">
              {!isEdit && (
                <TextField
                  label="Technical name"
                  secondaryLabel="filled in from the name"
                  isRequired
                  value={draft.name}
                  onChange={onTechnicalNameChange}
                  onFocus={nameBlur.onFocus}
                  onBlur={event => {
                    nameBlur.onBlur(event);
                    onNameBlur();
                  }}
                  placeholder="platform-repositories"
                  description="Lowercase letters, digits and dashes, up to 40 characters. Used in links and resource names."
                  {...fieldErrorProps(nameError)}
                />
              )}
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
                    {...blurProps('sizing.minimum')}
                    {...fieldErrorProps(errorFor('sizing.minimum'))}
                  />
                </div>
              </Flex>
            </Flex>
          </AccordionPanel>
        </Accordion>
      </AccordionGroup>

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
