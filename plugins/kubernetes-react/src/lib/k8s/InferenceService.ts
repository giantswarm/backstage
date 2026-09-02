import { KubeObject, KubeObjectInterface } from './KubeObject';
import { sumResourceRequests } from './quantity';

/** A `status.conditions` entry as KServe writes it (knative duck-typed status). */
export type InferenceServiceCondition = {
  type: string;
  status: 'True' | 'False' | 'Unknown' | string;
  reason?: string;
  message?: string;
  severity?: string;
  lastTransitionTime?: string;
};

export type InferenceServiceResources = {
  requests?: Record<string, string>;
  limits?: Record<string, string>;
};

export type InferenceServiceVolumeMount = {
  name: string;
  mountPath: string;
  readOnly?: boolean;
  subPath?: string;
};

export type InferenceServiceContainer = {
  name?: string;
  image?: string;
  command?: string[];
  args?: string[];
  env?: { name: string; value?: string; valueFrom?: unknown }[];
  resources?: InferenceServiceResources;
  volumeMounts?: InferenceServiceVolumeMount[];
};

/**
 * `spec.predictor.model` — the model-format way of declaring a predictor: a
 * `ServingRuntime`/`ClusterServingRuntime` picked by `runtime` (or matched by
 * `modelFormat`) serves the weights found at `storageUri`.
 */
export type InferenceServicePredictorModel = InferenceServiceContainer & {
  modelFormat?: { name: string; version?: string };
  runtime?: string;
  storageUri?: string;
  protocolVersion?: string;
};

export type InferenceServicePredictor = {
  model?: InferenceServicePredictorModel;
  /** Custom-container predictors declare containers instead of `model`. */
  containers?: InferenceServiceContainer[];
  nodeSelector?: Record<string, string>;
  nodeName?: string;
  runtimeClassName?: string;
  tolerations?: Record<string, unknown>[];
  minReplicas?: number;
  maxReplicas?: number;
  deploymentStrategy?: { type?: string };
  /** Request timeout KServe writes into the predictor route, in seconds. */
  timeout?: number;
  /** Pod volumes (a `PredictorSpec` embeds a `PodSpec`). */
  volumes?: Record<string, unknown>[];
};

export type InferenceServiceComponentStatus = {
  url?: string;
  restURL?: string;
  grpcURL?: string;
  address?: { url?: string };
  latestReadyRevision?: string;
  latestCreatedRevision?: string;
  traffic?: { revisionName?: string; percent?: number; url?: string }[];
};

export type InferenceServiceModelStatus = {
  transitionStatus?: string;
  states?: { activeModelState?: string; targetModelState?: string };
  lastFailureInfo?: {
    reason?: string;
    message?: string;
    location?: string;
    modelRevisionName?: string;
    time?: string;
    exitCode?: number;
  };
  copies?: { failedCopies?: number; totalCopies?: number };
};

export interface InferenceServiceInterface extends KubeObjectInterface {
  spec?: {
    predictor?: InferenceServicePredictor;
    transformer?: unknown;
    explainer?: unknown;
  };
  status?: {
    observedGeneration?: number;
    conditions?: InferenceServiceCondition[];
    /** The external URL (ingress), when the deployment mode publishes one. */
    url?: string;
    /** The in-cluster address (`http://<name>-predictor.<ns>.svc.cluster.local`). */
    address?: { url?: string };
    components?: Record<string, InferenceServiceComponentStatus>;
    modelStatus?: InferenceServiceModelStatus;
  };
}

/**
 * Condition types KServe sets on an InferenceService. `Ready` is the summary
 * (every component ready and routable); the others explain a `Ready=False`.
 */
export const InferenceServiceConditionType = {
  Ready: 'Ready',
  PredictorReady: 'PredictorReady',
  IngressReady: 'IngressReady',
  RoutesReady: 'RoutesReady',
  LatestDeploymentReady: 'LatestDeploymentReady',
} as const;

