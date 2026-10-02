import { useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '@backstage/frontend-plugin-api';
import {
  Alert,
  Button,
  Checkbox,
  CheckboxGroup,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  Radio,
  RadioGroup,
  Select,
  Text,
} from '@backstage/ui';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';
import { modelManagerApiRef } from '../../apis';
import { useModelManagerToolsClient } from '../../hooks/useModelManagerBackends';
import { useInvalidateModelManagerReads } from '../../hooks/useServedModelAction';
import type {
  ModelManagerLoadAnswer,
  ModelManagerPlacement,
  ModelManagerPreset,
} from '../../lib/modelManager';
import {
  describeFitVerdict,
  describeServedWhere,
  isModelImagePreset,
  nodeCandidates,
  nodeChoices,
  placementChoices,
  servedPresetRow,
  servesPresetOn,
} from '../../lib/modelManagerServe';
import { formatBytes } from '../../lib/modelManagerServing';
import {
  modelManagerFitQueryKey,
  modelManagerNodesQueryKey,
  modelManagerPresetsQueryKey,
} from '../../lib/queryKeys';
import type {
  ServedModel,
  ServingBackend,
  ServingCapabilities,
} from '../../lib/serving';
import { BACKEND_LABEL } from '../ServingPage/ServedModelsGroupHeader';

/** Where a model can be served: an installation's backend that can `load`. */
export type LoadTarget = {
  name: string;
  backend?: ServingBackend;
  capabilities: ServingCapabilities;
};

export function loadTargetKey(
  target: Pick<LoadTarget, 'name' | 'backend'>,
): string {
  return target.backend ? `${target.name}/${target.backend}` : target.name;
}

export function describeLoadTarget(
  target: Pick<LoadTarget, 'name' | 'backend'>,
): string {
  return target.backend
    ? `${target.name} · ${BACKEND_LABEL[target.backend]}`
    : target.name;
}

/**
 * What the dialog opens on: the pool panel's link (installation, cluster and
 * pool), or a row's "Serve…" (installation, backend and the model).
 */
export type LoadModelSeed = {
  installation?: string;
  backend?: ServingBackend;
  /** The preset name on kserve, the model reference on a host backend. */
  model?: string;
  cluster?: string;
  pool?: string;
};

export type LoadModelDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  targets: LoadTarget[];
  /** The installations' models: the cached, not yet serving ones are what a host backend can load. */
  models: ServedModel[];
  seed?: LoadModelSeed;
  /** The load was accepted: the dialog has closed, the answer is model-manager's. */
  onServed?: (target: LoadTarget, answer: ModelManagerLoadAnswer) => void;
};

type Choice = {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
  /** Where the preset serves already (`Serving on gpu-a`); such a choice is disabled. */
  served?: string;
};

function presetChoice(
  preset: ModelManagerPreset,
  served: ServedModel | undefined,
): Choice {
  const facts = [
    preset.model,
    preset.weightsBytes !== undefined
      ? `${formatBytes(preset.weightsBytes)} of weights`
      : undefined,
    preset.gpus !== undefined
      ? `${preset.gpus} GPU${preset.gpus === 1 ? '' : 's'}`
      : undefined,
  ].filter(Boolean);
  const where = served ? describeServedWhere(served) : undefined;
  return {
    id: preset.name,
    label: preset.displayName ?? preset.name,
    description: [where, preset.description, facts.join(' · ')]
      .filter(Boolean)
      .join(' — '),
    ...(where ? { disabled: true, served: where } : {}),
  };
}

function cachedModelChoice(model: ServedModel): Choice {
  return {
    id: model.name,
    label: model.displayName ?? model.name,
    description:
      model.sizeBytes !== undefined ? formatBytes(model.sizeBytes) : undefined,
  };
}

/** The choice field's placeholder while the presets load or when nothing can be chosen. */
function choicePlaceholder(
  usesPresets: boolean,
  presetsPending: boolean,
  noChoice: boolean,
): string | undefined {
  if (usesPresets && presetsPending) {
    return 'Reading the presets…';
  }
  if (!noChoice) {
    return undefined;
  }
  return usesPresets
    ? 'No preset is published for this cluster'
    : 'No cached model waits to be served';
}

