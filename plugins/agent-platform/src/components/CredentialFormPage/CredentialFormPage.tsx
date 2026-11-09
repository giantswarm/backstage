import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Button, Flex, Link, Text } from '@backstage/ui';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';
import {
  type BreadcrumbItem,
  EmptyStateCard,
  PageSection,
  ShellPage,
  ShellPageFactsSkeleton,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  agentManagerCredentialsApiRef,
  isCredentialOperationError,
} from '../../apis';
import {
  askingObjects,
  CREDENTIAL_OPERATION_PATTERN,
  type CredentialOperation,
  type CredentialOperationRead,
  type CredentialResourceResult,
  destinations,
  otherReferences,
  requestedPairs,
} from '../../lib/credentialOperations';
import {
  organizationDetailRouteRef,
  organizationsRouteRef,
} from '../../routes';
import { ConnectAgentManagerAlert } from '../ConnectAgentManagerAlert';
import { SecretTextField } from '../ModelConfigForm/SecretTextField';

export type CredentialFormPageProps = {
  installation: string;
  /** The parent namespace the organization lives in. */
  parent: string;
  /** The organization's name. */
  name: string;
};

type Read =
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'loaded'; read: CredentialOperationRead };

const pairId = (pair: { secret: string; key: string }) =>
  `${pair.secret}/${pair.key}`;

const KIND_LABELS: Record<string, string> = {
  ModelConfig: 'Model',
  RemoteMCPServer: 'Connector',
  EgressPolicy: 'Egress policy',
};

const kindLabel = (kind: string) => KIND_LABELS[kind] ?? kind;

/**
 * The confirmation is read here, outside the plugin's query client, whose
 * cache is persisted to the browser's storage: what a person is asked to
 * confirm is read fresh for every visit and kept in this page alone.
 */
function useOperation(installation: string, operation: string | undefined) {
  const api = useApi(agentManagerCredentialsApiRef);
  const [state, setState] = useState<Read>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!operation) {
      return undefined;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    api.getOperation(installation, operation).then(
      read => !cancelled && setState({ status: 'loaded', read }),
      error => !cancelled && setState({ status: 'error', error }),
    );
    return () => {
      cancelled = true;
    };
  }, [api, installation, operation, attempt]);
  const reload = useCallback(() => setAttempt(n => n + 1), []);
  return { state, reload };
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
 * What the save writes and where the value goes: the organization, the
 * object that asked, the other objects that read the same credential, the
 * origins it is sent to, and, in commit mode, the repository the pull
 * request goes to. Shown before any value can be typed.
 */
