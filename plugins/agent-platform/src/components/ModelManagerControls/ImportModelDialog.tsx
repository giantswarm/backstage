import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import {
  toastApiRef,
  useApi as useFrontendApi,
} from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
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
  TextField,
} from '@backstage/ui';
import {
  dialogDismissLock,
  fieldErrorProps,
  MoreOptions,
  StatusLabel,
  isAwaitingData,
  searchableIf,
  useFieldValidation,
  useSelectFieldError,
} from '@giantswarm/backstage-plugin-ui-react';
import LockIcon from '@material-ui/icons/Lock';

import { modelManagerApiRef } from '../../apis';
import { usePullModel } from '../../hooks/usePullJobs';
import type { ModelManagerSearchResult } from '../../lib/modelManager';
import { describeFit } from '../../lib/modelManagerServe';
import { formatBytes } from '../../lib/formatNumbers';
import type { GpuNode, ServingBackend } from '../../lib/serving';
import { SelectableCard, SelectableCardGrid } from '../SelectableCard';

/** Long enough to read two lines, short enough not to follow you around. */
const TOAST_TIMEOUT_MS = 6000;

/** Hits per search; the hub ranks by downloads, so the first page is the useful one. */
export const SEARCH_LIMIT = 12;

/** Select key for "let model-manager pick the node". */
export const BEST_NODE = '__best__';
/** Select key for "no preset — a cache directory named after the model". */
export const NO_PRESET = '__none__';

/**
 * An installation the dialog can import on: `search` + `pull`, and its nodes
 * for the target picker. `backend` names the backend on it where the
 * installation runs several behind one model-manager (the request then
 * carries it).
 */
export type ImportTarget = {
  name: string;
  backend?: ServingBackend;
  /** The nodes the installation's serving layer reports (with their memory budgets, where known). */
  nodes: GpuNode[];
};

/** The select key of a target: installation, plus the backend where named. */
export function importTargetKey(
  target: Pick<ImportTarget, 'name' | 'backend'>,
): string {
  return target.backend ? `${target.name}/${target.backend}` : target.name;
}

export type ImportModelDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  targets: ImportTarget[];
};

/** The one-line summary of a hub hit under its id. */
export function describeSearchResult(result: ModelManagerSearchResult): string {
  const parts: string[] = [];
  if (result.pipelineTag) {
    parts.push(result.pipelineTag);
  }
  if (result.library) {
    parts.push(result.library);
  }
  if (result.downloads !== undefined) {
    parts.push(`${result.downloads.toLocaleString()} downloads`);
  }
  if (result.likes !== undefined) {
    parts.push(`${result.likes.toLocaleString()} likes`);
  }
  if (result.presets.length > 0) {
    parts.push(
      `preset${result.presets.length === 1 ? '' : 's'} ${result.presets.join(', ')}`,
    );
  }
  return parts.join(' · ');
}

/**
 * Imports a model from the Hugging Face Hub onto a KServe installation's
 * model cache, through model-manager: search the hub, pick a hit, choose the
 * serving preset the download is for and the node whose cache receives it,
 * read model-manager's size and fit verdict for exactly that combination, and
 * start the pre-warm download. Nothing waits for the download itself:
 * model-manager answers with a job and the downloads panel follows its
 * progress, so the dialog closes on acceptance and says where to look.
 *
 * The fit check is model-manager's own (weights from the hub's file tree plus
 * the preset's overhead against the node's memory budget) — the same one that
 * refuses a pull with `412 does_not_fit`, so what the dialog shows is what the
 * server will decide. A model that does not fit cannot be submitted; a gated
 * one needs the installation's hub token.
 *
 * Controlled like the other dialogs here: confirming does not close it, so a
 * refused request has somewhere to say so.
 *
 * The app's standard form: one column; the preset and the target node —
 * whose defaults (the hit's one preset, the node model-manager picks) fit
 * most imports — under More options. Download stays pressable until a model
 * is picked: pressed before, the search field says what is missing and takes
 * the focus (`useFieldValidation`); once one is, the fit verdict decides.
 */
