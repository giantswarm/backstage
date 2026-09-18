import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Flex,
  NumberField,
  Select,
  Text,
  TextField,
} from '@backstage/ui';
import { dump } from 'js-yaml';

import {
  useClusterManagerInfo,
  useCreateNodePoolSchema,
  useManagedClusters,
  useNodePoolWrite,
} from '../../hooks/useClusterManager';
import {
  CACHE_ARGUMENT,
  CLUSTER_MANAGER_SERVER,
  DEFAULT_ACCELERATORS,
  ZONES_ARGUMENT,
  deployBlocker,
  describeComponent,
  describeReleaseGroup,
  groupManifestsByRelease,
  isValidPoolName,
  manifestFilename,
  offersArgument,
  presetFitOf,
  presetLabel,
  type CreateNodePoolInput,
  type ManagedCluster,
  type NodePoolWriteResult,
} from '../../lib/clusterManager';
import type { ServeChoice } from '../../lib/serveIntent';
import { CodeBlock } from '../CodeBlock';
import { CommitOutcome } from '../CommitOutcome';
import { ConnectAgentManagerAlert } from '../ConnectAgentManagerAlert';
import { DIALOG_FORM_STYLE } from '../dialogForm';
import { NodeSizePicker } from './NodeSizePicker';
import { PartialWriteOutcome } from './PartialWriteOutcome';
import { PoolFitReview } from './PoolFitReview';
import {
  CacheRefusalDetails,
  PoolPlacementPicker,
  PoolPlacementReview,
  cacheRefusalDetails,
} from './PoolPlacementPicker';

export type AddGpuNodePoolDialogProps = {
  /** The installations whose muster lists cluster-manager. */
  installations: string[];
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /**
   * After a complete Deploy: the pool was applied as the person on
   * `installation` — with the preset chosen under **I want to serve**, the
   * pool's serve intent (giantswarm/backstage#2437), when one was.
   */
  onDeployed?: (
    result: NodePoolWriteResult,
    installation: string,
    serve?: ServeChoice,
  ) => void;
};

type TeleportChoice = 'default' | 'on' | 'off';

const TELEPORT_OPTIONS: { id: TeleportChoice; label: string }[] = [
  {
    id: 'default',
    label: 'Cluster default (on when the cluster has a join token)',
  },
  { id: 'on', label: 'Join the nodes to Teleport' },
  { id: 'off', label: 'Do not join Teleport' },
];

/** How long the form waits after the last change before it asks cluster-manager. */
export const DRY_RUN_DEBOUNCE_MS = 400;

/**
 * The pool name the sizing dry run carries while the person has not named
 * the pool yet: `create_node_pool` requires a name, and the sizes, their
 * prices and the presets each hosts depend on the cluster and the accelerator
 * alone. A dry run writes nothing; the name only labels the manifests, which
 * the review shows once the pool is named.
 */
export const SIZING_POOL_NAME = 'gpu-sizing';

/** The marks `list_clusters` reports for one cluster, as one line each. */
export function clusterMarks(cluster: ManagedCluster): string[] {
  const marks = [
    cluster.ownCluster ? "The installation's own cluster" : 'Workload cluster',
    describeComponent(cluster.gpuOperator, 'GPU operator'),
    describeComponent(cluster.serving, 'Model serving'),
    cluster.commitTarget
      ? `Commit target: ${cluster.commitTarget.repository} (${cluster.commitTarget.path})`
      : 'Commit target: none (no git repository owns this cluster)',
  ];
  if (cluster.poolReleases.length > 0) {
    marks.push(
      `GPU pools: ${cluster.poolReleases.map(release => release.name).join(', ')}`,
    );
  }
  return marks;
}

/**
 * Add GPU node pool — from the Models pages, the agent-creation pattern:
 * a form, `create_node_pool` with `dryRun` through muster as the signed-in
 * person, the composed releases as manifests in one review, and **Deploy**
 * (`mode: apply`) or **Commit** (`mode: commit`, once cluster-manager offers
 * it). The decision that sets the pool's price and the models it can serve —
 * the **node size** — is made on the form: as soon as the cluster, the pool
 * name and the accelerator are set, the form runs the dry run with the
 * chart's defaults and offers the sizes cluster-manager composed with their
 * prices and the presets each hosts; every change re-runs it. The review
 * shows the same choice and the manifests; Deploy sends the sizes as chosen.
 * Where the pool runs (**Zones**, any combination of the cluster's, none for
 * the platform's choice) and whether it keeps a **model cache** are the
 * person's too (giantswarm/backstage#2483), offered where the installation's
 * cluster-manager takes the arguments; the dry run's `zonesNote` and
 * `cache.note` say in the review what the choice comes to. The portal
 * composes nothing: what the review shows is exactly what cluster-manager
 * would write.
 */
