import { useEffect, useMemo, useRef, useState } from 'react';
import { toastApiRef, useApi } from '@backstage/frontend-plugin-api';
import { Alert, Button, Flex, Select, Switch, TextField } from '@backstage/ui';
import {
  fieldErrorProps,
  searchableIf,
  useFieldValidation,
  useProvidePageHeaderActions,
  useSelectFieldError,
  WizardFrame,
  WizardStepHeading,
} from '@giantswarm/backstage-plugin-ui-react';

import { usePullModel } from '../../hooks/usePullJobs';
import { validateModelRef } from '../../lib/modelManagerServing';
import type { ServingBackend } from '../../lib/serving';
import { HOSTING_FLOW_CONTEXT } from '../ModelHostingActions';
import { BACKEND_LABEL } from '../ServingPage/ServedModelsGroupHeader';

/** Long enough to read two lines, short enough not to follow you around. */
const TOAST_TIMEOUT_MS = 6000;

/**
 * A backend the dialog can pull on — an installation's, named where the
 * installation runs several behind one model-manager — and whether it wires.
 */
export type PullTarget = {
  /** The installation. */
  name: string;
  /**
   * The backend on it, when the installation names its backends
   * (model-manager 0.17 on); the request then carries it. Absent on an
   * installation with one backend (an older model-manager).
   */
  backend?: ServingBackend;
  /** The backend creates kagent ModelConfigs (`wire` capability). */
  canWire: boolean;
};

/** The select key of a target: installation, plus the backend where named. */
export function pullTargetKey(
  target: Pick<PullTarget, 'name' | 'backend'>,
): string {
  return target.backend ? `${target.name}/${target.backend}` : target.name;
}

/** How a target reads in the select and the toasts: `lab · Lemonade`, or just the installation. */
export function describePullTarget(
  target: Pick<PullTarget, 'name' | 'backend'>,
): string {
  return target.backend
    ? `${target.name} · ${BACKEND_LABEL[target.backend]}`
    : target.name;
}

export type PullModelPageProps = {
  /** Installations whose backend reports the `pull` capability. */
  targets: PullTarget[];
  /** Where Close and Cancel lead: the view the flow was opened from. */
  closeHref: string;
  /** The pull was accepted (a toast says where to follow it). */
  onPulled?: () => void;
};

/**
 * Asks for a model reference and starts its import.
 *
 * Nothing here waits for the download: model-manager answers with a job at
 * once and the served-model list follows its progress, so the page hands
 * over on acceptance (`onPulled`) and a toast says where to look. A reference that the backend proxy would
 * refuse is caught before it is sent (same rule, kinder message), and a pull
 * of a reference that is already downloading is joined by model-manager, not
 * duplicated — the panel shows one job either way.
 *
 * A page of its own (`/agent-platform/models/serving/pull`), the app's
 * single-step create pattern (`WizardFrame`): a failed request stays on it,
 * saying so. The app's standard form: Pull stays
 * pressable, and a blocked Pull marks the field that is wrong, under it, and
 * moves the focus there (`useFieldValidation`).
 */
export function PullModelPage({
  targets,
  closeHref,
  onPulled,
}: PullModelPageProps) {
  const toastApi = useApi(toastApiRef);
  const [targetKey, setTargetKey] = useState(
    targets[0] ? pullTargetKey(targets[0]) : '',
  );
  const [model, setModel] = useState('');
  const [wire, setWire] = useState(true);
  const scope = useRef<HTMLDivElement>(null);
  const validation = useFieldValidation(scope);

  // A target list that changes under the open page (an installation became
  // unreachable) must not leave the select pointing at nothing.
  useEffect(() => {
    if (!targets.some(target => pullTargetKey(target) === targetKey)) {
      setTargetKey(targets[0] ? pullTargetKey(targets[0]) : '');
    }
  }, [targets, targetKey]);

  const target = useMemo(
    () => targets.find(candidate => pullTargetKey(candidate) === targetKey),
    [targets, targetKey],
  );
  const installation = target?.name ?? '';
  const pull = usePullModel(installation);

  const errors = {
    target: target ? undefined : 'Pick where the model is pulled.',
    model: validateModelRef(model),
  };
  const targetError = useSelectFieldError(validation.errorFor(errors.target));

  const submit = async () => {
    if (errors.target || errors.model) {
      validation.reveal();
      return;
    }

    const reference = model.trim();
    let result: Awaited<ReturnType<typeof pull.mutateAsync>>;
    try {
      result = await pull.mutateAsync({
        model: reference,
        ...(target?.backend ? { backend: target.backend } : {}),
        ...(target?.canWire ? { wire } : {}),
      });
    } catch {
      // Left to the page, which renders `pull.error`.
      return;
    }

    const where = target ? describePullTarget(target) : installation;
    toastApi.post({
      title: result.created
        ? `Pulling ${reference} on ${where}`
        : `${reference} is already being pulled on ${where}`,
      description: 'Its progress shows in its row among the served models.',
      status: 'info',
      timeout: TOAST_TIMEOUT_MS,
    });
    onPulled?.();
  };

  const isBusy = pull.isPending;

  // Pull in the frame's footer, beside its Cancel. Read through a ref, so the
  // slot updates when what the button says changes, not on every keystroke.
  const submitRef = useRef(submit);
  submitRef.current = submit;
  const actions = useMemo(
    () => (
      <Button
        variant="primary"
        isPending={isBusy}
        onPress={() => submitRef.current()}
      >
        {isBusy ? 'Starting…' : 'Pull'}
      </Button>
    ),
    [isBusy],
  );
  useProvidePageHeaderActions(actions);

  return (
    <WizardFrame
      title="Pull model"
      context={HOSTING_FLOW_CONTEXT}
      closeHref={closeHref}
      width="medium"
    >
      <WizardStepHeading title="Name the model">
        The model downloads onto the environment's serving backend. Give a
        registry tag such as <code>qwen2.5:0.5b</code> or a Hugging Face GGUF
        reference such as <code>hf.co/org/repo:Q4_K_M</code>.
      </WizardStepHeading>
      <Flex direction="column" gap="4" ref={scope}>
        {targets.length > 1 && (
          <Select
            label={
              targets.some(candidate => candidate.backend)
                ? 'Environment and backend'
                : 'Environment'
            }
            isRequired
            isDisabled={isBusy}
            searchable={searchableIf(targets)}
            options={targets.map(candidate => ({
              id: pullTargetKey(candidate),
              label: describePullTarget(candidate),
            }))}
            selectedKey={targetKey}
            onSelectionChange={key => {
              if (key) {
                setTargetKey(String(key));
              }
            }}
            {...targetError.selectProps}
          />
        )}
        {targets.length > 1 && targetError.message}

        <TextField
          label="Model reference"
          isRequired
          isDisabled={isBusy}
          value={model}
          onChange={setModel}
          placeholder="e.g. qwen2.5:0.5b"
          description="Agents need a model with tool calling; the list shows each model's features once it is downloaded."
          {...fieldErrorProps(validation.errorFor(errors.model))}
        />

        {target?.canWire && (
          <Switch
            label="Create a model config when the download finishes, so agents can use the model"
            isDisabled={isBusy}
            isSelected={wire}
            onChange={setWire}
          />
        )}

        {pull.error ? (
          <Alert status="danger" description={pull.error.message} />
        ) : null}
      </Flex>
    </WizardFrame>
  );
}