function targetForSeed(
  targets: LoadTarget[],
  seed: LoadModelSeed | undefined,
): LoadTarget | undefined {
  if (seed?.installation) {
    const onInstallation = targets.filter(
      target => target.name === seed.installation,
    );
    return (
      onInstallation.find(target =>
        seed.backend
          ? target.backend === seed.backend
          : // A pool link means the GPU backend: the one with presets.
            !seed.pool || target.capabilities.presets,
      ) ?? onInstallation[0]
    );
  }
  return targets[0];
}

/**
 * Serves a model through model-manager as the signed-in person. On a GPU
 * pool (kserve) the choice is one of the presets model-manager publishes for
 * the cluster and `check_fit`'s verdict stands before the button — whether it
 * fits, the instance type the node comes as, whether the weights are cached,
 * or why not; a preset no size of the pool hosts cannot be served. Where
 * model-manager recommends a placement, the person chooses it — split across
 * fast-linked nodes or one copy — the recommendation preselected and the
 * verdict the chosen placement's. A copy goes on any node that fits, or one
 * copy on each node the person ticks in the node inventory — each node
 * judged by its own `check_fit`, the ones the preset cannot land on listed
 * disabled with the reason. One tick is sent as `node`, the hostname pin;
 * several as `placement: copies` with the `nodes`, judged together by one
 * more `check_fit` ("Fits as 4 copies"). On a host
 * backend the choice is a cached model. Serve is one `load_model` over
 * muster: model-manager composes the serving object (an `LLMInferenceService`
 * on a pool) and answers with what it created, the fit it judged by and the
 * first step of the timeline — nothing is composed here.
 *
 * Controlled like the other dialogs here: confirming does not close it, so a
 * refused load has somewhere to say so.
 */
