import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@backstage/core-plugin-api';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Button, Flex, Link, PasswordField, Text } from '@backstage/ui';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';
import { CREDENTIAL_OPERATION_PATTERN } from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  type BreadcrumbItem,
  EmptyStateCard,
  PageSection,
  ShellPage,
  ShellPageFactsSkeleton,
  useFieldValidation,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  agentManagerCredentialsApiRef,
  credentialOperationErrorCode,
  credentialOperationErrorMessage,
  credentialOperationErrorStatus,
} from '../../apis';
import {
  askingObjects,
  type CredentialOperation,
  type CredentialResourceResult,
  destinations,
  otherReferences,
  requestedPairs,
} from '../../lib/credentialOperations';
import {
  agentManagerCredentialOperationQueryKey,
  musterOrganizationConnectorsQueryKey,
} from '../../lib/queryKeys';
import { invalidateModelReads } from '../../hooks/defaultModelWrites';
import {
  organizationDetailRouteRef,
  organizationsRouteRef,
  modelsRouteRef,
} from '../../routes';
import { ConnectAgentManagerAlert } from '../ConnectAgentManagerAlert';
import { PortalSessionEndedAlert } from '../PortalSessionEndedAlert';
import { PortalSessionEndedError } from '../../lib/portalSession';
import { ServiceAccountKeyField } from '../ServiceAccountKeyField';
import { serviceAccountKeyError } from '../../lib/modelConfigs';

export type CredentialFormPageProps = {
  installation: string;
  /** The parent namespace the organization lives in. */
  parent?: string;
  /** The organization's name. */
  name?: string;
  /**
   * The namespace the request writes in, for a link of either scope: the
   * organization or the installation is then read from the request.
   */
  namespace?: string;
  /** agent-manager's operation id, the request the form is for. */
  operation: string;
};

const pairId = (pair: { secret: string; key: string }) =>
  `${pair.secret}/${pair.key}`;

function credentialProject(
  operation: CredentialOperation,
  pair: { secret: string; key: string },
): string {
  for (const change of operation.changes ?? []) {
    const spec = change.object?.spec;
    if (spec?.apiKeySecret !== pair.secret || spec.apiKeySecretKey !== pair.key)
      continue;
    for (const block of ['anthropicVertexAI', 'geminiVertexAI']) {
      const configuration = spec[block] as Record<string, unknown> | undefined;
      if (typeof configuration?.projectID === 'string')
        return configuration.projectID;
    }
  }
  return (
    operation.references?.find(
      reference =>
        reference.kind === 'ModelConfig' &&
        reference.key === pair.key &&
        reference.projectID,
    )?.projectID ?? ''
  );
}

/** Kubernetes kinds (references, changes) and agent-manager's result kinds. */
const KIND_LABELS: Record<string, string> = {
  ModelConfig: 'Model',
  RemoteMCPServer: 'Connector',
  EgressPolicy: 'Egress policy',
  model: 'Model',
  connector: 'Connector',
  egressPolicy: 'Egress policy',
  credential: 'Credential',
};

/**
 * agent-manager's code for a replacement's save whose consumers, or where
 * they send the value, changed since it was prepared (409, giantswarm/
 * agent-manager#373). Nothing was written; only a new preparation, with a
 * fresh `requestId`, can go on. Other conflicts (a save in progress, an
 * uncertain outcome) keep `conflict` and must not be started again.
 */
const CONSUMERS_CHANGED = 'credential_consumers_changed';

/**
 * agent-manager's code for a save whose operation creates an object that
 * exists by then, live or in git (409): someone made one of that name since
 * the request was prepared. Nothing of this request stays written; only a
 * new request, under another name, can go on.
 */
const NAME_TAKEN = 'already_exists';

/**
 * agent-manager's code (403, giantswarm/agent-manager#418) on a read, a save
 * or a cancel by the person who started the request, signed in with another
 * login: Dex gives one person a subject per connector. The answer carries
 * nothing of the request. `forbidden`, also a 403, is another refusal.
 */
const OTHER_LOGIN = 'credential_operation_other_login';

