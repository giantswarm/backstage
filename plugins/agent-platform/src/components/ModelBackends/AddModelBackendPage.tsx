import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Flex,
  Select,
  Text,
  TextAreaField,
  TextField,
} from '@backstage/ui';
import {
  MoreOptions,
  searchableIf,
  useFieldValidation,
  useProvidePageHeaderActions,
  useSelectFieldError,
  WizardFrame,
  WizardStepHeading,
} from '@giantswarm/backstage-plugin-ui-react';

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
import { HOSTING_FLOW_CONTEXT } from '../ModelHostingActions';

export type AddModelBackendPageProps = {
  /** The installations that have a model-manager. */
  installations: string[];
  /** The kinds already registered (or static) per installation: one per kind. */
  registeredKinds: (installation: string) => BackendKind[];
  /** Where Close and Cancel lead: the view the flow was opened from. */
  closeHref: string;
  /** After a Deploy: the backend was written as the person. */
  onDeployed?: (installation: string, result: AddBackendResult) => void;
};

/** The flow's two steps: the form, then the dry run's review. */
const BACKEND_STEPS = [
  { id: 'form', label: 'Backend' },
  { id: 'review', label: 'Review' },
];

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
 * Add model backend (`/agent-platform/models/serving/add-backend`) — the
 * app's multi-step create pattern, `WizardFrame` with its step strip like
 * agent creation: a **Backend** step (the form), then `add_backend` with
 * `dryRun` through muster as the signed-in person, the backend document it
 * renders (the ConfigMap of the runtime-registration contract) on a
 * **Review** step, and **Deploy** (`mode:
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
export function AddModelBackendPage({
  installations,
  registeredKinds,
  closeHref,
  onDeployed,
}: AddModelBackendPageProps) {
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
  const scope = useRef<HTMLDivElement>(null);
  const validation = useFieldValidation(scope);

  useEffect(() => {
    if (!installation && installations.length > 0) {
      setInstallation(installations[0]);
    }
  }, [installation, installations]);

  // One backend per kind: a kind the installation already has is not offered.
  const kinds = useMemo(() => {
    const taken = installation ? registeredKinds(installation) : [];
    return BACKEND_KINDS.filter(candidate => !taken.includes(candidate));
  }, [installation, registeredKinds]);

  // A kind that got registered meanwhile leaves the form — unless this
  // page is what registered it: after Deploy the backends read refreshes
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
    validation.errorFor(field, errors[field]);
  const checkedField = (field: keyof AddBackendFieldErrors) =>
    validation.textFieldProps(field, errors[field]);
  const installationError = useSelectFieldError(errorFor('installation'));
  const kindError = useSelectFieldError(
    validation.errorFor(
      'kind',
      kinds.length === 0 && !kind
        ? 'Every kind is registered on this environment already.'
        : errors.kind,
    ),
  );

  const notConnected = write.failure?.kind === 'not-connected';
  const isBusy = write.isBusy;
  const done = Boolean(applied || committed?.commit?.pullRequest);

  const onReview = async () => {
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

  // The step's buttons, in the frame's footer beside its Cancel and Back.
  // The handlers are read through a ref, so the slot updates when what the
  // buttons say or allow changes, not on every keystroke.
  const handlers = useRef({ onReview, onDeploy, onCommit });
  handlers.current = { onReview, onDeploy, onCommit };
  const isCommitted = Boolean(committed);
  const actions = useMemo(() => {
    if (!review) {
      return (
        <Button
          variant="primary"
          isPending={isBusy}
          onPress={() => handlers.current.onReview()}
        >
          {isBusy ? 'Rendering…' : 'Review'}
        </Button>
      );
    }
    if (isCommitted) {
      return (
        <Button variant="primary" isDisabled>
          Committed
        </Button>
      );
    }
    if (done) {
      return null;
    }
    return (
      <>
        <Button
          variant="secondary"
          onPress={() => handlers.current.onCommit()}
          isDisabled={isBusy}
        >
          Commit
        </Button>
        <Button
          variant="primary"
          onPress={() => handlers.current.onDeploy()}
          isDisabled={isBusy}
        >
          {isBusy ? 'Deploying…' : 'Deploy'}
        </Button>
      </>
    );
  }, [review, isBusy, isCommitted, done]);
  useProvidePageHeaderActions(actions);

  return (
    <WizardFrame
      title="Add model backend"
      context={HOSTING_FLOW_CONTEXT}
      steps={BACKEND_STEPS}
      currentStep={review ? 'review' : 'form'}
      closeHref={closeHref}
      onBack={
        review && !done
          ? () => {
              if (!isBusy) {
                setReview(undefined);
              }
            }
          : undefined
      }
      width="medium"
    >
      {review ? (
        <WizardStepHeading title="Review the backend">
          This is the backend document model-manager writes as you. Deploy
          applies it now; Commit opens a pull request instead.
        </WizardStepHeading>
      ) : (
        <WizardStepHeading title="Describe the backend">
          Register a backend you already run with the environment's
          model-manager. Its models appear under Running models, wired for
          agents. Each kind registers once per environment.
        </WizardStepHeading>
      )}
      <Flex direction="column" gap="4" ref={scope}>
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
                description="Enter the base URL as model-manager reaches it, http(s)://host:port."
                value={form.endpoint}
                onChange={set('endpoint')}
                {...checkedField('endpoint')}
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
                      {...checkedField('cluster')}
                    />
                    <TextField
                      label="Organization"
                      secondaryLabel="optional"
                      value={form.organization}
                      onChange={set('organization')}
                    />
                    <TextField
                      label="API server"
                      isRequired
                      description="Enter the target apiserver URL. It must trust the environment's Dex, because every call presents your own token."
                      value={form.apiServer}
                      onChange={set('apiServer')}
                      {...checkedField('apiServer')}
                    />
                    <TextAreaField
                      label="CA bundle"
                      isRequired
                      description="Paste the target apiserver's CA as PEM, never credentials."
                      value={form.caBundle}
                      onChange={set('caBundle')}
                      {...checkedField('caBundle')}
                    />
                  </>
                )}
                <TextField
                  label="Serving namespace"
                  isRequired
                  description="Enter where the InferenceServices, download Jobs and the cache live on the target."
                  value={form.servingNamespace}
                  onChange={set('servingNamespace')}
                  {...checkedField('servingNamespace')}
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
                    secondaryLabel="optional"
                    description="Enter the base URL as agent pods reach it, if it differs from the endpoint."
                    value={form.agentEndpoint}
                    onChange={set('agentEndpoint')}
                    {...checkedField('agentEndpoint')}
                  />
                )}
                {kind === 'kserve' && (
                  <>
                    <TextField
                      label="Discovery ConfigMap namespace"
                      secondaryLabel="optional"
                      description="Enter where the model-serving discovery ConfigMap lives; the default is the serving namespace."
                      value={form.discoveryNamespace}
                      onChange={set('discoveryNamespace')}
                    />
                    <TextField
                      label="Discovery ConfigMap name"
                      secondaryLabel="optional"
                      description={`The default is ${DEFAULT_DISCOVERY_NAME}.`}
                      value={form.discoveryName}
                      onChange={set('discoveryName')}
                    />
                  </>
                )}
                <TextField
                  label="Credentials Secret"
                  secondaryLabel="optional"
                  description={
                    kind === 'kserve'
                      ? 'Enter the name of the Secret in the serving namespace that holds the Hugging Face token, never the token itself.'
                      : 'Enter the name of a Secret that holds a token, never the token itself. The host kinds present no bearer yet and refuse one.'
                  }
                  value={form.credentialsSecret}
                  onChange={set('credentialsSecret')}
                />
                {form.credentialsSecret.trim() && (
                  <TextField
                    label="Secret key"
                    secondaryLabel="optional"
                    description="The default is token."
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
              {installation}. model-manager validates it when it reads it.
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
    </WizardFrame>
  );
}