/**
 * Readiness of an InferenceService, derived from its status conditions.
 *
 * - `ready` — KServe reports `Ready=True`: the predictor is up and routable.
 * - `notReady` — `Ready` is `False` or `Unknown` (still rolling out, or
 *   failed — the condition's message, or `modelStatus.lastFailureInfo`, says
 *   which).
 * - `pending` — no status written yet, or the status describes an older
 *   generation of the spec. "Not known yet", not "broken".
 */
export type InferenceServiceReadiness = 'ready' | 'notReady' | 'pending';

/**
 * Well-known extended resource name under which the NVIDIA device plugin
 * advertises GPUs, and under which workloads request them.
 */
export const NVIDIA_GPU_RESOURCE = 'nvidia.com/gpu';

function findCondition(
  json: InferenceServiceInterface,
  type: string,
): InferenceServiceCondition | undefined {
  return json.status?.conditions?.find(condition => condition.type === type);
}

/**
 * Derive readiness from raw status. Exported as a free function (not only a
 * method) for callers holding raw list data — same shape as
 * `deriveModelConfigReadiness`.
 *
 * Staleness is only claimed when `status.observedGeneration` is present and
 * behind: absent means "cannot tell".
 */
export function deriveInferenceServiceReadiness(
  json: InferenceServiceInterface,
): InferenceServiceReadiness {
  const conditions = json.status?.conditions;
  if (!conditions?.length) {
    return 'pending';
  }

  const { generation } = json.metadata ?? {};
  const observedGeneration = json.status?.observedGeneration;
  if (
    typeof generation === 'number' &&
    typeof observedGeneration === 'number' &&
    observedGeneration < generation
  ) {
    return 'pending';
  }

  return findCondition(json, InferenceServiceConditionType.Ready)?.status ===
    'True'
    ? 'ready'
    : 'notReady';
}

/**
 * Hostname of a URL, or `undefined` when the value is not a URL. Used to compare
 * endpoints regardless of scheme, port and path.
 */
/**
 * The URL in-cluster clients reach a predictor at. In raw-deployment mode the
 * KServe controller writes `status.address.url` with the ingress `urlScheme`,
 * so a TLS-terminated install publishes
 * `https://<name>-predictor.<ns>.svc.cluster.local` although the predictor
 * Service itself speaks plain HTTP on port 80. A cluster-local host (`*.svc`,
 * `*.svc.*`) without an explicit port therefore always gets `http`; external
 * hosts and explicit ports are kept as published.
 */