export function ImportModelDialog({
  isOpen,
  onOpenChange,
  targets,
}: ImportModelDialogProps) {
  const toastApi = useFrontendApi(toastApiRef);
  const modelManagerApi = useApi(modelManagerApiRef);
  const [targetKey, setTargetKey] = useState(
    targets[0] ? importTargetKey(targets[0]) : '',
  );
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>();
  const [presetChoice, setPresetChoice] = useState<string>();
  const [nodeChoice, setNodeChoice] = useState<string>();
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const fieldScope = useRef<HTMLDivElement>(null);
  const validation = useFieldValidation(fieldScope);
  const { reset: resetValidation } = validation;

  // A target list that changes under an open dialog (an installation became
  // unreachable) must not leave the select pointing at nothing.
  useEffect(() => {
    if (!targets.some(target => importTargetKey(target) === targetKey)) {
      setTargetKey(targets[0] ? importTargetKey(targets[0]) : '');
    }
  }, [targets, targetKey]);

  const target = useMemo(
    () => targets.find(candidate => importTargetKey(candidate) === targetKey),
    [targets, targetKey],
  );
  const installation = target?.name ?? '';
  // The backend the import is scoped to, where the installation names them
  // (one model-manager running several); nothing on an installation with one.
  const scope = target?.backend ? { backend: target.backend } : undefined;

  const pull = usePullModel(installation);
  const { reset: resetPull } = pull;

  // Start clean every time it opens, including a previous attempt's error.
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSubmittedQuery('');
      setSelectedId(undefined);
      setPresetChoice(undefined);
      setNodeChoice(undefined);
      setMoreOptionsOpen(false);
      resetValidation();
      resetPull();
    }
  }, [isOpen, resetPull, resetValidation]);

  const search = useQuery({
    queryKey: [
      'agent-platform',
      'model-manager',
      'search',
      installation,
      target?.backend ?? '',
      submittedQuery,
    ],
    queryFn: () =>
      scope
        ? modelManagerApi.searchModels(
            installation,
            submittedQuery,
            SEARCH_LIMIT,
            scope,
          )
        : modelManagerApi.searchModels(
            installation,
            submittedQuery,
            SEARCH_LIMIT,
          ),
    enabled: isOpen && Boolean(installation) && submittedQuery.length > 0,
    staleTime: 60_000,
  });

  const selected = useMemo(
    () => search.data?.find(result => result.id === selectedId),
    [search.data, selectedId],
  );

  // The presets to offer: the hit's own (exactly this model). One preset is
  // the obvious choice; none leaves the directory named after the model. A
  // choice of "None" is kept as NO_PRESET, so it is not taken for no choice —
  // and never sent.
  const presetOptions = selected?.presets ?? [];
  const preset =
    presetChoice === NO_PRESET
      ? undefined
      : (presetChoice ??
        (presetOptions.length === 1 ? presetOptions[0] : undefined));
  const presetKey = preset ?? NO_PRESET;
  const presetSelectOptions = [
    ...presetOptions.map(name => ({ id: name, label: name })),
    {
      id: NO_PRESET,
      label:
        presetOptions.length > 0
          ? 'None (cache directory named after the model)'
          : 'No preset serves this model',
    },
  ];

  // A single node is the obvious target; with several, or none known,
  // model-manager picks the best budget unless the user chooses — "Best
  // node" kept as BEST_NODE, like "None" above, and never sent.
  const nodes = target?.nodes ?? [];
  const node =
    nodeChoice === BEST_NODE
      ? undefined
      : (nodeChoice ?? (nodes.length === 1 ? nodes[0].name : undefined));
  const nodeKey = node ?? BEST_NODE;
  const nodeSelectOptions = [
    { id: BEST_NODE, label: 'Best node (model-manager decides)' },
    ...nodes.map(candidate => ({
      id: candidate.name,
      label:
        candidate.memoryBudgetBytes !== undefined
          ? `${candidate.name} · ${formatBytes(
              candidate.memoryFreeBytes ?? candidate.memoryBudgetBytes,
            )} free`
          : candidate.name,
    })),
  ];

  const fit = useQuery({
    queryKey: [
      'agent-platform',
      'model-manager',
      'fit-check',
      installation,
      target?.backend ?? '',
      selected?.id ?? '',
      preset ?? '',
      node ?? '',
    ],
    queryFn: () =>
      modelManagerApi.fitCheck(installation, {
        model: selected!.id,
        ...(preset && { preset }),
        ...(node && { node }),
        ...scope,
      }),
    enabled: isOpen && Boolean(installation) && Boolean(selected),
    staleTime: 30_000,
    retry: false,
  });

  const runSearch = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || pull.isPending) {
      return;
    }
    setSelectedId(undefined);
    setPresetChoice(undefined);
    setSubmittedQuery(trimmed);
  };

  const choose = (result: ModelManagerSearchResult) => {
    setSelectedId(result.id);
    setPresetChoice(undefined);
    pull.reset();
  };

  const verdict = fit.data;
  const blockedByGate =
    verdict !== undefined &&
    (verdict.gated || verdict.private) &&
    !verdict.tokenConfigured;
  const canDownload =
    Boolean(selected) &&
    verdict !== undefined &&
    verdict.fits &&
    !blockedByGate &&
    !pull.isPending;

  const errors = {
    target: target ? undefined : 'Pick where the model is imported.',
    model: selected
      ? undefined
      : `${
          search.data && search.data.length > 0
            ? 'Pick a model from the results.'
            : 'Search the hub, then pick a model from the results.'
        }`,
  };
  const targetError = useSelectFieldError(validation.errorFor(errors.target));

  const submit = async () => {
    if (errors.target || errors.model) {
      validation.reveal();
      return;
    }
    if (!selected || !canDownload) {
      return;
    }
    let result: Awaited<ReturnType<typeof pull.mutateAsync>>;
    try {
      result = await pull.mutateAsync({
        model: selected.id,
        ...(preset && { preset }),
        ...(node && { node }),
        ...scope,
      });
    } catch {
      // Left to the dialog, which stays open and renders `pull.error`.
      return;
    }
    onOpenChange(false);
    toastApi.post({
      title: result.created
        ? `Downloading ${selected.id} on ${installation}`
        : `${selected.id} is already being downloaded on ${installation}`,
      description: `${
        node ? `Into the cache on ${node}. ` : ''
      }Progress shows in the downloads list below the served models; serve it from there once it is done.`,
      status: 'info',
      timeout: TOAST_TIMEOUT_MS,
    });
  };

  const isBusy = pull.isPending;

  return (
    <Dialog
      isOpen={isOpen}
      {...dialogDismissLock(isBusy, onOpenChange)}
      width="min(90vw, 720px)"
    >
      <DialogHeader>Import a model from Hugging Face</DialogHeader>
      <DialogBody>
        <Flex direction="column" gap="4" ref={fieldScope}>
          <Text variant="body-medium" color="secondary">
            Search the Hugging Face Hub and pre-warm a model into the node's
            model cache, so serving it later skips the download. model-manager
            resolves the size and checks the fit against the node before
            anything is fetched.
          </Text>

          {targets.length > 1 && (
            <Select
              label="Environment"
              isRequired
              isDisabled={isBusy}
              searchable={searchableIf(targets)}
              options={targets.map(candidate => ({
                id: importTargetKey(candidate),
                label: candidate.backend
                  ? `${candidate.name} · ${candidate.backend}`
                  : candidate.name,
              }))}
              selectedKey={targetKey}
              onSelectionChange={key => {
                if (key) {
                  setTargetKey(String(key));
                  setSelectedId(undefined);
                  setSubmittedQuery('');
                }
              }}
              {...targetError.selectProps}
            />
          )}
          {targets.length > 1 && targetError.message}

          <form onSubmit={runSearch}>
            <Flex align="end" gap="2">
              <div style={{ flex: 1 }}>
                <TextField
                  label="Search"
                  isDisabled={isBusy}
                  value={query}
                  onChange={setQuery}
                  placeholder="e.g. Qwen3-14B, devstral, org/repository"
                  description="Repository ids or words from the name; the hub ranks by downloads."
                  {...fieldErrorProps(validation.errorFor(errors.model))}
                />
              </div>
              <Button
                type="submit"
                variant="secondary"
                isDisabled={isBusy || query.trim().length === 0}
              >
                Search
              </Button>
            </Flex>
          </form>

          {search.isError && (
            <Alert
              status="danger"
              title="The hub could not be searched"
              description={(search.error as Error).message}
            />
          )}
          {isAwaitingData(search) && (
            <Text variant="body-medium" color="secondary">
              Searching…
            </Text>
          )}
          {search.data && search.data.length === 0 && (
            <Text variant="body-medium" color="secondary">
              Nothing on the hub matches "{submittedQuery}".
            </Text>
          )}
          {search.data && search.data.length > 0 && (
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              <SelectableCardGrid
                role="radiogroup"
                ariaLabel="Search results"
                minWidth={280}
              >
                {search.data.map(result => (
                  <SelectableCard
                    key={result.id}
                    role="radio"
                    selected={result.id === selectedId}
                    ariaLabel={result.id}
                    onSelect={() => choose(result)}
                  >
                    <Text as="p" variant="body-medium" weight="bold" truncate>
                      {result.id}
                    </Text>
                    <Text variant="body-small" color="secondary">
                      {describeSearchResult(result)}
                    </Text>
                    {(result.gated || result.private) && (
                      <StatusLabel
                        label={result.private ? 'Private' : 'Gated'}
                        intent="warning"
                        icon={LockIcon}
                        title="Needs a Hugging Face token with access to download."
                      />
                    )}
                  </SelectableCard>
                ))}
              </SelectableCardGrid>
            </div>
          )}

          {selected && (
            <>
              <MoreOptions
                open={moreOptionsOpen}
                onOpenChange={setMoreOptionsOpen}
                summary={`preset ${preset ?? 'none'} · ${
                  node ?? 'the best node'
                }`}
              >
                <Text variant="body-small" color="secondary">
                  The defaults work for most models.
                </Text>
                <Select
                  label="Serving preset"
                  isDisabled={isBusy}
                  searchable={searchableIf(presetSelectOptions)}
                  options={presetSelectOptions}
                  selectedKey={presetKey}
                  onSelectionChange={key =>
                    setPresetChoice(
                      key && String(key) !== NO_PRESET
                        ? String(key)
                        : NO_PRESET,
                    )
                  }
                  description="The weights land in the cache directory that preset's LLMInferenceService mounts, and its serving overhead is what the fit check adds."
                />
                <Select
                  label="Target node"
                  isDisabled={isBusy}
                  searchable={searchableIf(nodeSelectOptions)}
                  options={nodeSelectOptions}
                  selectedKey={nodeKey}
                  onSelectionChange={key =>
                    setNodeChoice(
                      key && String(key) !== BEST_NODE
                        ? String(key)
                        : BEST_NODE,
                    )
                  }
                  description="Whose cache receives the download; the fit is checked against this node's memory budget."
                />
              </MoreOptions>

              {isAwaitingData(fit) && (
                <Text variant="body-medium" color="secondary">
                  Resolving the size and checking the fit…
                </Text>
              )}
              {fit.isError && (
                <Alert
                  status="danger"
                  title="The fit could not be checked"
                  description={(fit.error as Error).message}
                />
              )}
              {verdict && verdict.fits && (
                <Alert
                  status={verdict.cached ? 'info' : 'success'}
                  title={
                    verdict.cached
                      ? `Already in the cache${verdict.node ? ` on ${verdict.node}` : ''}`
                      : `Fits${verdict.node ? ` on ${verdict.node}` : ''}`
                  }
                  description={[verdict.reason, describeFit(verdict)]
                    .filter(Boolean)
                    .join(' — ')}
                />
              )}
              {verdict && !verdict.fits && (
                <Alert
                  status="danger"
                  title={`Does not fit${verdict.node ? ` on ${verdict.node}` : ''}`}
                  description={`${[verdict.reason, describeFit(verdict)]
                    .filter(Boolean)
                    .join(
                      ' — ',
                    )} model-manager refuses the download; pick another node or a smaller model.`}
                />
              )}
              {blockedByGate && (
                <Alert
                  status="warning"
                  title={`${verdict?.private ? 'Private' : 'Gated'} repository`}
                  description={`Downloading it needs a Hugging Face token with access, and ${installation} has none configured (kserve.hf.tokenSecret). Ask a platform administrator to add one.`}
                />
              )}
            </>
          )}

          {pull.error ? (
            <Alert
              status="danger"
              title="The download could not be started"
              description={(pull.error as Error).message}
            />
          ) : null}
        </Flex>
      </DialogBody>
      <DialogFooter>
        <Button
          variant="secondary"
          isDisabled={isBusy}
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          isPending={isBusy}
          // Until a model is picked Download says what is missing; once one
          // is, the fit verdict and the gate above decide.
          isDisabled={Boolean(selected) && !canDownload}
          onClick={submit}
        >
          {isBusy ? 'Starting…' : 'Download'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
