import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  dialogDismissLock,
  fieldErrorProps,
  MoreOptions,
  searchableIf,
  useFieldValidation,
  useSelectFieldError,
} from '@giantswarm/backstage-plugin-ui-react';

import { useBackendWrite } from '../../hooks/useModelManagerBackends';
import { useOpenGeneration } from '../../hooks/useOpenGeneration';
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
import { DIALOG_FOOTER_WRAP_STYLE, DIALOG_FORM_STYLE } from '../dialogForm';

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

/** The default name of the discovery ConfigMap, as model-manager falls back to it. */
const DEFAULT_DISCOVERY_NAME = 'agent-platform-model-serving';

/** What each field says is wrong with it; empty when the form is complete. */
export type AddBackendFieldErrors = Partial<
  Record<
    | 'installation'
    | 'kind'
    | 'endpoint'
    | 'agentEndpoint'
    | 'cluster'
    | 'apiServer'
    | 'caBundle'
    | 'servingNamespace',
    string
  >
>;

/**
 * The problems `toAddBackendInput` refuses the form for, per field — the
 * same rules, so a form with no error here is one it accepts.
 */
export function addBackendFieldErrors(
  installation: string | undefined,
  kind: BackendKind | undefined,
  form: FormState,
): AddBackendFieldErrors {
  const errors: AddBackendFieldErrors = {};
  if (!installation) {
    errors.installation = 'Pick the environment the backend registers on.';
  }
  if (!kind) {
    errors.kind = 'Pick the kind of backend.';
    return errors;
  }
  if (isHostBackendKind(kind)) {
    if (!isValidEndpoint(form.endpoint)) {
      errors.endpoint = form.endpoint.trim()
        ? 'Enter the URL as http(s)://host:port.'
        : 'Enter the URL model-manager reaches the backend at.';
    }
    if (form.agentEndpoint.trim() && !isValidEndpoint(form.agentEndpoint)) {
      errors.agentEndpoint = 'Enter the URL as http(s)://host:port.';
    }
    return errors;
  }
  if (!form.servingNamespace.trim()) {
    errors.servingNamespace = 'Enter the namespace the models are served in.';
  }
  if (form.target === 'remote') {
    if (!form.cluster.trim()) {
      errors.cluster = 'Enter the workload cluster’s name.';
    }
    if (!isValidEndpoint(form.apiServer)) {
      errors.apiServer = form.apiServer.trim()
        ? 'Enter the URL as https://host:port.'
        : 'Enter the target apiserver’s URL.';
    }
    if (!form.caBundle.trim()) {
      errors.caBundle = 'Paste the target apiserver’s CA, PEM.';
    }
  }
  return errors;
}

/** The fields under More options, which a blocked Review opens on. */
const ADVANCED_FIELDS: (keyof AddBackendFieldErrors)[] = ['agentEndpoint'];

