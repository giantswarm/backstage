import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@backstage/core-plugin-api';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Button, Flex, Link, PasswordField, Text } from '@backstage/ui';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';
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
  CREDENTIAL_OPERATION_PATTERN,
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
} from '../../routes';
import { ConnectAgentManagerAlert } from '../ConnectAgentManagerAlert';

export type CredentialFormPageProps = {
  installation: string;
  /** The parent namespace the organization lives in. */
  parent: string;
  /** The organization's name. */
  name: string;
  /** agent-manager's operation id, the request the form is for. */
  operation: string;
};

const pairId = (pair: { secret: string; key: string }) =>
  `${pair.secret}/${pair.key}`;

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
 * agent-manager's refusal of a replacement's save whose consumers changed
 * since it was prepared (`errConsumersChanged`). Its code, `conflict`, also
 * answers a save in progress, an uncertain outcome or an expired request,
 * where "start again" would be wrong, so its wording is matched.
 */
const CONSUMERS_CHANGED = /changed since the preparation/;

/** A replacement (`replace_organization_credential`): it writes the Secret only. */
const isReplacement = (operation: CredentialOperation) =>
  operation.result?.kind === 'credential';

const kindLabel = (kind: string) => KIND_LABELS[kind] ?? kind;

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
  const replacement = isReplacement(operation);
  return (
    <PageSection title="What you are about to save">
      <Flex direction="column" gap="3">
        <Fact label="Organization">
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
            <Text>No other object of the organization reads it.</Text>
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
              No endpoint, egress policy or connector of the organization names
              it.
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
              {operation.gitTarget?.repository ??
                'the organization’s repository'}
              {operation.gitTarget?.base
                ? ` on ${operation.gitTarget.base}`
                : ''}
              {operation.gitTarget?.directory
                ? `, in ${operation.gitTarget.directory}`
                : ''}
              , with the value encrypted.
            </Text>
          ) : (
            <Text>Live, in the organization’s namespace.</Text>
          )}
        </Fact>
      </Flex>
    </PageSection>
  );
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
          {result.note ? <Text color="secondary">{result.note}</Text> : null}
        </Flex>
      }
    />
  );
}

