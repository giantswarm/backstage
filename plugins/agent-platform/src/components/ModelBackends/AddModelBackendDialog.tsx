import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  Select,
  Text,
  TextAreaField,
  TextField,
} from '@backstage/ui';

import { useBackendWrite } from '../../hooks/useModelManagerBackends';
import {
  BACKEND_KIND_LABEL,
  BACKEND_KINDS,
  isHostBackendKind,
  isValidEndpoint,
  MODEL_MANAGER_SERVER,
  type AddBackendInput,
  type AddBackendResult,
  type BackendKind,
} from '../../lib/modelManagerBackends';
import { CodeBlock } from '../CodeBlock';
import { CommitOutcome } from '../CommitOutcome';
import { ConnectAgentManagerAlert } from '../ConnectAgentManagerAlert';
import { DIALOG_FORM_STYLE } from '../dialogForm';

export type AddModelBackendDialogProps = {
  /** The installations that have a model-manager. */
  installations: string[];
  /** The kinds already registered (or static) per installation: one per kind. */
  registeredKinds: (installation: string) => BackendKind[];
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** After a Deploy: the backend was written as the person. */
  onDeployed?: (installation: string, result: AddBackendResult) => void;
};

type LocalChoice = 'local' | 'remote';

/**
 * What the form holds, whatever the kind: switching the kind keeps the
 * values; `addBackendArgs` sends the kind's own fields only.
 */
type FormState = {
  endpoint: string;
  agentEndpoint: string;
  credentialsSecret: string;
  credentialsKey: string;
  target: LocalChoice;
  cluster: string;
  organization: string;
  apiServer: string;
  caBundle: string;
  servingNamespace: string;
  discoveryNamespace: string;
  discoveryName: string;
};

const EMPTY_FORM: FormState = {
  endpoint: '',
  agentEndpoint: '',
  credentialsSecret: '',
  credentialsKey: '',
  target: 'local',
  cluster: '',
  organization: '',
  apiServer: '',
  caBundle: '',
  servingNamespace: '',
  discoveryNamespace: '',
  discoveryName: '',
};

/** The `add_backend` input the form describes, or `undefined` while incomplete. */
export function toAddBackendInput(
  kind: BackendKind,
  form: FormState,
): AddBackendInput | undefined {
  const credentials = form.credentialsSecret.trim()
    ? {
        credentialsSecret: form.credentialsSecret,
        credentialsKey: form.credentialsKey,
      }
    : {};
  if (isHostBackendKind(kind)) {
    if (!isValidEndpoint(form.endpoint)) {
      return undefined;
    }
    if (form.agentEndpoint.trim() && !isValidEndpoint(form.agentEndpoint)) {
      return undefined;
    }
    return {
      kind,
      endpoint: form.endpoint,
      agentEndpoint: form.agentEndpoint,
      ...credentials,
    };
  }
  if (!form.servingNamespace.trim()) {
    return undefined;
  }
  if (form.target === 'remote') {
    if (
      !form.cluster.trim() ||
      !isValidEndpoint(form.apiServer) ||
      !form.caBundle.trim()
    ) {
      return undefined;
    }
    return {
      kind,
      cluster: form.cluster,
      organization: form.organization,
      apiServer: form.apiServer,
      caBundle: form.caBundle,
      servingNamespace: form.servingNamespace,
      discoveryNamespace: form.discoveryNamespace,
      discoveryName: form.discoveryName,
      ...credentials,
    };
  }
  return {
    kind,
    cluster: 'local',
    servingNamespace: form.servingNamespace,
    discoveryNamespace: form.discoveryNamespace,
    discoveryName: form.discoveryName,
    ...credentials,
  };
}

/**
 * Add model backend — from the Serving page, the agent-creation pattern: a
 * form, then `add_backend` with `dryRun` through muster as the signed-in
 * person, the backend document it renders (the ConfigMap of the
 * runtime-registration contract) in one review, and **Deploy** (`mode:
 * apply`) or **Commit** (`mode: commit`, once model-manager offers it; today
 * it answers that it is not available yet, shown verbatim). The portal
 * composes nothing: what the review shows is exactly what model-manager
 * would write. Credentials are a Secret *reference*, never a token.
 */