function Confirmation({
  operation,
  name,
  parent,
  installation,
}: {
  operation: CredentialOperation;
  name: string;
  parent: string;
  installation: string;
}) {
  const asking = askingObjects(operation);
  const others = otherReferences(operation);
  const sentTo = destinations(operation);
  const provider = operation.changes
    ?.map(change => change.object?.spec?.provider)
    .find((p): p is string => typeof p === 'string');
  return (
    <PageSection title="What you are about to save">
      <Flex direction="column" gap="3">
        <Fact label="Organization">
          <Text>
            {name} · {parent} · {installation}
          </Text>
        </Fact>
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
        <Fact label="Also used by">
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
          {sentTo.length === 0 && !provider ? (
            <Text>
              No egress policy or connector of the organization names it.
            </Text>
          ) : (
            <>
              {provider ? <Text as="p">Model provider {provider}</Text> : null}
              {sentTo.map(origin => (
                <Text key={origin} as="p">
                  {origin}
                </Text>
              ))}
            </>
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
  return (
    <Alert
      status="success"
      title={pr ? 'Pull request opened' : 'Credential saved'}
      description={
        <Flex direction="column" gap="1">
          <Text>
            {result.kind
              ? `${kindLabel(result.kind)} ${result.name ?? ''}`
              : 'The object'}{' '}
            {pr
              ? 'and its encrypted credential are in the pull request. They apply once it merges.'
              : 'has its credential. The value is not shown again.'}
          </Text>
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
}: {
  installation: string;
  error: Error | undefined;
}) {
  if (!error) {
    return null;
  }
  if (isCredentialOperationError(error) && error.code === 'auth_required') {
    return (
      <ConnectAgentManagerAlert
        installation={installation}
        message={error.message}
        action="The pull request is opened"
        needsGitHub
      />
    );
  }
  return (
    <Alert status="danger" title="Not saved" description={error.message} />
  );
}

/**
 * The Dev Portal's credential form of one organization: opened from the
 * Models, Connectors or Egress tab, or from the link an agent or a tool sends
 * (agent-manager's URL elicitation), with the operation's id as `?operation=`.
 * It reads the operation's confirmation before any value can be typed,
 * posts the values once with the confirmation's version, and never shows a
 * value back.
 */
export function CredentialFormPage({
  installation,
  parent,
  name,
}: CredentialFormPageProps) {
  const [params] = useSearchParams();
  const raw = params.get('operation') ?? '';
  const operationId = CREDENTIAL_OPERATION_PATTERN.test(raw) ? raw : undefined;
  const api = useApi(agentManagerCredentialsApiRef);
  const { state, reload } = useOperation(installation, operationId);
  const [values, setValues] = useState<Record<string, string>>({});
  const [receipt, setReceipt] = useState<CredentialResourceResult>();
  const [cancelled, setCancelled] = useState(false);
  const [notice, setNotice] = useState<string>();

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

  const loaded = state.status === 'loaded' ? state.read : undefined;
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
      const entered = pairs.map(pair => ({
        secret: pair.secret,
        key: pair.key,
        value: values[pairId(pair)] ?? '',
      }));
      return api.saveOperation(installation, operationId, loaded.etag, entered);
    },
    onSettled: () => setValues({}),
    onSuccess: result => setReceipt(result),
    onError: error => {
      if (
        isCredentialOperationError(error) &&
        error.code === 'precondition_failed'
      ) {
        setNotice(
          'The request changed since you opened it. Check it again, then enter the value again.',
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
          title="Open this form from a request"
          description={`A credential is entered for one request: from the Models, Connectors or Egress tab of ${name}, or from the link an agent sends you. This address names no request.`}
          actions={backLink}
        />
      </ShellPage>
    );
  }

  if (state.status === 'loading') {
    return (
      <ShellPage title="Enter a credential" {...frame}>
        <ShellPageFactsSkeleton />
      </ShellPage>
    );
  }

  if (state.status === 'error') {
    const notFound =
      isCredentialOperationError(state.error) && state.error.status === 404;
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
              : state.error.message
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

  const { operation } = state.read;
  const pending = operation.state === 'pending' && !receipt && !cancelled;
  const complete =
    receipt ?? (operation.state === 'complete' ? operation.result : undefined);
  const missing = pairs.some(pair => !values[pairId(pair)]);
  const saveError =
    save.error &&
    !(
      isCredentialOperationError(save.error) &&
      save.error.code === 'precondition_failed'
    )
      ? save.error
      : undefined;

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
        <Confirmation
          operation={operation}
          name={name}
          parent={parent}
          installation={installation}
        />
        {complete ? <Receipt result={complete} /> : null}
        {cancelled || operation.state === 'cancelled' ? (
          <Alert
            status="info"
            title="Request cancelled"
            description="Nothing was saved. Start again from the organization’s tab or ask the agent again."
          />
        ) : null}
        {operation.state === 'saving' || operation.state === 'uncertain' ? (
          <Alert
            status="warning"
            title="A save of this request is in progress or its outcome is unknown"
            description="Check again in a moment before you enter anything."
          />
        ) : null}
        {pending ? (
          <PageSection title="Enter the value">
            <Flex direction="column" gap="3">
              {pairs.length === 0 ? (
                <Text color="secondary">The request asks for no value.</Text>
              ) : (
                pairs.map(pair => (
                  <SecretTextField
                    key={pairId(pair)}
                    label={
                      pairs.length === 1 ? 'Value' : `Value of ${pair.key}`
                    }
                    description={`Secret ${pair.secret}, key ${pair.key}${pair.state === 'replace' ? ' (replaces the current value)' : ''}`}
                    value={values[pairId(pair)] ?? ''}
                    onChange={value =>
                      setValues(current => ({
                        ...current,
                        [pairId(pair)]: value,
                      }))
                    }
                    isDisabled={save.isPending || cancel.isPending}
                  />
                ))
              )}
              <SaveError installation={installation} error={saveError} />
              {cancel.error ? (
                <Alert
                  status="danger"
                  title="Not cancelled"
                  description={cancel.error.message}
                />
              ) : null}
              <Flex gap="3" justify="end">
                <Button
                  variant="secondary"
                  onPress={() => cancel.mutate()}
                  isDisabled={save.isPending || cancel.isPending}
                >
                  Cancel request
                </Button>
                <Button
                  variant="primary"
                  onPress={() => save.mutate()}
                  isDisabled={
                    pairs.length === 0 ||
                    missing ||
                    save.isPending ||
                    cancel.isPending
                  }
                >
                  {save.isPending ? 'Saving…' : 'Save'}
                </Button>
              </Flex>
            </Flex>
          </PageSection>
        ) : null}
        {!pending && backLink ? <Flex>{backLink}</Flex> : null}
      </Flex>
    </ShellPage>
  );
}