/** What the request was to create, as the name-taken refusal says it. */
function createdObject(operation: CredentialOperation | undefined): string {
  const name = operation?.result?.name;
  if (!name) {
    return 'an object with the name this request was to create';
  }
  switch (operation?.result?.kind) {
    case 'model':
      return `a model named ${name}`;
    case 'connector':
      return `a connector named ${name}`;
    case 'egressPolicy':
      return `an egress policy named ${name}`;
    default:
      return `an object named ${name}`;
  }
}

/** A replacement (`replace_organization_credential`): it writes the Secret only. */
const isReplacement = (operation: CredentialOperation) =>
  operation.result?.kind === 'credential';

const kindLabel = (kind: string) => KIND_LABELS[kind] ?? kind;

/** The request outlives the session: its id is in this page's address. */
const AFTER_SIGN_IN =
  'The request stays open for a while: this page opens it again after the sign-in, and you enter the value then.';

/**
 * The confirmation, read fresh for every visit: kept out of the persisted
 * cache (`meta.persist`), dropped when the page unmounts, and not read again
 * on focus, so what the person confirms does not change under them.
 */
function useOperation(installation: string, operation: string | undefined) {
  const api = useApi(agentManagerCredentialsApiRef);
  return useQuery({
    queryKey: agentManagerCredentialOperationQueryKey(
      installation,
      operation ?? '',
    ),
    queryFn: () => api.getOperation(installation, operation ?? ''),
    enabled: operation !== undefined,
    meta: { persist: false },
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Flex direction="column" gap="1">
      <Text variant="body-small" color="secondary">
        {label}
      </Text>
      <div>{children}</div>
    </Flex>
  );
}

/**
 * What the save writes and where the value goes: the organization (as
 * agent-manager prepared it, never as the link names it), the object that
 * asked, the other objects that read the same credential, where the value
 * is sent, and, in commit mode, the repository the pull request goes to.
 * Shown before any value can be typed.
 */
function Confirmation({
  operation,
  installation,
}: {
  operation: CredentialOperation;
  installation: string;
}) {
  const asking = askingObjects(operation);
  const others = otherReferences(operation);
  const sentTo = destinations(operation);
  const { organization, parent, namespace } = operation.organization;
  const owner =
    operation.organization.scope === 'platform'
      ? 'the installation'
      : 'the organization';
  const replacement = isReplacement(operation);
  return (
    <PageSection title="What you are about to save">
      <Flex direction="column" gap="3">
        <Fact
          label={
            operation.organization.scope === 'platform'
              ? 'Installation'
              : 'Organization'
          }
        >
          <Text>
            {[organization, parent, namespace, installation]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </Fact>
        {replacement ? (
          <Fact
            label={
              requestedPairs(operation).every(pair => pair.state === 'missing')
                ? 'Sets'
                : 'Replaces'
            }
          >
            {requestedPairs(operation).map(pair => (
              <Text key={pairId(pair)} as="p">
                The value of Secret {pair.secret}, key {pair.key}. No model,
                connector or egress policy is changed.
              </Text>
            ))}
          </Fact>
        ) : (
          <Fact label="Asked by">
            {asking.length === 0 ? (
              <Text color="secondary">No object is named.</Text>
            ) : (
              asking.map(o => (
                <Text key={`${o.kind}/${o.name}`} as="p">
                  {kindLabel(o.kind)} {o.name} (
                  {o.action === 'create' ? 'new' : 'changed'})
                </Text>
              ))
            )}
          </Fact>
        )}
        <Fact label={replacement ? 'Used by' : 'Also used by'}>
          {others.length === 0 ? (
            <Text>No other object of {owner} reads it.</Text>
          ) : (
            others.map(ref => (
              <Text key={`${ref.kind}/${ref.name}`} as="p">
                {kindLabel(ref.kind)} {ref.name}, key {ref.key}
                {ref.fromGit ? ' (from git)' : ''}
              </Text>
            ))
          )}
        </Fact>
        <Fact label="Sent to">
          {sentTo.length === 0 ? (
            <Text>
              No endpoint, egress policy or connector of {owner} names it.
            </Text>
          ) : (
            sentTo.map(destination => (
              <Text key={destination} as="p">
                {destination}
              </Text>
            ))
          )}
        </Fact>
        <Fact label="How it is saved">
          {operation.mode === 'commit' ? (
            <Text>
              A pull request to{' '}
              {operation.gitTarget?.repository ?? `${owner}’s repository`}
              {operation.gitTarget?.base
                ? ` on ${operation.gitTarget.base}`
                : ''}
              {operation.gitTarget?.directory
                ? `, in ${operation.gitTarget.directory}`
                : ''}
              , with the value encrypted.
            </Text>
          ) : (
            <Text>Live, in {owner}’s namespace.</Text>
          )}
        </Fact>
      </Flex>
    </PageSection>
  );
}

/** agent-manager's notes are clauses; the page shows them as sentences. */
function sentence(note: string): string {
  const text = note.trim();
  const capitalized = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

function Receipt({ result }: { result: CredentialResourceResult }) {
  const pr = result.commit?.pullRequest;
  let saved: string;
  if (result.kind === 'credential') {
    saved = pr
      ? `The new value of Secret ${result.name ?? ''} is in the pull request, encrypted. It applies once it merges.`
      : `The new value of Secret ${result.name ?? ''} is saved: every object that uses it now does so with it. The value is not shown again.`;
  } else {
    saved = `${
      result.kind
        ? `${kindLabel(result.kind)} ${result.name ?? ''}`
        : 'The object'
    } ${
      pr
        ? 'and its encrypted credential are in the pull request. They apply once it merges.'
        : 'has its credential. The value is not shown again.'
    }`;
  }
  return (
    <Alert
      status="success"
      title={pr ? 'Pull request opened' : 'Credential saved'}
      description={
        <Flex direction="column" gap="1">
          <Text>{saved}</Text>
          {pr ? <Link href={pr}>{pr}</Link> : null}
          {result.note ? (
            <Text color="secondary">{sentence(result.note)}</Text>
          ) : null}
        </Flex>
      }
    />
  );
}

/** Why a save failed; a commit without the GitHub grant offers the connection. */
function SaveError({
  installation,
  error,
  startAgainFrom,
  operation,
}: {
  installation: string;
  error: Error | null;
  startAgainFrom: string;
  operation: CredentialOperation | undefined;
}) {
  if (!error) {
    return null;
  }
  if (error instanceof PortalSessionEndedError) {
    return <PortalSessionEndedAlert afterSignIn={AFTER_SIGN_IN} />;
  }
  if (credentialOperationErrorCode(error) === CONSUMERS_CHANGED) {
    return (
      <Alert
        status="danger"
        title="The objects that use this credential changed"
        description={`Since this replacement was prepared, an object that uses the credential, or where it sends the value, changed, so nothing was saved. Start the replacement again from ${startAgainFrom}: the new request lists where the value goes now.`}
      />
    );
  }
  if (credentialOperationErrorCode(error) === NAME_TAKEN) {
    return (
      <Alert
        status="danger"
        title="The name is taken"
        description={`Since this request was prepared, someone made ${createdObject(operation)}, so nothing was saved. Start again from ${startAgainFrom} and choose another name.`}
      />
    );
  }
  if (credentialOperationErrorCode(error) === 'auth_required') {
    return (
      <ConnectAgentManagerAlert
        installation={installation}
        message={credentialOperationErrorMessage(error)}
        action="The pull request is opened"
        needsGitHub
      />
    );
  }
  return (
    <Alert
      status="danger"
      title="Not saved"
      description={credentialOperationErrorMessage(error)}
    />
  );
}

/**
 * Whether the operation was prepared for the target the link names. The link
 * is not trusted for it: a link to one organization with another's request
 * would have the person enter a key for an organization they do not see.
 */
function sameOrganization(
  operation: CredentialOperation,
  parent: string | undefined,
  name: string | undefined,
  namespace: string | undefined,
) {
  if (namespace) {
    return operation.organization.namespace === namespace;
  }
  return (
    operation.organization.parent === parent &&
    operation.organization.organization === name
  );
}

/**
 * Where a person starts a request again. An organization link names its
 * organization; a namespace link names only a namespace, so the place comes
 * from the request once read: Models for an installation's model, the
 * organization's page for anything of an organization.
 */
function startAgainPlace(
  operation: CredentialOperation | undefined,
  namespaceLink: boolean,
): string {
  if (!namespaceLink) {
    return 'the organization’s tab';
  }
  const target = operation?.organization;
  if (!target) {
    return 'Models or the organization’s page';
  }
  if (target.scope === 'platform') {
    const kind = operation?.result?.kind;
    return kind === 'connector' || kind === 'egressPolicy'
      ? 'where you started it'
      : 'Models';
  }
  return target.organization
    ? `the ${target.organization} organization’s page`
    : 'the organization’s page';
}

function operationPhase(
  operation: CredentialOperation | undefined,
  receipt: CredentialResourceResult | undefined,
  cancelled: boolean,
  stale: boolean,
) {
  if (receipt) return 'complete';
  if (cancelled) return 'cancelled';
  if (stale) return 'stale';
  if (
    operation?.state === 'pending' ||
    (operation?.state === 'uncertain' && operation.mode === 'apply')
  ) {
    return 'values';
  }
  if (
    operation?.state === 'saving' ||
    (operation?.state === 'uncertain' && operation.mode === 'commit')
  ) {
    return 'finish';
  }
  return operation?.state;
}

/**
 * The Dev Portal's credential form of one organization's request: opened
 * from the Models or Connectors tab, or from the link an agent or a tool
 * sends (agent-manager's URL elicitation, `credentials.uiURL` with the
 * operation's id as its last segment). It reads the operation's
 * confirmation before any value can be typed, posts the values with the
 * confirmation's version, and never shows a value back. A save interrupted
 * on agent-manager's side (`saving`, `uncertain`) is finished from here as
 * agent-manager's recovery rules say.
 */
export function CredentialFormPage({
  installation,
  parent,
  name,
  namespace,
  operation: operationParam,
}: CredentialFormPageProps) {
  const operationId = CREDENTIAL_OPERATION_PATTERN.test(operationParam)
    ? operationParam
    : undefined;
  const api = useApi(agentManagerCredentialsApiRef);
  const queryClient = useQueryClient();
  const query = useOperation(installation, operationId);
  const [values, setValues] = useState<Record<string, string>>({});
  const inputRevision = useRef(0);
  const formInputRevision = inputRevision.current;
  const [receipt, setReceipt] = useState<CredentialResourceResult>();
  const [cancelled, setCancelled] = useState(false);
  const [notice, setNotice] = useState<string>();
  const scope = useRef<HTMLDivElement>(null);
  const validation = useFieldValidation(scope);
  const clearValues = () => {
    inputRevision.current += 1;
    setValues({});
  };
  const reload = async () => {
    clearValues();
    validation.reset();
    const result = await query.refetch();
    if (result.isSuccess && result.data) {
      setNotice(undefined);
    }
  };

  // Set by a save or a cancel that agent-manager refused as another login's.
  const [otherLoginWrite, setOtherLoginWrite] = useState(false);
  // From then on the page shows nothing of the request, not even what an
  // earlier read gave.
  const otherLogin =
    otherLoginWrite ||
    (query.isError &&
      credentialOperationErrorCode(query.error) === OTHER_LOGIN);
  const loaded = otherLogin ? undefined : query.data;
  // A namespace link names no organization: the request it opens does, once
  // read and found to write in that namespace.
  const target =
    namespace && loaded?.operation.organization.namespace === namespace
      ? loaded.operation.organization
      : undefined;
  const organizationTarget =
    target &&
    target.scope !== 'platform' &&
    target.parent &&
    target.organization
      ? { parent: target.parent, name: target.organization }
      : undefined;
  const linkParent = parent ?? organizationTarget?.parent;
  const linkName = name ?? organizationTarget?.name;
  const installationTarget = target?.scope === 'platform';

  const organizationsLink = useRouteRef(organizationsRouteRef);
  const organizationLink = useRouteRef(organizationDetailRouteRef);
  const modelsLink = useRouteRef(modelsRouteRef);
  const organizationHref =
    linkParent && linkName
      ? organizationLink?.({ installation, parent: linkParent, name: linkName })
      : modelsLink?.();
  // A namespace link shows no target until the request it opens is read and
  // found to write in that namespace: the namespace itself means nothing to
  // a person.
  const targetLabel =
    linkName ?? (installationTarget || !namespace ? 'Installation' : undefined);
  const underOrganizations = Boolean(linkParent && linkName);
  const breadcrumbs: BreadcrumbItem[] = [
    {
      label: underOrganizations ? 'Organizations' : 'Models',
      href: underOrganizations ? organizationsLink?.() : modelsLink?.(),
    },
    ...(targetLabel ? [{ label: targetLabel, href: organizationHref }] : []),
    { label: 'Enter a credential' },
  ];
  const frame = {
    breadcrumbs,
    documentTitle: targetLabel
      ? ['Enter a credential', targetLabel]
      : ['Enter a credential'],
  };
  const startAgainFrom = startAgainPlace(loaded?.operation, Boolean(namespace));
  const backLink = organizationHref ? (
    <Link href={organizationHref}>Back to {linkName ?? 'models'}</Link>
  ) : undefined;

  const pairs = loaded ? requestedPairs(loaded.operation) : [];
  const [stale, setStale] = useState(false);
  const phase = operationPhase(loaded?.operation, receipt, cancelled, stale);
  // Shown when the cancel after a refusal failed: the person cancels it.
  const [cancelOffered, setCancelOffered] = useState(false);
  // The person pressed it: a failure of their cancel shows its reason.
  const [cancelPressed, setCancelPressed] = useState(false);

  /**
   * Cancels a request refused with CONSUMERS_CHANGED or NAME_TAKEN:
   * agent-manager keeps a refused replacement pending on purpose
   * (giantswarm/agent-manager#427), so it would wait until it expires. The
   * refused save may have moved its version, so it is read again first; then
   * the same cancel as Cancel request. `ifPending`: a save refused with
   * NAME_TAKEN may leave the request in a state that takes no cancel; it is
   * then left to expire, and a failed attempt offers no Cancel request,
   * which could not succeed either.
   */
  const cancelRefused = useTrackedMutation<
    void,
    Error,
    { ifPending?: boolean } | void
  >({
    event: null,
    untrackedReason: 'cancelling a refused credential request writes nothing',
    mutationFn: async options => {
      if (!operationId) {
        throw new Error('The request is not known.');
      }
      const current = await api.getOperation(installation, operationId);
      const { state } = current.operation;
      if (
        state === 'cancelled' ||
        (options?.ifPending && state !== 'pending')
      ) {
        return undefined;
      }
      return api.cancelOperation(installation, operationId, current.etag);
    },
    onError: (error, options) => {
      if (credentialOperationErrorCode(error) === OTHER_LOGIN) {
        setOtherLoginWrite(true);
      } else if (!options?.ifPending) {
        setCancelOffered(true);
      }
    },
  });

  const save = useTrackedMutation<CredentialResourceResult, Error, void>({
    event: () => ({
      name: 'AgentPlatform.organizationCredentialSaved',
      attributes: { mode: loaded?.operation.mode ?? 'apply' },
    }),
    // The values travel in this closure, never as the mutation's
    // variables, which the query client keeps.
    mutationFn: () => {
      if (!loaded || !operationId) {
        throw new Error('The confirmation is not loaded.');
      }
      if (phase !== 'values' && phase !== 'finish') {
        throw new Error(
          `This request cannot be saved. Start again from ${startAgainFrom}.`,
        );
      }
      const entered =
        phase === 'finish'
          ? []
          : pairs.map(pair => ({
              secret: pair.secret,
              key: pair.key,
              value: values[pairId(pair)] ?? '',
            }));
      return api.saveOperation(installation, operationId, loaded.etag, entered);
    },
    onSuccess: result => {
      clearValues();
      setReceipt(result);
      setNotice(undefined);
      const savedNamespace =
        result.namespace ?? loaded?.operation.organization.namespace;
      if (!savedNamespace) {
        return undefined;
      }
      return Promise.all([
        invalidateModelReads(queryClient, installation, savedNamespace),
        queryClient.invalidateQueries({
          queryKey: musterOrganizationConnectorsQueryKey(
            installation,
            savedNamespace,
          ),
        }),
      ]);
    },
    onError: error => {
      const code = credentialOperationErrorCode(error);
      if (error instanceof PortalSessionEndedError) {
        // Nothing was sent; the value is not kept for after the sign-in.
        clearValues();
      } else if (code === OTHER_LOGIN) {
        // Nothing was saved, and this login can never save it.
        clearValues();
        setOtherLoginWrite(true);
      } else if (code === 'precondition_failed') {
        clearValues();
        setNotice(
          'The request changed since you opened it. Check it again, then enter the value again.',
        );
        save.reset();
        reload();
      } else if (code === CONSUMERS_CHANGED || code === NAME_TAKEN) {
        clearValues();
        setStale(true);
        cancelRefused.mutate({ ifPending: code === NAME_TAKEN });
      } else if (code === 'outcome_unknown') {
        clearValues();
        setNotice(
          'agent-manager did not answer in time. The save may still complete: check the request again before you enter anything.',
        );
        save.reset();
        reload();
      }
    },
  });

  const cancel = useTrackedMutation<void, Error, void>({
    event: null,
    untrackedReason: 'cancelling an unsaved credential request writes nothing',
    mutationFn: () => {
      if (!loaded || !operationId) {
        throw new Error('The confirmation is not loaded.');
      }
      return api.cancelOperation(installation, operationId, loaded.etag);
    },
    onSuccess: () => {
      clearValues();
      setCancelled(true);
      setNotice(undefined);
    },
    onError: error => {
      if (credentialOperationErrorCode(error) === OTHER_LOGIN) {
        clearValues();
        setOtherLoginWrite(true);
      } else if (
        credentialOperationErrorCode(error) === 'precondition_failed'
      ) {
        clearValues();
        setNotice(
          'The request changed since you opened it. Check it again, then enter the value again.',
        );
        cancel.reset();
        void reload();
      }
    },
  });

  if (!operationId) {
    return (
      <ShellPage title="Enter a credential" {...frame}>
        <EmptyStateCard
          title="This link names no request"
          description={
            namespace
              ? 'A credential is entered for one request: from Models, from an organization’s page, or from the link an agent sends you.'
              : `A credential is entered for one request: from the Models or Connectors tab of ${name}, or from the link an agent sends you.`
          }
          actions={backLink}
        />
      </ShellPage>
    );
  }

  if (query.isPending) {
    return (
      <ShellPage title="Enter a credential" {...frame}>
        <ShellPageFactsSkeleton />
      </ShellPage>
    );
  }

  if (otherLogin) {
    return (
      <ShellPage title="Enter a credential" {...frame}>
        <EmptyStateCard
          title="This request was started with another login"
          description="Sign out, sign in the same way as when you started the request, then open this link again."
          actions={backLink}
        />
      </ShellPage>
    );
  }

  if (
    !receipt &&
    !cancelled &&
    query.isError &&
    !query.isFetching &&
    query.error instanceof PortalSessionEndedError
  ) {
    return (
      <ShellPage title="Enter a credential" {...frame}>
        <PortalSessionEndedAlert afterSignIn={AFTER_SIGN_IN} />
      </ShellPage>
    );
  }

  if (!receipt && !cancelled && query.isError && !query.isFetching) {
    const notFound = credentialOperationErrorStatus(query.error) === 404;
    return (
      <ShellPage title="Enter a credential" {...frame}>
        <EmptyStateCard
          title={
            notFound
              ? 'This request is gone'
              : `Could not read the request on ${installation}`
          }
          description={
            notFound
              ? `It expired, was cancelled, or was started by someone else. Start again from ${startAgainFrom}, or ask the agent again.`
              : credentialOperationErrorMessage(query.error)
          }
          actions={
            <Flex gap="3" align="center">
              {!notFound ? (
                <Button variant="secondary" onPress={reload}>
                  Check again
                </Button>
              ) : null}
              {backLink}
            </Flex>
          }
        />
      </ShellPage>
    );
  }

  if (!loaded) {
    return (
      <ShellPage title="Enter a credential" {...frame}>
        <ShellPageFactsSkeleton />
      </ShellPage>
    );
  }
  const { operation } = loaded;
  if (!sameOrganization(operation, parent, name, namespace)) {
    return (
      <ShellPage title="Enter a credential" {...frame}>
        <EmptyStateCard
          title={`This request is not for ${namespace ?? name}`}
          description={
            namespace
              ? `The request writes in another namespace. Open it from ${startAgainPlace(operation, true)} or ask the agent again.`
              : `The link names ${name} in ${parent}, but the request is for ${operation.organization.organization ?? 'another organization'} in ${operation.organization.parent ?? 'another parent'}. Nothing is shown or saved: open the request from that organization's tab, or ask the agent again.`
          }
          actions={backLink}
        />
      </ShellPage>
    );
  }

  const takesValues = phase === 'values';
  const finishes = phase === 'finish';
  const complete =
    phase === 'complete' ? (receipt ?? operation.result) : undefined;
  const busy = save.isPending || cancel.isPending || query.isFetching;
  const errors = Object.fromEntries(
    pairs.map(pair => {
      const value = values[pairId(pair)];
      const google = pair.inputFormat === 'google-service-account-json';
      let error: string | undefined;
      if (!value) {
        error = google
          ? 'Choose the service account key file.'
          : 'Enter the value.';
      } else if (google) {
        error = serviceAccountKeyError(value);
      }
      return [pairId(pair), error];
    }),
  );
  const shownSaveError = ['precondition_failed', 'outcome_unknown'].includes(
    credentialOperationErrorCode(save.error) ?? '',
  )
    ? null
    : save.error;

  return (
    <ShellPage
      title="Enter a credential"
      {...frame}
      meta={[linkName, linkParent, namespace, installation]
        .filter(Boolean)
        .join(' · ')}
    >
      <Flex direction="column" gap="5">
        {notice ? (
          <Alert
            status="warning"
            title="Check the request again"
            description={notice}
          />
        ) : null}
        <Confirmation operation={operation} installation={installation} />
        {complete ? <Receipt result={complete} /> : null}
        {phase === 'cancelled' ? (
          <Alert
            status="info"
            title="Request cancelled"
            description={`Nothing was saved. Start again from ${startAgainFrom}, or ask the agent again.`}
          />
        ) : null}
        {takesValues && operation.state === 'uncertain' ? (
          <Alert
            status="warning"
            title="An earlier save of this request did not finish"
            description="Enter the value again to finish it."
          />
        ) : null}
        {finishes ? (
          <PageSection title="Finish the save">
            <Flex direction="column" gap="3" align="start">
              <Text>
                {operation.state === 'saving'
                  ? 'A save of this request is under way or was interrupted.'
                  : 'The pull request of an earlier save may not have been opened.'}{' '}
                Finishing it needs no value: agent-manager completes what it
                started.
              </Text>
              <SaveError
                installation={installation}
                error={shownSaveError}
                startAgainFrom={startAgainFrom}
                operation={loaded?.operation}
              />
              <Flex gap="3">
                <Button variant="secondary" onPress={reload} isDisabled={busy}>
                  Check again
                </Button>
                <Button
                  variant="primary"
                  onPress={() => save.mutate()}
                  isDisabled={busy}
                >
                  {save.isPending ? 'Finishing…' : 'Finish the save'}
                </Button>
              </Flex>
            </Flex>
          </PageSection>
        ) : null}
        {takesValues ? (
          <PageSection
            title={
              pairs.length > 0 &&
              pairs.every(
                pair => pair.inputFormat === 'google-service-account-json',
              )
                ? 'Upload service account credentials'
                : 'Enter the value'
            }
          >
            <Flex direction="column" gap="3" ref={scope}>
              {pairs.length === 0 ? (
                <Text color="secondary">The request asks for no value.</Text>
              ) : (
                pairs.map(pair =>
                  pair.inputFormat === 'google-service-account-json' ? (
                    <ServiceAccountKeyField
                      key={`${pairId(pair)}/${formInputRevision}`}
                      isDisabled={busy}
                      value={values[pairId(pair)] ?? ''}
                      onChange={value => {
                        if (formInputRevision !== inputRevision.current) return;
                        setValues(current => ({
                          ...current,
                          [pairId(pair)]: value,
                        }));
                      }}
                      isRequired
                      modelProject={
                        credentialProject(operation, pair) || undefined
                      }
                      description="Upload the Google service-account JSON key for this model. It is stored in the confirmed namespace and exchanged for short-lived Google tokens."
                      error={
                        values[pairId(pair)]
                          ? errors[pairId(pair)]
                          : validation.errorFor(
                              pairId(pair),
                              errors[pairId(pair)],
                            )
                      }
                    />
                  ) : (
                    <PasswordField
                      key={pairId(pair)}
                      label={
                        pairs.length === 1 ? 'Value' : `Value of ${pair.key}`
                      }
                      description={`Secret ${pair.secret}, key ${pair.key}${
                        pair.state === 'replace'
                          ? '. It replaces the current value once saved.'
                          : ''
                      }`}
                      isRequired
                      autoComplete="new-password"
                      value={values[pairId(pair)] ?? ''}
                      onChange={value =>
                        setValues(current => ({
                          ...current,
                          [pairId(pair)]: value,
                        }))
                      }
                      isDisabled={busy}
                      {...validation.textFieldProps(
                        pairId(pair),
                        errors[pairId(pair)],
                      )}
                    />
                  ),
                )
              )}
              <SaveError
                installation={installation}
                error={shownSaveError}
                startAgainFrom={startAgainFrom}
                operation={loaded?.operation}
              />
              {cancel.error instanceof PortalSessionEndedError ? (
                <PortalSessionEndedAlert afterSignIn={AFTER_SIGN_IN} />
              ) : null}
              {cancel.error &&
              !(cancel.error instanceof PortalSessionEndedError) ? (
                <Alert
                  status="danger"
                  title="Not cancelled"
                  description={credentialOperationErrorMessage(cancel.error)}
                />
              ) : null}
              <Flex gap="3" justify="end">
                <Button variant="secondary" onPress={reload} isDisabled={busy}>
                  Check again
                </Button>
                <Button
                  variant="secondary"
                  onPress={() => cancel.mutate()}
                  isDisabled={busy}
                >
                  Cancel request
                </Button>
                <Button
                  variant="primary"
                  onPress={() => {
                    if (pairs.some(pair => errors[pairId(pair)])) {
                      validation.reveal();
                      return;
                    }
                    save.mutate();
                  }}
                  isDisabled={busy || pairs.length === 0}
                >
                  {save.isPending ? 'Saving…' : 'Save'}
                </Button>
              </Flex>
            </Flex>
          </PageSection>
        ) : null}
        {stale ? (
          <SaveError
            installation={installation}
            error={save.error}
            startAgainFrom={startAgainFrom}
            operation={loaded?.operation}
          />
        ) : null}
        {stale && cancelOffered ? (
          <Flex direction="column" gap="3" align="start">
            {cancelRefused.isSuccess ? (
              <Text>The request is cancelled.</Text>
            ) : (
              <>
                <Text>
                  The request is still open until it expires. Cancel it, so that
                  it does not wait for a value.
                </Text>
                <Button
                  variant="secondary"
                  onPress={() => {
                    setCancelPressed(true);
                    cancelRefused.mutate();
                  }}
                  isDisabled={cancelRefused.isPending}
                >
                  Cancel request
                </Button>
                {cancelPressed &&
                cancelRefused.error instanceof PortalSessionEndedError ? (
                  <PortalSessionEndedAlert afterSignIn={AFTER_SIGN_IN} />
                ) : null}
                {cancelPressed &&
                cancelRefused.error &&
                !(cancelRefused.error instanceof PortalSessionEndedError) ? (
                  <Alert
                    status="danger"
                    title="Not cancelled"
                    description={credentialOperationErrorMessage(
                      cancelRefused.error,
                    )}
                  />
                ) : null}
              </>
            )}
          </Flex>
        ) : null}
        {!takesValues && !finishes && backLink ? <Flex>{backLink}</Flex> : null}
      </Flex>
    </ShellPage>
  );
}