export function AddModelBackendDialog({
  installations,
  registeredKinds,
  isOpen,
  onOpenChange,
  onDeployed,
}: AddModelBackendDialogProps) {
  const [installation, setInstallation] = useState<string | undefined>(
    installations[0],
  );
  const [kind, setKind] = useState<BackendKind | undefined>();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [review, setReview] = useState<AddBackendResult>();
  const [applied, setApplied] = useState<AddBackendResult>();
  const [committed, setCommitted] = useState<AddBackendResult>();
  const write = useBackendWrite(installation);

  useEffect(() => {
    if (!installation && installations.length > 0) {
      setInstallation(installations[0]);
    }
  }, [installation, installations]);

  useEffect(() => {
    if (!isOpen) {
      setReview(undefined);
      setApplied(undefined);
      setCommitted(undefined);
      write.reset();
    }
    // `write` changes identity every render; reset once per close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // One backend per kind: a kind the installation already has is not offered.
  const kinds = useMemo(() => {
    const taken = installation ? registeredKinds(installation) : [];
    return BACKEND_KINDS.filter(candidate => !taken.includes(candidate));
  }, [installation, registeredKinds]);

  // A kind that got registered meanwhile leaves the form — unless this
  // dialog is what registered it: after Deploy the backends read refreshes
  // and drops the kind, and the outcome must stay on screen.
  useEffect(() => {
    if (kind && !kinds.includes(kind) && !review && !applied) {
      setKind(undefined);
    }
  }, [kind, kinds, review, applied]);

  const set =
    <K extends keyof FormState>(key: K) =>
    (value: FormState[K]) =>
      setForm(current => ({ ...current, [key]: value }));

  const input = useMemo(
    () => (kind ? toAddBackendInput(kind, form) : undefined),
    [kind, form],
  );

  const notConnected = write.failure?.kind === 'not-connected';
  const isBusy = write.isBusy;
  const done = Boolean(applied || committed?.pullRequestUrl);

  const onReview = async (event: FormEvent) => {
    event.preventDefault();
    if (!input) {
      return;
    }
    try {
      setReview(await write.dryRunAdd(input));
    } catch {
      // Shown from `write.failure`.
    }
  };

  const onDeploy = async () => {
    if (!input || !installation) {
      return;
    }
    try {
      const result = await write.add(input, 'apply');
      setApplied(result);
      onDeployed?.(installation, result);
    } catch {
      // Shown from `write.failure`.
    }
  };

  const onCommit = async () => {
    if (!input) {
      return;
    }
    try {
      setCommitted(await write.add(input, 'commit'));
    } catch {
      // model-manager answers that commit is not available yet; shown verbatim.
    }
  };

  const close = (next: boolean) => {
    if (!isBusy) {
      onOpenChange(next);
    }
  };

  const isHost = kind ? isHostBackendKind(kind) : false;
  const endpointInvalid =
    form.endpoint.length > 0 && !isValidEndpoint(form.endpoint);
  const agentEndpointInvalid =
    form.agentEndpoint.length > 0 && !isValidEndpoint(form.agentEndpoint);
  const apiServerInvalid =
    form.apiServer.length > 0 && !isValidEndpoint(form.apiServer);

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={close}
      isDismissable={!isBusy}
      isKeyboardDismissDisabled={isBusy}
      width="min(90vw, 860px)"
    >
      <form onSubmit={onReview} style={DIALOG_FORM_STYLE}>
        <DialogHeader>Add model backend</DialogHeader>
        <DialogBody>
          <Flex direction="column" gap="4">
            <Text variant="body-small" color="secondary">
              A backend you already run — an Ollama, LM Studio or Lemonade host,
              or a KServe cluster — registered with the installation's
              model-manager as you. Its models appear on this page and their
              model configs are wired for agents. One backend per kind.
            </Text>

            {!review && (
              <Flex direction="column" gap="3">
                {installations.length > 1 && (
                  <Select
                    label="Installation"
                    isRequired
                    options={installations.map(id => ({ id, label: id }))}
                    selectedKey={installation ?? null}
                    onSelectionChange={key => {
                      if (key) {
                        setInstallation(String(key));
                      }
                    }}
                  />
                )}
                <Select
                  label="Kind"
                  isRequired
                  placeholder={
                    kinds.length === 0
                      ? 'Every kind is registered already'
                      : 'Pick a backend kind'
                  }
                  options={kinds.map(id => ({
                    id,
                    label: BACKEND_KIND_LABEL[id],
                  }))}
                  selectedKey={kind ?? null}
                  onSelectionChange={key =>
                    setKind(key ? (String(key) as BackendKind) : undefined)
                  }
                />
                {isHost && (
                  <>
                    <TextField
                      label="Endpoint"
                      isRequired
                      description="The base URL as model-manager reaches it, http(s)://host:port."
                      value={form.endpoint}
                      onChange={set('endpoint')}
                      isInvalid={endpointInvalid}
                    />
                    <TextField
                      label="Agent endpoint"
                      description="The base URL as agent pods reach it, when it differs from the endpoint."
                      value={form.agentEndpoint}
                      onChange={set('agentEndpoint')}
                      isInvalid={agentEndpointInvalid}
                    />
                  </>
                )}
                {kind === 'kserve' && (
                  <>
                    <Select
                      label="Target cluster"
                      options={[
                        {
                          id: 'local',
                          label: 'This cluster (the one model-manager runs on)',
                        },
                        { id: 'remote', label: 'A workload cluster' },
                      ]}
                      selectedKey={form.target}
                      onSelectionChange={key =>
                        key && set('target')(key as LocalChoice)
                      }
                    />
                    {form.target === 'remote' && (
                      <>
                        <TextField
                          label="Cluster"
                          isRequired
                          value={form.cluster}
                          onChange={set('cluster')}
                        />
                        <TextField
                          label="Organization"
                          value={form.organization}
                          onChange={set('organization')}
                        />
                        <TextField
                          label="API server"
                          isRequired
                          description="The target apiserver URL. It must trust the installation's Dex: every call presents your own token."
                          value={form.apiServer}
                          onChange={set('apiServer')}
                          isInvalid={apiServerInvalid}
                        />
                        <TextAreaField
                          label="CA bundle"
                          isRequired
                          description="The target apiserver's CA, PEM. Never credentials."
                          value={form.caBundle}
                          onChange={set('caBundle')}
                        />
                      </>
                    )}
                    <TextField
                      label="Serving namespace"
                      isRequired
                      description="Where the InferenceServices, download Jobs and the cache live on the target."
                      value={form.servingNamespace}
                      onChange={set('servingNamespace')}
                    />
                    <TextField
                      label="Discovery ConfigMap namespace"
                      description="Where the model-serving discovery ConfigMap lives (default: the serving namespace)."
                      value={form.discoveryNamespace}
                      onChange={set('discoveryNamespace')}
                    />
                    <TextField
                      label="Discovery ConfigMap name"
                      description="Default agent-platform-model-serving."
                      value={form.discoveryName}
                      onChange={set('discoveryName')}
                    />
                  </>
                )}
                {kind && (
                  <>
                    <TextField
                      label="Credentials Secret"
                      description={
                        kind === 'kserve'
                          ? 'A Secret in the serving namespace holding the Hugging Face token — its name, never the token.'
                          : 'A Secret holding a token — its name, never the token. The host kinds present no bearer yet and refuse one.'
                      }
                      value={form.credentialsSecret}
                      onChange={set('credentialsSecret')}
                    />
                    {form.credentialsSecret.trim() && (
                      <TextField
                        label="Secret key"
                        description="Default token."
                        value={form.credentialsKey}
                        onChange={set('credentialsKey')}
                      />
                    )}
                  </>
                )}
              </Flex>
            )}

            {review && (
              <Flex direction="column" gap="3" data-testid="backend-review">
                <Text variant="body-medium">
                  ConfigMap {review.configMap.namespace}/{review.configMap.name}
                  {' on '}
                  {installation}: the backend document model-manager writes as
                  you and validates when it reads it.
                </Text>
                <CodeBlock
                  filename={`${review.configMap.name}.yaml`}
                  content={review.document}
                  language="yaml"
                />
              </Flex>
            )}

            {write.failure && !notConnected && (
              <Alert
                status="danger"
                title="model-manager refused"
                description={write.failure.message}
              />
            )}
            {notConnected && installation && (
              <ConnectAgentManagerAlert
                installation={installation}
                message={write.failure!.message}
                action="Model backends are registered"
                server={MODEL_MANAGER_SERVER}
              />
            )}
            {applied && (
              <Alert
                status="success"
                title={`${
                  applied.created === false ? 'Replaced' : 'Registered'
                } ${applied.configMap.name} as you`}
                description={
                  applied.registered === false
                    ? 'model-manager has not picked the document up yet; the group appears once it does.'
                    : 'model-manager loaded it. Its models appear on this page as it reads them.'
                }
              />
            )}
            {committed && <CommitOutcome result={committed} />}
          </Flex>
        </DialogBody>
        <DialogFooter>
          <Flex gap="2" justify="end">
            <Button
              variant="secondary"
              onPress={() => close(false)}
              isDisabled={isBusy}
            >
              {done ? 'Close' : 'Cancel'}
            </Button>
            {!review && (
              <Button
                type="submit"
                variant="primary"
                isDisabled={!input || isBusy}
              >
                {isBusy ? 'Rendering…' : 'Review'}
              </Button>
            )}
            {review && !done && (
              <>
                <Button
                  variant="secondary"
                  onPress={() => setReview(undefined)}
                  isDisabled={isBusy}
                >
                  Back
                </Button>
                <Button
                  variant="secondary"
                  onPress={onCommit}
                  isDisabled={isBusy}
                >
                  Commit
                </Button>
                <Button
                  variant="primary"
                  onPress={onDeploy}
                  isDisabled={isBusy}
                >
                  {isBusy ? 'Deploying…' : 'Deploy'}
                </Button>
              </>
            )}
          </Flex>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