/** Why a save failed; a commit without the GitHub grant offers the connection. */
function SaveError({
  installation,
  error,
  replacement = false,
}: {
  installation: string;
  error: Error | null;
  /** The request is a replacement, prepared for the objects it lists. */
  replacement?: boolean;
}) {
  if (!error) {
    return null;
  }
  if (
    replacement &&
    credentialOperationErrorCode(error) === 'conflict' &&
    CONSUMERS_CHANGED.test(credentialOperationErrorMessage(error))
  ) {
    return (
      <Alert
        status="danger"
        title="The objects that use this credential changed"
        description={`Since this request was prepared, an object that uses the credential, or where it sends the value, changed, so nothing was saved. Start the replacement again from the organization's tab and check where the value goes. agent-manager answered: ${credentialOperationErrorMessage(error)}`}
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
 * Whether the operation was prepared for the organization the link names.
 * The link is not trusted for it: a link to one organization with another's
 * request would have the person enter a key for an organization they do not
 * see.
 */
function sameOrganization(
  operation: CredentialOperation,
  parent: string,
  name: string,
) {
  return (
    operation.organization.parent === parent &&
    operation.organization.organization === name
  );
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
  operation: operationParam,
}: CredentialFormPageProps) {
  const operationId = CREDENTIAL_OPERATION_PATTERN.test(operationParam)
    ? operationParam
    : undefined;
  const api = useApi(agentManagerCredentialsApiRef);
  const queryClient = useQueryClient();
  const query = useOperation(installation, operationId);
  const reload = () => {
    query.refetch();
  };
  const [values, setValues] = useState<Record<string, string>>({});
  const [receipt, setReceipt] = useState<CredentialResourceResult>();
  const [cancelled, setCancelled] = useState(false);
  const [notice, setNotice] = useState<string>();
  const scope = useRef<HTMLDivElement>(null);
  const validation = useFieldValidation(scope);

  const organizationsLink = useRouteRef(organizationsRouteRef);
  const organizationLink = useRouteRef(organizationDetailRouteRef);
  const organizationHref = organizationLink?.({ installation, parent, name });
  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Organizations', href: organizationsLink?.() },
    { label: name, href: organizationHref },
    { label: 'Enter a credential' },
  ];
  const frame = {
    breadcrumbs,
    documentTitle: ['Enter a credential', name, 'Organizations'],
  };
  const backLink = organizationHref ? (
    <Link href={organizationHref}>Back to {name}</Link>
  ) : undefined;

  const loaded = query.data;
  const pairs = loaded ? requestedPairs(loaded.operation) : [];

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
      const recovering =
        loaded.operation.state === 'saving' ||
        (loaded.operation.state === 'uncertain' &&
          loaded.operation.mode === 'commit');
      const entered = recovering
        ? []
        : pairs.map(pair => ({
            secret: pair.secret,
            key: pair.key,
            value: values[pairId(pair)] ?? '',
          }));
      return api.saveOperation(installation, operationId, loaded.etag, entered);
    },
    onSuccess: result => {
      setValues({});
      setReceipt(result);
      // The save wrote the model or connector the request was for: the
      // lists and pages that show it read it again rather than serve the
      // cache from before (the QueryClient is persisted).
      const namespace =
        result.namespace ?? loaded?.operation.organization.namespace;
      if (!namespace) {
        return undefined;
      }
      return Promise.all([
        invalidateModelReads(queryClient, installation, namespace),
        queryClient.invalidateQueries({
          queryKey: musterOrganizationConnectorsQueryKey(
            installation,
            namespace,
          ),
        }),
      ]);
    },
    onError: error => {
      const code = credentialOperationErrorCode(error);
      if (code === 'precondition_failed') {
        setValues({});
        setNotice(
          'The request changed since you opened it. Check it again, then enter the value again.',
        );
        save.reset();
        reload();
      } else if (code === 'outcome_unknown') {
        setValues({});
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
      setValues({});
      setCancelled(true);
    },
  });

  if (!operationId) {
    return (
      <ShellPage title="Enter a credential" {...frame}>
        <EmptyStateCard
          title="This link names no request"
          description={`A credential is entered for one request: from the Models or Connectors tab of ${name}, or from the link an agent sends you.`}
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

  if (query.isError && !query.isFetching) {
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
              ? 'It expired, was cancelled, or was started by someone else. Start again from the organization’s tab or ask the agent again.'
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
  if (!sameOrganization(operation, parent, name)) {
    return (
      <ShellPage title="Enter a credential" {...frame}>
        <EmptyStateCard
          title={`This request is not for ${name}`}
          description={`The link names ${name} in ${parent}, but the request is for ${operation.organization.organization ?? 'another organization'} in ${operation.organization.parent ?? 'another parent'}. Nothing is shown or saved: open the request from that organization's tab, or ask the agent again.`}
          actions={backLink}
        />
      </ShellPage>
    );
  }

  const takesValues =
    !receipt &&
    !cancelled &&
    (operation.state === 'pending' ||
      (operation.state === 'uncertain' && operation.mode === 'apply'));
  const finishes =
    !receipt &&
    !cancelled &&
    (operation.state === 'saving' ||
      (operation.state === 'uncertain' && operation.mode === 'commit'));
  const complete =
    receipt ?? (operation.state === 'complete' ? operation.result : undefined);
  const busy = save.isPending || cancel.isPending;
  const errors = Object.fromEntries(
    pairs.map(pair => [
      pairId(pair),
      values[pairId(pair)] ? undefined : 'Enter the value.',
    ]),
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
      meta={`${name} · ${parent} · ${installation}`}
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
        {cancelled || operation.state === 'cancelled' ? (
          <Alert
            status="info"
            title="Request cancelled"
            description="Nothing was saved. Start again from the organization’s tab or ask the agent again."
          />
        ) : null}
        {operation.state === 'uncertain' && operation.mode === 'apply' ? (
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
                replacement={isReplacement(operation)}
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
          <PageSection title="Enter the value">
            <Flex direction="column" gap="3" ref={scope}>
              {pairs.length === 0 ? (
                <Text color="secondary">The request asks for no value.</Text>
              ) : (
                pairs.map(pair => (
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
                ))
              )}
              <SaveError
                installation={installation}
                error={shownSaveError}
                replacement={isReplacement(operation)}
              />
              {cancel.error ? (
                <Alert
                  status="danger"
                  title="Not cancelled"
                  description={credentialOperationErrorMessage(cancel.error)}
                />
              ) : null}
              <Flex gap="3" justify="end">
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
        {!takesValues && !finishes && backLink ? <Flex>{backLink}</Flex> : null}
      </Flex>
    </ShellPage>
  );
}
