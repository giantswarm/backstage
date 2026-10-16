import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Flex,
  NumberField,
  Select,
  Text,
  TextField,
} from '@backstage/ui';
import {
  countNoun,
  MoreOptions,
  searchableIf,
  useFieldValidation,
  useProvidePageHeaderActions,
  useSelectFieldError,
  WizardFrame,
  WizardStepHeading,
} from '@giantswarm/backstage-plugin-ui-react';

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
  cacheKeptByCluster,
  deployBlocker,
  describeComponent,
  describeReleaseGroup,
  groupManifestsByRelease,
  isValidPoolName,
  offersArgument,
  presetFitOf,
  presetLabel,
  type CreateNodePoolInput,
  type ManagedCluster,
  type NodePoolWriteResult,
} from '../../lib/clusterManager';
import type { ServeChoice } from '../../lib/serveIntent';
import { ClusterManagerCommitOutcome } from '../ClusterManagerCommitOutcome';
import { ConnectAgentManagerAlert } from '../ConnectAgentManagerAlert';
import { HOSTING_FLOW_CONTEXT } from '../ModelHostingActions';
import { ManifestList } from '../ManifestList';
import { NodeSizePicker } from './NodeSizePicker';
import { PartialWriteOutcome } from './PartialWriteOutcome';
import { PoolFitReview } from './PoolFitReview';
import {
  CacheRefusalDetails,
  PoolPlacementPicker,
  PoolPlacementReview,
  cacheRefusalDetails,
  everyZone,
} from './PoolPlacementPicker';