/**
 * Add model backend — from the Serving page, the agent-creation pattern: a
 * form, then `add_backend` with `dryRun` through muster as the signed-in
 * person, the backend document it renders (the ConfigMap of the
 * runtime-registration contract) in one review, and **Deploy** (`mode:
 * apply`) or **Commit** (`mode: commit`, once model-manager offers it; today
 * it answers that it is not available yet, shown verbatim). The portal
 * composes nothing: what the review shows is exactly what model-manager
 * would write. Credentials are a Secret *reference*, never a token.
 *
 * The app's standard form: one column; the knobs whose defaults fit most
 * backends — the agent endpoint, the discovery ConfigMap, the credentials
 * Secret — under More options; Review stays pressable, and a blocked Review
 * marks each field that is wrong, under it, opens More options where one is
 * in there, and moves the focus to the first (`useFieldValidation`).
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
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const [review, setReview] = useState<AddBackendResult>();
  const [applied, setApplied] = useState<AddBackendResult>();
  const [committed, setCommitted] = useState<AddBackendResult>();
  const write = useBackendWrite(installation);
  const startAnswer = useOpenGeneration(isOpen);
  const scope = useRef<HTMLDivElement>(null);
  const validation = useFieldValidation(scope);

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
      setMoreOptionsOpen(false);
      validation.reset();
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
  const errors = addBackendFieldErrors(installation, kind, form);
  const errorFor = (field: keyof AddBackendFieldErrors) =>
    validation.errorFor(errors[field]);
  const installationError = useSelectFieldError(errorFor('installation'));
  const kindError = useSelectFieldError(
    validation.errorFor(
      kinds.length === 0 && !kind
        ? 'Every kind is registered on this environment already.'
        : errors.kind,
    ),
  );

  const notConnected = write.failure?.kind === 'not-connected';
  const isBusy = write.isBusy;
  const done = Boolean(applied || committed?.commit?.pullRequest);

  const onReview = async (event: FormEvent) => {
    event.preventDefault();
    if (isBusy) {
      return;
    }
    if (!input) {
      if (ADVANCED_FIELDS.some(field => errors[field])) {
        setMoreOptionsOpen(true);
      }
      validation.reveal();
      return;
    }
    const isCurrent = startAnswer();
    try {
      const reviewed = await write.dryRunAdd(input);
      if (isCurrent()) {
        setReview(reviewed);
      }
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

  const isHost = kind ? isHostBackendKind(kind) : false;

  // More options' one line of what it holds now.
  const moreOptionsSummary = [
    isHost && form.agentEndpoint.trim()
      ? `agent endpoint ${form.agentEndpoint.trim()}`
      : undefined,
    kind === 'kserve'
      ? `discovery ConfigMap ${
          form.discoveryNamespace.trim() || 'in the serving namespace'
        }${form.discoveryNamespace.trim() ? '/' : ', '}${
          form.discoveryName.trim() || DEFAULT_DISCOVERY_NAME
        }`
      : undefined,
    form.credentialsSecret.trim()
      ? `credentials Secret ${form.credentialsSecret.trim()}`
      : 'no credentials Secret',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Dialog
      isOpen={isOpen}
      {...dialogDismissLock(write.isWriting, onOpenChange)}
      width="min(90vw, 860px)"
    >
      {/* `noValidate`: the fields are checked by this form (`useFieldValidation`),
          not by the browser, whose own check would block the submit and try
          to focus a field folded under More options. */}
      <form onSubmit={onReview} style={DIALOG_FORM_STYLE} noValidate>
        <DialogHeader>Add model backend</DialogHeader>
        <DialogBody>
          <Flex direction="column" gap="4" ref={scope}>
            <Text variant="body-small" color="secondary">
              Register a backend you already run — Ollama, LM Studio, Lemonade
              or KServe — with the environment's model-manager, as you. Its
              models appear here, wired for agents. One backend per kind.
            </Text>

            {!review && (
              <Flex direction="column" gap="3">
                {installations.length > 1 && (
                  <div>
                    <Select
                      label="Environment"
                      isRequired
                      searchable={searchableIf(installations)}
                      options={installations.map(id => ({ id, label: id }))}
                      selectedKey={installation ?? null}
                      onSelectionChange={key => {
                        if (key) {
                          setInstallation(String(key));
                        }
                      }}
                      {...installationError.selectProps}
                    />
                    {installationError.message}
                  </div>
                )}
                <div>
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
                    {...kindError.selectProps}
                  />
                  {kindError.message}
                </div>
                {isHost && (
                  <TextField
                    label="Endpoint"
                    isRequired
                    description="The base URL as model-manager reaches it, http(s)://host:port."
                    value={form.endpoint}
                    onChange={set('endpoint')}
                    {...fieldErrorProps(errorFor('endpoint'))}
                  />
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
                          {...fieldErrorProps(errorFor('cluster'))}
                        />
                        <TextField
                          label="Organization"
                          value={form.organization}
                          onChange={set('organization')}
                        />
                        <TextField
                          label="API server"
                          isRequired
                          description="The target apiserver URL. It must trust the environment's Dex: every call presents your own token."
                          value={form.apiServer}
                          onChange={set('apiServer')}
                          {...fieldErrorProps(errorFor('apiServer'))}
                        />
                        <TextAreaField
                          label="CA bundle"
                          isRequired
                          description="The target apiserver's CA, PEM. Never credentials."
                          value={form.caBundle}
                          onChange={set('caBundle')}
                          {...fieldErrorProps(errorFor('caBundle'))}
                        />
                      </>
                    )}
                    <TextField
                      label="Serving namespace"
                      isRequired
                      description="Where the InferenceServices, download Jobs and the cache live on the target."
                      value={form.servingNamespace}
                      onChange={set('servingNamespace')}
                      {...fieldErrorProps(errorFor('servingNamespace'))}
                    />
                  </>
                )}
                {kind && (
                  <MoreOptions
                    open={moreOptionsOpen}
                    onOpenChange={setMoreOptionsOpen}
                    summary={moreOptionsSummary}
                  >
                    <Text variant="body-small" color="secondary">
                      The defaults work for most backends.
                    </Text>
                    {isHost && (
                      <TextField
                        label="Agent endpoint"
                        description="The base URL as agent pods reach it, when it differs from the endpoint."
                        value={form.agentEndpoint}
                        onChange={set('agentEndpoint')}
                        {...fieldErrorProps(errorFor('agentEndpoint'))}
                      />
                    )}
                    {kind === 'kserve' && (
                      <>
                        <TextField
                          label="Discovery ConfigMap namespace"
                          description="Where the model-serving discovery ConfigMap lives (default: the serving namespace)."
                          value={form.discoveryNamespace}
                          onChange={set('discoveryNamespace')}
                        />
                        <TextField
                          label="Discovery ConfigMap name"
                          description={`Default ${DEFAULT_DISCOVERY_NAME}.`}
                          value={form.discoveryName}
                          onChange={set('discoveryName')}
                        />
                      </>
                    )}
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
                  </MoreOptions>
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
        <DialogFooter style={DIALOG_FOOTER_WRAP_STYLE}>
          <Button
            variant="secondary"
            onPress={() => onOpenChange(false)}
            isDisabled={write.isWriting}
          >
            {done ? 'Close' : 'Cancel'}
          </Button>
          {!review && (
            <Button type="submit" variant="primary" isPending={isBusy}>
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
              <Button variant="primary" onPress={onDeploy} isDisabled={isBusy}>
                {isBusy ? 'Deploying…' : 'Deploy'}
              </Button>
            </>
          )}
        </DialogFooter>
      </form>
    </Dialog>
  );
}