export function clusterLocalPredictorUrl(url: string): string {
  const match = /^https:\/\/([^/:?#]+)(\/.*)?$/i.exec(url);
  if (!match) {
    return url;
  }
  const host = match[1];
  const isClusterLocal =
    host.toLowerCase().endsWith('.svc') || host.toLowerCase().includes('.svc.');
  return isClusterLocal ? `http://${host}${match[2] ?? ''}` : url;
}

export function urlHostname(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * KServe InferenceService — one served model: a predictor (runtime + weights at
 * a `storageUri`) with its own Service and, depending on the deployment mode,
 * an ingress URL. The Agent Platform's Models tab lists them read-only next to
 * the kagent ModelConfigs that front them.
 */
export class InferenceService extends KubeObject<InferenceServiceInterface> {
  static readonly supportedVersions = ['v1beta1'] as const;
  static readonly group = 'serving.kserve.io';
  static readonly kind = 'InferenceService' as const;
  static readonly plural = 'inferenceservices';

  getPredictor() {
    return this.jsonData.spec?.predictor;
  }

  /** Where the weights come from, e.g. `hf://Qwen/Qwen3-14B` or `pvc://…`. */
  getStorageUri() {
    return this.getPredictor()?.model?.storageUri;
  }

  /** The `ServingRuntime`/`ClusterServingRuntime` the predictor names, if any. */
  getRuntime() {
    return this.getPredictor()?.model?.runtime;
  }

  getModelFormat() {
    return this.getPredictor()?.model?.modelFormat?.name;
  }

  /**
   * The node the spec pins the predictor to — an explicit `nodeName`, or a
   * `kubernetes.io/hostname` node selector. Where the pod actually landed is
   * the pod's business; this is the declared intent, useful before (or
   * without) a running pod.
   */
  getPinnedNode(): string | undefined {
    const predictor = this.getPredictor();
    return (
      predictor?.nodeName ?? predictor?.nodeSelector?.['kubernetes.io/hostname']
    );
  }

  /**
   * GPUs the predictor requests, summed over `model` and any custom
   * containers. `undefined` when none declares `nvidia.com/gpu` — a CPU model,
   * or one that leaves the request to its ServingRuntime.
   */
  getGpuRequest(): number | undefined {
    const predictor = this.getPredictor();
    return sumResourceRequests(
      [
        predictor?.model?.resources,
        ...(predictor?.containers ?? []).map(container => container.resources),
      ],
      NVIDIA_GPU_RESOURCE,
    );
  }

  getConditions() {
    return this.jsonData.status?.conditions;
  }

  getReadyCondition() {
    return findCondition(this.jsonData, InferenceServiceConditionType.Ready);
  }

  getReadiness(): InferenceServiceReadiness {
    return deriveInferenceServiceReadiness(this.jsonData);
  }

  /**
   * The best available explanation of a non-ready state: the `Ready`
   * condition's message, else the last model-load failure KServe recorded,
   * else the message of the first failing component condition.
   */
  getReadinessMessage(): string | undefined {
    const ready = this.getReadyCondition();
    if (ready?.message) {
      return ready.message;
    }
    const failure = this.jsonData.status?.modelStatus?.lastFailureInfo;
    if (failure?.message) {
      return failure.reason
        ? `${failure.reason}: ${failure.message}`
        : failure.message;
    }
    return this.getConditions()?.find(
      condition => condition.status !== 'True' && condition.message,
    )?.message;
  }

  /** The external (ingress) URL, when the deployment mode publishes one. */
  getUrl() {
    return this.jsonData.status?.url;
  }

  /**
   * The in-cluster URL of the predictor: `status.address.url`, falling back
   * to the predictor component's address, with the scheme the predictor
   * Service actually speaks (see {@link clusterLocalPredictorUrl}).
   */
  getInternalUrl(): string | undefined {
    const status = this.jsonData.status;
    const url =
      status?.address?.url ??
      status?.components?.predictor?.address?.url ??
      status?.components?.predictor?.url;
    return url === undefined ? undefined : clusterLocalPredictorUrl(url);
  }

  /**
   * The Service KServe creates for the predictor. Both deployment modes name
   * it `<name>-predictor` in the InferenceService's namespace; this is what an
   * in-cluster client (a kagent ModelConfig's base URL) points at.
   */
  getPredictorServiceName(): string {
    return `${this.getName()}-predictor`;
  }

  /**
   * Every hostname this served model answers on, lower-cased and de-duplicated:
   * the predictor Service's in-cluster DNS names (fully qualified and the
   * shorter `<svc>.<ns>` forms), plus the hostnames of every URL in the status.
   * Compare a client's endpoint hostname against this to tell whether it fronts
   * this InferenceService.
   */
  getEndpointHosts(): string[] {
    const hosts = new Set<string>();
    const namespace = this.getNamespace();
    if (namespace) {
      const service = this.getPredictorServiceName();
      hosts.add(`${service}.${namespace}.svc.cluster.local`);
      hosts.add(`${service}.${namespace}.svc`);
      hosts.add(`${service}.${namespace}`);
    }

    const status = this.jsonData.status;
    const urls = [
      status?.url,
      status?.address?.url,
      ...Object.values(status?.components ?? {}).flatMap(component => [
        component.url,
        component.restURL,
        component.address?.url,
      ]),
    ];
    for (const url of urls) {
      const host = urlHostname(url);
      if (host) {
        hosts.add(host);
      }
    }

    return Array.from(hosts);
  }
}