export type AddGpuNodePoolPageProps = {
  /** The installations whose muster lists cluster-manager. */
  installations: string[];
  /** Where Close and Cancel lead: the view the flow was opened from. */
  closeHref: string;
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

/** The flow's two steps: the form, then the dry run's review. */
const POOL_STEPS = [
  { id: 'form', label: 'Pool' },
  { id: 'review', label: 'Review' },
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

/** Under the cluster picker until a cluster is picked: what the line says once one is. */
export const CLUSTER_PENDING =
  'Pick the cluster the pool joins; cluster-manager reports its GPU operator, model serving and owning repository.';

/** The marks `list_clusters` reports for one cluster, as one line each. */
export function clusterMarks(cluster: ManagedCluster): string[] {
  const marks = [
    cluster.ownCluster ? "The environment's own cluster" : 'Workload cluster',
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
 * Add GPU node pool (`/customize/models/hosting/capacity/add-pool`) — the app's
 * multi-step create pattern, `WizardFrame` with its step strip like agent
 * creation: a **Pool** step (the form), then `create_node_pool` with `dryRun`
 * through muster as the signed-in person, the composed releases as manifests
 * on a **Review** step, and **Deploy**
 * (`mode: apply`) or **Commit** (`mode: commit`, once cluster-manager offers
 * it). The decision that sets the pool's price and the models it can serve —
 * the **node size** — is made on the form: as soon as the cluster is picked
 * (the one cluster of an installation is picked as the form opens), the form
 * runs the dry run with the chart's defaults and offers the sizes
 * cluster-manager composed with their prices and the presets each hosts;
 * every change re-runs it. Where the pool runs (**Zones**, every zone of the
 * cluster by default, any combination) and whether it keeps a **model
 * cache** (off by default, its monthly price the switch's own line when on)
 * are the person's too (giantswarm/backstage#2483, #2501), offered where
 * the installation's cluster-manager takes the arguments.
 *
 * The form is in place from the first paint: every section stands where it
 * will, and a section whose content is still being read holds its place
 * with a placeholder, so an answer fills the form in instead of moving it
 * (giantswarm/backstage#2501). The review shows the same choices and the
 * manifests; Deploy sends them as chosen. The portal composes nothing: what
 * the review shows is exactly what cluster-manager would write.
 *
 * The app's standard form: one column; the knobs whose defaults fit most
 * pools — the maximum GPUs and the zones — under More options, its summary
 * saying what they are set to (the cache, a monthly bill, stays in sight).
 * Review stays pressable while no dry run is under way: a blocked Review
 * marks each field that is wrong, under it, opens More options where one is
 * in there, and moves the focus to the first (`useFieldValidation`).
 */
export function AddGpuNodePoolPage({
  installations,
  closeHref,
  onDeployed,
}: AddGpuNodePoolPageProps) {
  const [installation, setInstallation] = useState<string | undefined>(
    installations[0],
  );
  const [clusterName, setClusterName] = useState<string>();
  const [name, setName] = useState('');
  const [accelerator, setAccelerator] = useState<string>(
    DEFAULT_ACCELERATORS[0],
  );
  const [maxGpus, setMaxGpus] = useState(4);
  /** The zones the nodes may launch in: every zone of the picked cluster until some are unchecked. */
  const [zones, setZones] = useState<string[]>([]);
  /** Whether the pool's serving slice keeps a model cache claim: off until asked for. */
  const [cache, setCache] = useState(false);
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
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const fieldScope = useRef<HTMLDivElement>(null);
  const validation = useFieldValidation(fieldScope);

  const {
    clusters,
    clusterApiNote: noClusterApi,
    isLoading: clustersLoading,
    error: clustersError,
  } = useManagedClusters(installation, 'environment');
  const { info } = useClusterManagerInfo(installation);
  const { schema, isLoading: schemaLoading } =
    useCreateNodePoolSchema(installation);
  const accelerators = schema?.accelerators ?? DEFAULT_ACCELERATORS;
  /**
   * The two choices this installation's cluster-manager takes — in place
   * while the schema is read, so nothing appears later; an older
   * cluster-manager shows neither.
   */
  const offers = useMemo(
    () => ({
      zones: schema ? offersArgument(schema, ZONES_ARGUMENT) : schemaLoading,
      cache: schema ? offersArgument(schema, CACHE_ARGUMENT) : schemaLoading,
    }),
    [schema, schemaLoading],
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
  /** A cluster picked: its sizes and presets are read anew, its zones are every zone; the cache choice stands. */
  const pickCluster = (next: string | undefined) => {
    setClusterName(next);
    resetChoice();
    setZones(clusters.find(candidate => candidate.name === next)?.zones ?? []);
  };

  // One cluster on the installation: it is picked as the form opens, so its
  // sizes, prices, presets and zones are there by the time the form is read.
  useEffect(() => {
    if (!clusterName && clusters.length === 1) {
      pickCluster(clusters[0].name);
    }
    // `pickCluster` closes over the same `clusters`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusters, clusterName]);

  const cluster = useMemo(
    () => clusters.find(candidate => candidate.name === clusterName),
    [clusters, clusterName],
  );
  const clusterZones = cluster?.zones ?? [];
  /**
   * A cluster that keeps a model cache: every pool serves from it and
   * cluster-manager refuses `cache: false`, so the switch stands on and the
   * dry run carries the cache on whatever the person's choice was
   * (giantswarm/backstage#2493).
   */
  const cacheKept = cacheKeptByCluster(cluster);
  const cacheChoice = cacheKept || cache;
  /** Zones offered, the cluster names some and none is picked: the form waits for at least one. */
  const zonesMissing =
    offers.zones && clusterZones.length > 0 && zones.length === 0;

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
      // Only what the installation's cluster-manager takes: the zones as
      // chosen (every zone of the cluster by default), the cache as chosen.
      ...(offers.zones && zones.length > 0 ? { zones } : {}),
      ...(offers.cache ? { cache: cacheChoice } : {}),
    };
  }, [cluster, name, accelerator, maxGpus, offers, zones, cacheChoice]);

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
    if (!sizingInput) {
      setReview(undefined);
      setJudging(false);
      return undefined;
    }
    const seq = rerun.current;
    setJudging(true);
    const timer = setTimeout(() => judge(seq), DRY_RUN_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `judge` closes over the same inputs; another installation is asked anew.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizingInput, sizes, installation]);

  const canCommit = info?.modes.commit === true;
  const notConnected = write.failure?.kind === 'not-connected';
  const isBusy = write.isBusy && !judging;
  const done = Boolean(applied || committed?.commit?.pullRequest);
  const blocker = deployBlocker(review, preset);
  const canReview = Boolean(formInput) && !isBusy && !judging && !zonesMissing;

  // What each field says is wrong with it, once a Review was blocked. The
  // zones and the sizes say it themselves, as soon as none is picked.
  const errors = {
    installation:
      installations.length > 1 && !installation
        ? 'Pick the environment the pool is added on.'
        : undefined,
    cluster: cluster
      ? undefined
      : `${
          !clustersLoading && clusters.length === 0
            ? 'This environment lists no cluster a pool can join.'
            : 'Pick the cluster the pool joins.'
        }`,
    name: poolNameError(name),
  };
  const installationError = useSelectFieldError(
    validation.errorFor('installation', errors.installation),
  );
  const clusterError = useSelectFieldError(
    validation.errorFor('cluster', errors.cluster),
  );

  // More options' one line of what it holds now.
  const moreOptionsSummary = [
    `up to ${countNoun(maxGpus, 'GPU')}`,
    offers.zones && clusterZones.length > 0
      ? describeZonesSummary(zones, clusterZones)
      : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
  const canWrite =
    Boolean(input) &&
    Boolean(review) &&
    !isBusy &&
    !judging &&
    !blocker &&
    !zonesMissing &&
    chosen?.length !== 0;

  /** Review: the current dry run's manifests, or one more try where the last was refused. */
  const onReview = async () => {
    if (isBusy || judging) {
      return;
    }
    if (!canReview) {
      if (zonesMissing) {
        setMoreOptionsOpen(true);
      }
      validation.reveal();
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

  const onForm = step === 'form';
  const groups = review ? groupManifestsByRelease(review) : [];
  const shapeList = shapes?.sizes ?? [];
  const hasShapes = shapeList.length > 0;
  const isCommitted = Boolean(committed?.commit);

  // The step's buttons, in the frame's footer beside its Cancel and Back.
  // The handlers are read through a ref, so the slot updates when what the
  // buttons say or allow changes, not on every keystroke.
  const handlers = useRef({ onReview, onDeploy, onCommit });
  handlers.current = { onReview, onDeploy, onCommit };
  let deployLabel = isBusy ? 'Deploying…' : 'Deploy';
  if (blocker) {
    deployLabel = `Deploy (blocked: ${presetLabel(blocker)} fits no size of this pool)`;
  }
  const actions = useMemo(() => {
    if (onForm) {
      return (
        <Button
          variant="primary"
          isDisabled={isBusy || judging}
          onPress={() => handlers.current.onReview()}
        >
          {judging ? 'Checking…' : 'Review'}
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
          isDisabled={!canCommit || !canWrite}
        >
          Commit
        </Button>
        <Button
          variant="primary"
          onPress={() => handlers.current.onDeploy()}
          isDisabled={!canWrite}
          aria-label={blocker ? deployLabel : undefined}
        >
          {isBusy ? 'Deploying…' : 'Deploy'}
        </Button>
      </>
    );
  }, [
    onForm,
    isBusy,
    judging,
    isCommitted,
    done,
    canCommit,
    canWrite,
    blocker,
    deployLabel,
  ]);
  useProvidePageHeaderActions(actions);

  return (
    <WizardFrame
      title="Add GPU node pool"
      context={HOSTING_FLOW_CONTEXT}
      steps={POOL_STEPS}
      currentStep={step}
      closeHref={closeHref}
      onBack={
        onForm || done
          ? undefined
          : () => {
              if (!isBusy) {
                setStep('form');
              }
            }
      }
      width="medium"
    >
      {onForm ? (
        <WizardStepHeading title="Configure the pool">
          cluster-manager composes the pool, adds a GPU operator and model
          serving where the cluster lacks them, and writes it as you.
        </WizardStepHeading>
      ) : (
        <WizardStepHeading title="Review the pool">
          This is exactly what cluster-manager writes. Deploy applies it now;
          Commit opens a pull request in the repository that owns the cluster.
        </WizardStepHeading>
      )}
      <Flex direction="column" gap="4" ref={fieldScope}>
        {onForm && (
          <Flex direction="column" gap="3">
            {installations.length > 1 && (
              <Select
                label="Environment"
                isRequired
                searchable={searchableIf(installations)}
                options={installations.map(id => ({ id, label: id }))}
                selectedKey={installation ?? null}
                onSelectionChange={key => {
                  if (key) {
                    setInstallation(String(key));
                    setClusterName(undefined);
                    resetChoice();
                    setZones([]);
                  }
                }}
                {...installationError.selectProps}
              />
            )}
            {installationError.message}
            <Flex direction="column" gap="1">
              <Select
                label="Cluster"
                isRequired
                placeholder={clusterPlaceholder(
                  clustersLoading,
                  clusters.length,
                )}
                searchable={searchableIf(clusters)}
                options={clusters.map(candidate => ({
                  id: candidate.name,
                  label: `${candidate.name} (${candidate.organization}${
                    candidate.ownCluster ? ', own cluster' : ''
                  })`,
                }))}
                selectedKey={clusterName ?? null}
                onSelectionChange={key =>
                  pickCluster(key ? String(key) : undefined)
                }
                {...clusterError.selectProps}
              />
              {clusterError.message}
              <Text
                variant="body-small"
                color="secondary"
                data-testid="cluster-marks"
              >
                {cluster ? clusterMarks(cluster).join(' · ') : CLUSTER_PENDING}
              </Text>
            </Flex>
            {!clustersLoading && clusters.length === 0 && noClusterApi && (
              <Alert
                status="info"
                title="No clusters on this environment"
                description={noClusterApi}
                data-testid="cluster-api-note"
              />
            )}
            {clustersError && (
              <Alert
                status="warning"
                title="Could not read the clusters"
                description={clustersError.message}
              />
            )}
            <TextField
              label="Pool name"
              isRequired
              description="Use five to twenty lowercase letters, digits and dashes (gpu00, gpu-l4). The MachinePool is named <cluster>-<name>."
              value={name}
              onChange={setName}
              {...validation.textFieldProps('name', errors.name)}
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
              accelerator={accelerator}
              pending={!sizingInput}
            />
            <PoolPlacementPicker
              part="cache"
              cluster={cluster}
              offers={offers}
              zones={zones}
              onZonesChange={setZones}
              cache={cacheChoice}
              onCacheChange={setCache}
              isBusy={isBusy}
              review={review}
            />
            <MoreOptions
              open={moreOptionsOpen}
              onOpenChange={setMoreOptionsOpen}
              summary={moreOptionsSummary}
            >
              <Text variant="body-small" color="secondary">
                The defaults work for most pools.
              </Text>
              <NumberField
                label="Maximum GPUs"
                description="This limit applies across all nodes of the pool, which scales to zero."
                minValue={1}
                value={maxGpus}
                onChange={value =>
                  setMaxGpus(Number.isFinite(value) ? value : 1)
                }
              />
              <PoolPlacementPicker
                part="zones"
                cluster={cluster}
                offers={offers}
                zones={zones}
                onZonesChange={setZones}
                cache={cacheChoice}
                onCacheChange={setCache}
                isBusy={isBusy}
                review={review}
              />
            </MoreOptions>
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
              clusterZones={clusterZones}
              cache={cacheChoice}
              review={review}
            />
            {groups.map(group => (
              <Flex key={group.name} direction="column" gap="2">
                <Text variant="body-medium">{describeReleaseGroup(group)}</Text>
                <ManifestList manifests={group.manifests} />
              </Flex>
            ))}
            {!canCommit && (
              <Text variant="body-small" color="secondary">
                Commit is not available on this environment's cluster-manager
                yet.
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
              .map(object => `${object.kind} ${object.name}: ${object.action}`)
              .join(' · ')}
          />
        )}
        {committed?.commit && (
          <ClusterManagerCommitOutcome
            commit={committed.commit}
            placeNoun="environment"
          />
        )}
      </Flex>
    </WizardFrame>
  );
}

/** What the pool name field says is wrong with it, if anything. */
function poolNameError(name: string): string | undefined {
  if (!name.trim()) {
    return 'Name the pool.';
  }
  return isValidPoolName(name)
    ? undefined
    : 'Use five to twenty lowercase letters, digits and dashes.';
}

/** The zones as More options' summary says them. */
function describeZonesSummary(zones: string[], clusterZones: string[]): string {
  if (zones.length === 0) {
    return 'no zone picked';
  }
  return everyZone(zones, clusterZones) ? 'every zone' : zones.join(', ');
}

/** The cluster picker's placeholder: reading, nothing to pick, or pick one. */
function clusterPlaceholder(loading: boolean, count: number): string {
  if (loading) {
    return 'Reading clusters…';
  }
  return count === 0 ? 'No clusters' : 'Pick a cluster';
}