export function LoadModelDialog({
  isOpen,
  onOpenChange,
  targets,
  models,
  seed,
  onServed,
}: LoadModelDialogProps) {
  const modelManagerApi = useApi(modelManagerApiRef);
  const [targetKey, setTargetKey] = useState('');
  const [model, setModel] = useState('');

  // Opening seeds the target and the model, and so does a new seed or a
  // change in which targets exist; a refetch that returns the same targets
  // (the served list polls) keeps the person's choice. A target that went
  // away falls back to the first.
  const targetKeys = targets.map(loadTargetKey).join('\n');
  const targetsRef = useRef(targets);
  targetsRef.current = targets;
  useEffect(() => {
    if (isOpen) {
      const seeded = targetForSeed(targetsRef.current, seed);
      setTargetKey(seeded ? loadTargetKey(seeded) : '');
      setModel(seed?.model ?? '');
    }
  }, [isOpen, seed, targetKeys]);
  useEffect(() => {
    if (targetKey && !targets.some(t => loadTargetKey(t) === targetKey)) {
      setTargetKey(targets[0] ? loadTargetKey(targets[0]) : '');
    }
  }, [targets, targetKey]);

  const target = useMemo(
    () => targets.find(candidate => loadTargetKey(candidate) === targetKey),
    [targets, targetKey],
  );
  const installation = target?.name ?? seed?.installation ?? '';
  const backend = target?.backend;
  const usesPresets = Boolean(target?.capabilities.presets);
  const client = useModelManagerToolsClient(installation || undefined);
  const invalidate = useInvalidateModelManagerReads(installation);

  const presets = useQuery({
    queryKey: modelManagerPresetsQueryKey(installation, backend),
    queryFn: () =>
      modelManagerApi.listPresets(installation, backend ? { backend } : {}),
    enabled: isOpen && Boolean(target) && usesPresets,
    staleTime: 60_000,
  });

  const choices = useMemo<Choice[]>(() => {
    if (!target) {
      return [];
    }
    if (usesPresets) {
      return (presets.data ?? []).map(preset =>
        presetChoice(
          preset,
          servedPresetRow(models, target.name, target.backend, preset.name),
        ),
      );
    }
    return models
      .filter(
        candidate =>
          candidate.installation === target.name &&
          (!target.backend || candidate.backend === target.backend) &&
          candidate.downloaded !== false &&
          candidate.loaded !== true,
      )
      .map(cachedModelChoice);
  }, [target, usesPresets, presets.data, models]);

  // The first servable choice stands in for none; a seeded name the list
  // does not carry gives way to it too. A seeded preset that serves already
  // stays chosen, so the dialog can say where.
  useEffect(() => {
    if (choices.length > 0 && !choices.some(choice => choice.id === model)) {
      setModel((choices.find(choice => !choice.disabled) ?? choices[0]).id);
    }
  }, [choices, model]);
  const choice = choices.find(candidate => candidate.id === model);
  const servedWhere = choice?.served;

  const needsFit = Boolean(target?.capabilities.fitCheck);
  const fit = useQuery({
    queryKey: modelManagerFitQueryKey(installation, backend, model),
    queryFn: () => client!.checkFit({ model, ...(backend ? { backend } : {}) }),
    enabled: isOpen && Boolean(client && choice) && !servedWhere && needsFit,
    staleTime: 30_000,
    retry: false,
  });
  // model-manager recommends a placement from #190 on; the split is judged
  // by a second check only then.
  const offersPlacement = Boolean(fit.data?.recommended);
  const splitFit = useQuery({
    queryKey: modelManagerFitQueryKey(installation, backend, model, 'split'),
    queryFn: () =>
      client!.checkFit({
        model,
        placement: 'split',
        ...(backend ? { backend } : {}),
      }),
    enabled:
      isOpen && Boolean(client && choice) && !servedWhere && offersPlacement,
    staleTime: 30_000,
    retry: false,
  });

  // The Node field: the backend's nodes, each judged by a check pinned to it.
  const nodeInventory = Boolean(target?.capabilities.nodeInventory);
  const nodes = useQuery({
    queryKey: modelManagerNodesQueryKey(installation),
    queryFn: () => modelManagerApi.listNodes(installation),
    enabled: isOpen && Boolean(target) && needsFit && nodeInventory,
    staleTime: 30_000,
  });
  const modelImage = isModelImagePreset(
    presets.data?.find(preset => preset.name === model)?.storageUri,
  );
  const candidates = useMemo(
    () =>
      nodeCandidates(
        (nodes.data ?? []).filter(
          node => !node.backend || !backend || node.backend === backend,
        ),
        modelImage,
      ),
    [nodes.data, backend, modelImage],
  );
  const nodeFits = useQueries({
    queries: candidates.map(node => ({
      queryKey: modelManagerFitQueryKey(
        installation,
        backend,
        model,
        '',
        node.name,
      ),
      queryFn: () =>
        client!.checkFit({
          model,
          node: node.name,
          ...(backend ? { backend } : {}),
        }),
      enabled:
        isOpen &&
        Boolean(client && choice) &&
        !servedWhere &&
        servesPresetOn(node, modelImage),
      staleTime: 30_000,
      retry: false,
    })),
  });
  const fitByNode = Object.fromEntries(
    candidates.map((node, index) => [node.name, nodeFits[index]]),
  );
  const nodeOptions =
    candidates.length > 0
      ? nodeChoices(
          candidates,
          Object.fromEntries(
            candidates.map(node => [node.name, fitByNode[node.name]?.data]),
          ),
          { modelImage, prePulledNodes: fit.data?.prePulledNodes },
        )
      : undefined;
  const [tickedNodes, setTickedNodes] = useState<string[]>([]);
  useEffect(() => setTickedNodes([]), [model, targetKey, isOpen]);
  const fittingNodes = candidates
    .filter(candidate => fitByNode[candidate.name]?.data?.fits)
    .map(candidate => candidate.name);
  // Ticks on nodes that became unservable give way; none is any node.
  const copyNodes = tickedNodes.filter(name =>
    nodeOptions?.some(option => option.id === name && !option.disabled),
  );
  const pinned = copyNodes.length === 1 ? copyNodes[0] : undefined;
  const severalCopies = copyNodes.length > 1;
  const copiesFit = useQuery({
    queryKey: modelManagerFitQueryKey(
      installation,
      backend,
      model,
      'copies',
      copyNodes.join(','),
    ),
    queryFn: () =>
      client!.checkFit({
        model,
        placement: 'copies',
        nodes: copyNodes,
        ...(backend ? { backend } : {}),
      }),
    enabled:
      isOpen && Boolean(client && choice) && !servedWhere && severalCopies,
    staleTime: 30_000,
    retry: false,
  });

  const placements = placementChoices(fit.data, splitFit.data, copyNodes);

  // The recommendation stands until the person picks; a new model or a
  // disabled pick falls back to it.
  const [picked, setPicked] = useState<ModelManagerPlacement | undefined>();
  useEffect(() => setPicked(undefined), [model, targetKey, isOpen]);
  const recommendedChoice = placements?.find(
    option => option.recommended && !option.disabled,
  );
  const placement = placements
    ? (
        placements.find(option => option.id === picked && !option.disabled) ??
        recommendedChoice
      )?.id
    : undefined;
  const split = placement === 'split';
  const pinnedFit = pinned && !split ? fitByNode[pinned] : undefined;
  const copies = severalCopies && !split;
  // The verdict of the chosen placement: the split, the copies, the pinned
  // copy, else one copy anywhere.
  const activeFit =
    (split && splitFit) || (copies && copiesFit) || pinnedFit || fit;
  const verdict = activeFit.data
    ? describeFitVerdict(
        activeFit.data,
        pinnedFit ? { node: pinned } : { fittingNodes },
      )
    : undefined;

  const load = useTrackedMutation({
    event: null,
    untrackedReason:
      'Model serving operations are not a tracked portal action yet.',
    mutationFn: () =>
      client!.loadModel({
        model,
        ...(backend ? { backend } : {}),
        ...(split ? { placement, nodes: splitFit.data?.nodes } : {}),
        ...(copies ? { placement: 'copies' as const, nodes: copyNodes } : {}),
        ...(pinnedFit ? { node: pinned } : {}),
      }),
    onSuccess: () => invalidate(),
  });
  const { reset } = load;
  useEffect(() => {
    if (isOpen) {
      reset();
    }
  }, [isOpen, reset]);

  const submit = async () => {
    if (!target) {
      return;
    }
    let answer: ModelManagerLoadAnswer;
    try {
      answer = await load.mutateAsync();
    } catch {
      return;
    }
    onOpenChange(false);
    onServed?.(target, answer);
  };

  const isBusy = load.isPending;
  const fitBlocks =
    needsFit &&
    (activeFit.isPending || activeFit.isError || verdict?.fits === false);
  const canServe =
    Boolean(client && target && choice) &&
    !servedWhere &&
    !isBusy &&
    !fitBlocks;

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable={!isBusy}
      isKeyboardDismissDisabled={isBusy}
      width="min(90vw, 600px)"
    >
      <DialogHeader>Serve model</DialogHeader>
      <DialogBody>
        <Flex direction="column" gap="4">
          <Text variant="body-medium" color="secondary">
            Starts serving through model-manager as you. On a GPU pool the model
            is one of the presets published for the cluster; the node it needs
            is launched for it and stopped when it is unloaded.
          </Text>

          {seed?.pool && (
            <Text variant="body-medium" data-testid="serve-target">
              On GPU pool <strong>{seed.pool}</strong>
              {seed.cluster ? (
                <>
                  {' '}
                  of cluster <strong>{seed.cluster}</strong>
                </>
              ) : null}
              {seed.installation ? ` (${seed.installation})` : ''}
            </Text>
          )}

          {targets.length > 1 && (
            <Select
              label={
                targets.some(candidate => candidate.backend)
                  ? 'Installation and backend'
                  : 'Installation'
              }
              isRequired
              isDisabled={isBusy}
              options={targets.map(candidate => ({
                id: loadTargetKey(candidate),
                label: describeLoadTarget(candidate),
              }))}
              selectedKey={targetKey}
              onSelectionChange={key => {
                if (key) {
                  setTargetKey(String(key));
                }
              }}
            />
          )}

          {!target && (
            <Alert
              status="warning"
              description={
                installation
                  ? `No serving backend on ${installation} can load a model yet — register one, or deploy a GPU pool first.`
                  : 'No serving backend can load a model yet.'
              }
            />
          )}

          {target && !client && (
            <Alert
              status="danger"
              description={`muster is not connected for ${installation}: serving calls model-manager as you, through muster.`}
            />
          )}

          {target && usesPresets && presets.isError && (
            <Alert
              status="danger"
              description={`The presets of ${describeLoadTarget(target)} could not be read: ${presets.error.message}`}
            />
          )}

          {target && (
            <Select
              label={usesPresets ? 'Preset' : 'Model'}
              isRequired
              isDisabled={isBusy || choices.length === 0}
              placeholder={choicePlaceholder(
                usesPresets,
                presets.isPending,
                choices.length === 0,
              )}
              options={choices}
              selectedKey={model}
              onSelectionChange={key => {
                if (key) {
                  setModel(String(key));
                }
              }}
            />
          )}

          {choice?.description && (
            <Text variant="body-small" color="secondary">
              {choice.description}
            </Text>
          )}

          {placements && (
            <RadioGroup
              label="Placement"
              data-testid="serve-placement"
              value={placement ?? null}
              onChange={value => setPicked(value as ModelManagerPlacement)}
              isDisabled={isBusy}
            >
              {placements.map(option => (
                <Radio
                  key={option.id}
                  value={option.id}
                  isDisabled={option.disabled}
                >
                  <Flex direction="column" gap="0">
                    <Text variant="body-medium">
                      {option.label}
                      {option.recommended ? ' (recommended)' : ''}
                    </Text>
                    {option.description && (
                      <Text variant="body-small" color="secondary">
                        {option.description}
                      </Text>
                    )}
                  </Flex>
                </Radio>
              ))}
            </RadioGroup>
          )}

          {nodeOptions && !split && !servedWhere && (
            <Flex direction="column" gap="1" data-testid="serve-nodes">
              <CheckboxGroup
                label="Nodes"
                description="Tick a node for one copy there, several for one copy on each behind the same endpoint. None ticked: one copy on a node that fits."
                value={copyNodes}
                onChange={setTickedNodes}
                isDisabled={isBusy}
              >
                {nodeOptions.map(option => (
                  <Checkbox
                    key={option.id}
                    value={option.id}
                    isDisabled={option.disabled}
                  >
                    <Flex direction="column" gap="0">
                      <Text variant="body-medium">{option.label}</Text>
                      {option.description && (
                        <Text variant="body-small" color="secondary">
                          {option.description}
                        </Text>
                      )}
                    </Flex>
                  </Checkbox>
                ))}
              </CheckboxGroup>
              {fittingNodes.length > 1 && (
                <div>
                  <Button
                    variant="tertiary"
                    size="small"
                    isDisabled={
                      isBusy || copyNodes.length === fittingNodes.length
                    }
                    onPress={() => setTickedNodes(fittingNodes)}
                  >
                    All {fittingNodes.length} nodes that fit
                  </Button>
                </div>
              )}
            </Flex>
          )}

          {servedWhere && choice && (
            <Alert
              status="info"
              data-testid="serve-already-serving"
              title={`${choice.label}: ${servedWhere}`}
              description="model-manager serves each preset once. Stop it in the Serving list first to serve it on another node."
            />
          )}

          {needsFit && choice && !servedWhere && (
            <div data-testid="serve-fit-verdict">
              {activeFit.isPending && (
                <Text variant="body-medium" color="secondary">
                  Checking whether {choice.label} fits the pool…
                </Text>
              )}
              {activeFit.isError && (
                <Alert
                  status="danger"
                  title="Fit check failed"
                  description={activeFit.error.message}
                />
              )}
              {verdict && (
                <Alert
                  status={verdict.fits ? 'success' : 'danger'}
                  title={
                    verdict.fits
                      ? verdict.summary
                      : `Cannot be served on this pool: ${verdict.summary}`
                  }
                  description={verdict.details.join(' · ') || undefined}
                />
              )}
            </div>
          )}

          {load.error ? (
            <Alert status="danger" description={load.error.message} />
          ) : null}
        </Flex>
      </DialogBody>
      <DialogFooter>
        <Button
          variant="secondary"
          isDisabled={isBusy}
          onPress={() => onOpenChange(false)}
        >
          Cancel
        </Button>
        <Button variant="primary" isDisabled={!canServe} onPress={submit}>
          {isBusy ? 'Serving…' : 'Serve'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