export function AddGpuNodePoolDialog({
  installations,
  isOpen,
  onOpenChange,
  onDeployed,
}: AddGpuNodePoolDialogProps) {
  const [installation, setInstallation] = useState<string | undefined>(
    installations[0],
  );
  const [clusterName, setClusterName] = useState<string>();
  const [name, setName] = useState('');
  const [accelerator, setAccelerator] = useState<string>(
    DEFAULT_ACCELERATORS[0],
  );
  const [maxGpus, setMaxGpus] = useState(4);
  const [teleport, setTeleport] = useState<TeleportChoice>('default');
  /** The zones the nodes may launch in; empty lets the platform choose. */
  const [zones, setZones] = useState<string[]>([]);
  /** Whether the pool's serving slice keeps a model cache claim (the installation's default: on). */
  const [cache, setCache] = useState(true);
  const [step, setStep] = useState<'form' | 'review'>('form');
  /** The first dry run with the chart's defaults: every size to pick from, every preset. */
  const [shapes, setShapes] = useState<NodePoolWriteResult>();
  /** The sizes chosen on the form; `undefined` for the chart's defaults (every shape). */
  const [sizes, setSizes] = useState<string[]>();
  const [preset, setPreset] = useState<string>();
  /** The latest dry run for the form as it stands: what Deploy would write. */
  const [review, setReview] = useState<NodePoolWriteResult>();
  /** The dry run scheduled or in flight; an older answer arriving later is dropped. */
  const rerun = useRef(0);
  const [judging, setJudging] = useState(false);
  const [applied, setApplied] = useState<NodePoolWriteResult>();
  const [committed, setCommitted] = useState<NodePoolWriteResult>();

  const {
    clusters,
    clusterApiNote: noClusterApi,
    isLoading: clustersLoading,
    error: clustersError,
  } = useManagedClusters(installation);
  const { info } = useClusterManagerInfo(installation);
  const schema = useCreateNodePoolSchema(installation);
  const accelerators = schema?.accelerators ?? DEFAULT_ACCELERATORS;
  /** The two choices this installation's cluster-manager takes; an older one shows neither. */
  const offers = useMemo(
    () => ({
      zones: offersArgument(schema, ZONES_ARGUMENT),
      cache: offersArgument(schema, CACHE_ARGUMENT),
    }),
    [schema],
  );
  const write = useNodePoolWrite(installation);
  const { dryRun } = write;

  useEffect(() => {
    if (!installation && installations.length > 0) {
      setInstallation(installations[0]);
    }
  }, [installation, installations]);

  /** Another cluster or accelerator: its sizes and presets are read anew. */
  const resetChoice = () => {
    setShapes(undefined);
    setSizes(undefined);
    setPreset(undefined);
  };
  /** Another cluster: its zones are others; the cache choice stands. */
  const resetCluster = () => {
    resetChoice();
    setZones([]);
  };

  useEffect(() => {
    if (!isOpen) {
      rerun.current += 1;
      setStep('form');
      resetChoice();
      setReview(undefined);
      setJudging(false);
      setApplied(undefined);
      setCommitted(undefined);
      write.reset();
    }
    // `write` changes identity every render; reset once per close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const cluster = useMemo(
    () => clusters.find(candidate => candidate.name === clusterName),
    [clusters, clusterName],
  );

  /**
   * The sizing input: as soon as a cluster is picked, with the pool's name
   * where it is valid and SIZING_POOL_NAME until then, so the sizes, their
   * prices and the presets appear before the person names the pool. Without
   * `sizes` cluster-manager composes the chart's defaults.
   */
  const sizingInput: CreateNodePoolInput | undefined = useMemo(() => {
    if (!cluster) {
      return undefined;
    }
    return {
      cluster: cluster.name,
      namespace: cluster.namespace,
      name: isValidPoolName(name) ? name : SIZING_POOL_NAME,
      accelerator,
      maxGpus,
      ...(teleport === 'default' ? {} : { teleport: teleport === 'on' }),
      // Only what the installation's cluster-manager takes: zones when
      // named (none is the platform's choice), the cache as chosen.
      ...(offers.zones && zones.length > 0 ? { zones } : {}),
      ...(offers.cache ? { cache } : {}),
    };
  }, [cluster, name, accelerator, maxGpus, teleport, offers, zones, cache]);

  /** The form's input as Deploy and Review take it: the pool named. */
  const formInput: CreateNodePoolInput | undefined = useMemo(
    () => (sizingInput && isValidPoolName(name) ? sizingInput : undefined),
    [sizingInput, name],
  );

  /** The sizes as chosen: the person's, or every size of the chart's defaults. */
  const chosen = useMemo(
    () => sizes ?? shapes?.sizes?.map(shape => shape.size),
    [sizes, shapes],
  );

  /** What Deploy and Commit send: the form's input with the sizes as chosen. */
  const input = useMemo(
    () => (formInput && chosen ? { ...formInput, sizes: chosen } : formInput),
    [formInput, chosen],
  );

  /**
   * The dry run for the form as it stands (the sizing name until the pool is
   * named); without a choice of sizes it asks for the chart's defaults and
   * its answer is the set to pick from.
   */
  const judge = async (
    seq: number,
  ): Promise<NodePoolWriteResult | undefined> => {
    if (!sizingInput) {
      return undefined;
    }
    setJudging(true);
    try {
      const result = await dryRun(
        sizes ? { ...sizingInput, sizes } : sizingInput,
      );
      if (seq !== rerun.current) {
        return undefined;
      }
      if (!sizes) {
        setShapes(result);
      }
      setReview(result);
      return result;
    } catch {
      // Shown from `write.failure`; the sizes read before stand.
      return undefined;
    } finally {
      if (seq === rerun.current) {
        setJudging(false);
      }
    }
  };

  // The form asks cluster-manager as soon as it can and after every change,
  // debounced: the answer is the review, kept current while the person types.
  useEffect(() => {
    rerun.current += 1;
    if (!isOpen || !sizingInput) {
      setReview(undefined);
      setJudging(false);
      return undefined;
    }
    const seq = rerun.current;
    setJudging(true);
    const timer = setTimeout(() => judge(seq), DRY_RUN_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `judge` closes over the same inputs; `dryRun` follows the installation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, sizingInput, sizes, dryRun]);

  const canCommit = info?.modes.commit === true;
  const notConnected = write.failure?.kind === 'not-connected';
  const isBusy = write.isBusy && !judging;
  const done = Boolean(applied || committed?.pullRequestUrl);
  const blocker = deployBlocker(review, preset);
  const canReview = Boolean(formInput) && !isBusy && !judging;
  const canWrite =
    Boolean(input) &&
    Boolean(review) &&
    !isBusy &&
    !judging &&
    !blocker &&
    chosen?.length !== 0;

  /** Review: the current dry run's manifests, or one more try where the last was refused. */
  const onReview = async (event: FormEvent) => {
    event.preventDefault();
    if (!canReview) {
      return;
    }
    if (review) {
      setStep('review');
      return;
    }
    const seq = ++rerun.current;
    if (await judge(seq)) {
      setStep('review');
    }
  };

  /** The preset to serve: the smallest size hosting it is the choice, the rest is marked. */
  const onPresetChange = (next: string | undefined) => {
    setPreset(next);
    const fit = presetFitOf(shapes?.presetFit, next);
    if (fit?.size) {
      setSizes([fit.size]);
    }
  };

  /** The preset chosen to serve, as Deploy hands it on: its display name and model from the dry run's fit. */
  const serveChoice = (): ServeChoice | undefined => {
    if (!preset) {
      return undefined;
    }
    const fit = presetFitOf(shapes?.presetFit, preset);
    return { preset, displayName: fit?.displayName, model: fit?.model };
  };

  /** Deploy, and Continue after a partial Deploy: the same call, the same arguments. */
  const onDeploy = async () => {
    if (!input) {
      return;
    }
    try {
      const result = await write.create(input, 'apply');
      setApplied(result);
      if (!result.partial && installation) {
        onDeployed?.(result, installation, serveChoice());
      }
    } catch {
      // Shown from `write.failure`.
    }
  };

  const onCommit = async () => {
    if (!input) {
      return;
    }
    try {
      setCommitted(await write.create(input, 'commit'));
    } catch {
      // Shown from `write.failure`.
    }
  };

  const close = (next: boolean) => {
    if (!isBusy) {
      onOpenChange(next);
    }
  };

  const onForm = step === 'form';
  const groups = review ? groupManifestsByRelease(review) : [];
  const shapeList = shapes?.sizes ?? [];
  const hasShapes = shapeList.length > 0;

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={close}
      isDismissable={!isBusy}
      isKeyboardDismissDisabled={isBusy}
      width="min(90vw, 860px)"
    >
      <form onSubmit={onReview} style={DIALOG_FORM_STYLE}>
        <DialogHeader>Add GPU node pool</DialogHeader>
        <DialogBody>
          <Flex direction="column" gap="4">
            <Text variant="body-small" color="secondary">
              GPU capacity for the models served on this installation. The pool,
              the GPU operator where the cluster has none and model serving
              where it has none are composed by cluster-manager and written as
              you.
            </Text>

            {onForm && (
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
                        setClusterName(undefined);
                        resetCluster();
                      }
                    }}
                  />
                )}
                <Select
                  label="Cluster"
                  isRequired
                  placeholder={clusterPlaceholder(
                    clustersLoading,
                    clusters.length,
                  )}
                  options={clusters.map(candidate => ({
                    id: candidate.name,
                    label: `${candidate.name} (${candidate.organization}${
                      candidate.ownCluster ? ', own cluster' : ''
                    })`,
                  }))}
                  selectedKey={clusterName ?? null}
                  onSelectionChange={key => {
                    setClusterName(key ? String(key) : undefined);
                    resetCluster();
                  }}
                />
                {cluster && (
                  <Flex direction="column" gap="1" data-testid="cluster-marks">
                    {clusterMarks(cluster).map(mark => (
                      <Text key={mark} variant="body-small" color="secondary">
                        {mark}
                      </Text>
                    ))}
                  </Flex>
                )}
                {!clustersLoading && clusters.length === 0 && noClusterApi && (
                  <Alert
                    status="info"
                    title="No clusters on this installation"
                    description={noClusterApi}
                    data-testid="cluster-api-note"
                  />
                )}
                {clustersError && (
                  <Alert
                    status="warning"
                    title="Clusters could not be read"
                    description={clustersError.message}
                  />
                )}
                <TextField
                  label="Pool name"
                  isRequired
                  description="Five to twenty lowercase letters, digits and dashes (gpu00, gpu-l4). The MachinePool is named <cluster>-<name>."
                  value={name}
                  onChange={setName}
                  isInvalid={name.length > 0 && !isValidPoolName(name)}
                />
                <Select
                  label="Accelerator"
                  isRequired
                  options={accelerators.map(id => ({ id, label: id }))}
                  selectedKey={accelerator}
                  onSelectionChange={key => {
                    if (key) {
                      setAccelerator(String(key));
                      resetChoice();
                    }
                  }}
                />
                {!hasShapes && !sizingInput && (
                  <Text
                    variant="body-small"
                    color="secondary"
                    data-testid="sizes-pending"
                  >
                    Node size: pick a cluster — the sizes for the accelerator,
                    their prices and the presets each hosts are read from
                    cluster-manager's dry run.
                  </Text>
                )}
                {!hasShapes && sizingInput && judging && (
                  <Text
                    variant="body-small"
                    color="secondary"
                    data-testid="sizes-loading"
                  >
                    Node size: reading the sizes for {accelerator} from
                    cluster-manager…
                  </Text>
                )}
                {hasShapes && (
                  <NodeSizePicker
                    shapes={shapeList}
                    presetFit={shapes?.presetFit}
                    review={review}
                    sizes={chosen ?? []}
                    onSizesChange={setSizes}
                    preset={preset}
                    onPresetChange={onPresetChange}
                    isBusy={isBusy}
                    judging={judging}
                  />
                )}
                {cluster && (
                  <PoolPlacementPicker
                    cluster={cluster}
                    offers={offers}
                    zones={zones}
                    onZonesChange={setZones}
                    cache={cache}
                    onCacheChange={setCache}
                    isBusy={isBusy}
                  />
                )}
                <NumberField
                  label="Maximum GPUs"
                  description="Across all nodes of the pool; the pool scales to zero."
                  minValue={1}
                  value={maxGpus}
                  onChange={value =>
                    setMaxGpus(Number.isFinite(value) ? value : 1)
                  }
                />
                <Select
                  label="Teleport"
                  options={TELEPORT_OPTIONS}
                  selectedKey={teleport}
                  onSelectionChange={key =>
                    key && setTeleport(key as TeleportChoice)
                  }
                />
              </Flex>
            )}

            {!onForm && review && (
              <Flex direction="column" gap="3" data-testid="node-pool-review">
                <Text variant="body-medium">
                  {review.cluster}-{review.pool}: gpu-node-pool chart{' '}
                  {review.chartVersion ?? '?'}, Kubernetes{' '}
                  {review.kubernetesVersion ?? '?'} (control plane{' '}
                  {review.controlPlaneVersion ?? '?'}).
                  {review.machineImage ? ` Image ${review.machineImage}.` : ''}
                </Text>
                <Text variant="body-small" color="secondary">
                  {review.objects
                    .map(
                      object =>
                        `${object.kind} ${object.namespace}/${object.name}: ${object.action}`,
                    )
                    .join(' · ')}
                </Text>
                {review.backend && (
                  <Text variant="body-small" color="secondary">
                    Serving backend registered with model-manager:{' '}
                    {review.backend.name} → {review.backend.target}
                  </Text>
                )}
                {hasShapes && chosen && (
                  <PoolFitReview
                    shapes={shapeList}
                    presetFit={shapes?.presetFit}
                    review={review}
                    sizes={chosen}
                    preset={preset}
                  />
                )}
                <PoolPlacementReview
                  offers={offers}
                  zones={zones}
                  cache={cache}
                  review={review}
                />
                {groups.map(group => (
                  <Flex key={group.name} direction="column" gap="2">
                    <Text variant="body-medium">
                      {describeReleaseGroup(group)}
                    </Text>
                    {group.manifests.map(manifest => {
                      const filename = manifestFilename(manifest);
                      const content = dump(manifest, { noRefs: true });
                      return (
                        <Flex key={filename} direction="column" gap="1">
                          <CodeBlock
                            filename={filename}
                            content={content}
                            language="yaml"
                          />
                          <Flex gap="2">
                            <Button
                              size="small"
                              variant="tertiary"
                              onPress={() =>
                                navigator.clipboard?.writeText(content)
                              }
                            >
                              Copy
                            </Button>
                            <Button
                              size="small"
                              variant="tertiary"
                              onPress={() => downloadText(filename, content)}
                            >
                              Download
                            </Button>
                          </Flex>
                        </Flex>
                      );
                    })}
                  </Flex>
                ))}
                {!canCommit && (
                  <Text variant="body-small" color="secondary">
                    Commit — a pull request in the repository owning the cluster
                    — is not available yet on this installation's
                    cluster-manager.
                  </Text>
                )}
              </Flex>
            )}

            {write.failure && !notConnected && (
              <Alert
                status="danger"
                title="cluster-manager refused"
                description={
                  cacheRefusalDetails(write.failure.refused) ? (
                    <Flex direction="column" gap="2">
                      <Text variant="body-small">{write.failure.message}</Text>
                      <CacheRefusalDetails refused={write.failure.refused!} />
                    </Flex>
                  ) : (
                    write.failure.message
                  )
                }
              />
            )}
            {notConnected && installation && (
              <ConnectAgentManagerAlert
                installation={installation}
                message={write.failure!.message}
                action="GPU node pools are created"
                server={CLUSTER_MANAGER_SERVER}
              />
            )}
            {applied && applied.partial && (
              <PartialWriteOutcome
                result={applied}
                action="Deploy"
                onContinue={onDeploy}
                isBusy={isBusy}
              />
            )}
            {applied && !applied.partial && (
              <Alert
                status="success"
                title={`Pool ${applied.cluster}-${applied.pool} applied as you`}
                description={applied.objects
                  .map(
                    object => `${object.kind} ${object.name}: ${object.action}`,
                  )
                  .join(' · ')}
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
            {onForm && (
              <Button type="submit" variant="primary" isDisabled={!canReview}>
                {judging ? 'Judging…' : 'Review'}
              </Button>
            )}
            {!onForm && !done && (
              <>
                <Button
                  variant="secondary"
                  onPress={() => setStep('form')}
                  isDisabled={isBusy}
                >
                  Back
                </Button>
                <Button
                  variant="secondary"
                  onPress={onCommit}
                  isDisabled={!canCommit || !canWrite}
                  aria-label={
                    canCommit ? 'Commit' : 'Commit (not available yet)'
                  }
                >
                  {canCommit ? 'Commit' : 'Commit (not available yet)'}
                </Button>
                <Button
                  variant="primary"
                  onPress={onDeploy}
                  isDisabled={!canWrite}
                  aria-label={
                    blocker
                      ? `Deploy (blocked: ${presetLabel(blocker)} fits no size of this pool)`
                      : 'Deploy'
                  }
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

/** The cluster picker's placeholder: reading, nothing to pick, or pick one. */
function clusterPlaceholder(loading: boolean, count: number): string {
  if (loading) {
    return 'Reading clusters…';
  }
  return count === 0 ? 'No clusters' : 'Pick a cluster';
}

function downloadText(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/yaml' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
