import { KubeObject, KubeObjectInterface } from './KubeObject';
import { sumResourceRequests } from './quantity';
import {
  clusterLocalServiceUrl,
  isClusterLocalHostname,
  urlHostname,
} from './url';

/** A `status.conditions` entry as KServe writes it (knative duck-typed status). */
export type LLMInferenceServiceCondition = {
  type: string;
  status: 'True' | 'False' | 'Unknown' | string;
  reason?: string;
  message?: string;
  severity?: string;
  lastTransitionTime?: string;
};

export type LLMInferenceServiceResources = {
  requests?: Record<string, string>;
  limits?: Record<string, string>;
};

export type LLMInferenceServiceContainer = {
  name?: string;
  image?: string;
  command?: string[];
  args?: string[];
  env?: { name: string; value?: string; valueFrom?: unknown }[];
  resources?: LLMInferenceServiceResources;
  volumeMounts?: {
    name: string;
    mountPath: string;
    readOnly?: boolean;
    subPath?: string;
  }[];
};

/**
 * `spec.template` — what the object adds to the workload pod the controller
 * composes from the well-known `LLMInferenceServiceConfig`s: containers are
 * merged by name onto the template's, so the `main` container here carries
 * the preset's args, env and resources and nothing else.
 */
export type LLMInferenceServiceTemplate = {
  containers?: LLMInferenceServiceContainer[];
  nodeSelector?: Record<string, string>;
  nodeName?: string;
  runtimeClassName?: string;
  tolerations?: Record<string, unknown>[];
  volumes?: Record<string, unknown>[];
};

/** One `status.addresses` entry: where the model answers, as the controller publishes it. */
export type LLMInferenceServiceAddress = {
  name?: string;
  url?: string;
  audience?: string;
};

export interface LLMInferenceServiceInterface extends KubeObjectInterface {
  spec?: {
    model?: {
      /** Where the weights come from: `hf://…`, `pvc://…`, `oci://…`. */
      uri?: string;
      /** The name the model is served under — what the endpoint answers to. */
      name?: string;
      criticality?: string;
    };
    replicas?: number;
    router?: {
      route?: Record<string, unknown>;
      scheduler?: Record<string, unknown>;
      gateway?: Record<string, unknown>;
    };
    template?: LLMInferenceServiceTemplate;
    /** Custom `LLMInferenceServiceConfig`s; the controller picks the well-known ones by the spec's shape. */
    baseRefs?: { name: string }[];
    parallelism?: unknown;
    prefill?: unknown;
    worker?: unknown;
  };
  status?: {
    observedGeneration?: number;
    conditions?: LLMInferenceServiceCondition[];
    /** The route on the models Gateway, once the router has published one. */
    url?: string;
    addresses?: LLMInferenceServiceAddress[];
    appliedConfigs?: {
      name: string;
      namespace: string;
      source: 'Preset' | 'UserRef' | string;
    }[];
    annotations?: Record<string, string>;
  };
}

/**
 * Condition types KServe's llm-d controller sets on an LLMInferenceService.
 * `Ready` is the summary (presets combined, workloads up, router routable);
 * the others explain a `Ready=False`.
 */
export const LLMInferenceServiceConditionType = {
  Ready: 'Ready',
  PresetsCombined: 'PresetsCombined',
  WorkloadsReady: 'WorkloadsReady',
  MainWorkloadReady: 'MainWorkloadReady',
  RouterReady: 'RouterReady',
  HTTPRoutesReady: 'HTTPRoutesReady',
  InferencePoolReady: 'InferencePoolReady',
  GatewaysReady: 'GatewaysReady',
} as const;

/**
 * Readiness of an LLMInferenceService, derived from its status conditions.
 *
 * - `ready` — KServe reports `Ready=True`: the workload is up and routable.
 * - `notReady` — `Ready` is `False` or `Unknown` (still rolling out, or
 *   failed — the condition's message says which).
 * - `pending` — no status written yet, or the status describes an older
 *   generation of the spec. "Not known yet", not "broken".
 */
export type LLMInferenceServiceReadiness = 'ready' | 'notReady' | 'pending';

/**
 * Well-known extended resource name under which the NVIDIA device plugin
 * advertises GPUs, and under which workloads request them.
 */
export const NVIDIA_GPU_RESOURCE = 'nvidia.com/gpu';

function findCondition(
  json: LLMInferenceServiceInterface,
  type: string,
): LLMInferenceServiceCondition | undefined {
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
export function deriveLLMInferenceServiceReadiness(
  json: LLMInferenceServiceInterface,
): LLMInferenceServiceReadiness {
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

  return findCondition(json, LLMInferenceServiceConditionType.Ready)?.status ===
    'True'
    ? 'ready'
    : 'notReady';
}

/**
 * KServe LLMInferenceService (`serving.kserve.io/v1alpha2`, the llm-d control
 * plane) — one served model: the weights at `spec.model.uri`, served under
 * `spec.model.name` by the workload the controller composes from the
 * well-known `LLMInferenceServiceConfig`s and the object's `spec.template`,
 * routed on the models Gateway (`spec.router.route`). The Agent Platform's
 * Models tab lists them next to the kagent ModelConfigs that front them.
 */
export class LLMInferenceService extends KubeObject<LLMInferenceServiceInterface> {
  static readonly supportedVersions = ['v1alpha2'] as const;
  static readonly group = 'serving.kserve.io';
  static readonly kind = 'LLMInferenceService' as const;
  static readonly plural = 'llminferenceservices';

  /**
   * The container the well-known template names — the model server. A
   * preset's args, env and resources are merged onto it by name.
   */
  static readonly MAIN_CONTAINER = 'main';

  /** The port the template's model server listens on. */
  static readonly WORKLOAD_PORT = 8000;

  /**
   * Labels the controller puts on the workload pods it derives: the kind as
   * `part-of`, the object's name as `name`, `workload` as the component.
   */
  static readonly WORKLOAD_POD_LABELS = {
    partOf: 'app.kubernetes.io/part-of',
    name: 'app.kubernetes.io/name',
    component: 'kserve.io/component',
  } as const;

  /** Value of `WORKLOAD_POD_LABELS.partOf` on every workload pod. */
  static readonly WORKLOAD_POD_PART_OF = 'llminferenceservice';

  /** Value of `WORKLOAD_POD_LABELS.component` on every workload pod. */
  static readonly WORKLOAD_POD_COMPONENT = 'workload';

  /**
   * Label selector listing every workload pod of every LLMInferenceService —
   * one list per installation, all namespaces.
   */
  static readonly WORKLOAD_POD_SELECTOR = `${LLMInferenceService.WORKLOAD_POD_LABELS.partOf}=${LLMInferenceService.WORKLOAD_POD_PART_OF}`;

  /** Where the weights come from, e.g. `hf://Qwen/Qwen3-14B`, `pvc://…` or `oci://…`. */
  getModelUri() {
    return this.jsonData.spec?.model?.uri;
  }

  /** The name the model is served under — what the endpoint answers to. */
  getModelName() {
    return this.jsonData.spec?.model?.name;
  }

  getReplicas() {
    return this.jsonData.spec?.replicas;
  }

  getTemplate() {
    return this.jsonData.spec?.template;
  }

  /** The `main` container of the template — the model server's args, env and resources. */
  getMainContainer(): LLMInferenceServiceContainer | undefined {
    return this.getTemplate()?.containers?.find(
      container => container.name === LLMInferenceService.MAIN_CONTAINER,
    );
  }

  /**
   * The node the spec pins the workload to — an explicit `nodeName`, or a
   * `kubernetes.io/hostname` node selector. Where the pod actually landed is
   * the pod's business; this is the declared intent, useful before (or
   * without) a running pod.
   */
  getPinnedNode(): string | undefined {
    const template = this.getTemplate();
    return (
      template?.nodeName ?? template?.nodeSelector?.['kubernetes.io/hostname']
    );
  }

  /**
   * Accelerators the workload requests under `resource`, summed over the
   * template's containers. `undefined` when none declares the resource — a
   * CPU model, or one that leaves the request to the well-known template.
   */
  getGpuRequest(resource: string = NVIDIA_GPU_RESOURCE): number | undefined {
    return sumResourceRequests(
      (this.getTemplate()?.containers ?? []).map(
        container => container.resources,
      ),
      resource,
    );
  }

  getConditions() {
    return this.jsonData.status?.conditions;
  }

  getReadyCondition() {
    return findCondition(this.jsonData, LLMInferenceServiceConditionType.Ready);
  }

  getReadiness(): LLMInferenceServiceReadiness {
    return deriveLLMInferenceServiceReadiness(this.jsonData);
  }

  /**
   * The short word for a non-ready state, found the way
   * {@link getReadinessMessage} finds the explanation: the `Ready`
   * condition's reason, else the reason of the first failing condition.
   * `undefined` while ready, and when nothing names one.
   */
  getReadinessReason(): string | undefined {
    const ready = this.getReadyCondition();
    if (ready?.status === 'True') {
      return undefined;
    }
    if (ready?.reason) {
      return ready.reason;
    }
    return this.getConditions()?.find(
      condition => condition.status !== 'True' && condition.reason,
    )?.reason;
  }

  /**
   * The best available explanation of a non-ready state: the `Ready`
   * condition's message, else the message of the first failing condition.
   */
  getReadinessMessage(): string | undefined {
    const ready = this.getReadyCondition();
    if (ready?.message) {
      return ready.message;
    }
    return this.getConditions()?.find(
      condition => condition.status !== 'True' && condition.message,
    )?.message;
  }

  /** The route on the models Gateway, once the router has published one. */
  getUrl() {
    return this.jsonData.status?.url;
  }

  getAddresses(): LLMInferenceServiceAddress[] {
    return this.jsonData.status?.addresses ?? [];
  }

  /**
   * The Service the controller creates for the workload:
   * `<name>-kserve-workload-svc` in the object's namespace, on
   * {@link WORKLOAD_PORT}. Where the model answers before the router has
   * published its route, and for good on an installation without a models
   * Gateway.
   */
  getWorkloadServiceName(): string {
    return `${this.getName()}-kserve-workload-svc`;
  }

  getWorkloadServiceUrl(): string {
    return `http://${this.getWorkloadServiceName()}.${
      this.getNamespace() ?? 'default'
    }.svc.cluster.local:${LLMInferenceService.WORKLOAD_PORT}`;
  }

  /**
   * The address clients reach the model at: the route KServe published
   * (`status.url`), else the first published address, else the workload
   * Service — a cluster-local address in the http scheme the Service speaks
   * (see {@link clusterLocalServiceUrl}).
   */
  getServedUrl(): string {
    const published =
      this.getUrl() ?? this.getAddresses().find(address => address.url)?.url;
    return published
      ? clusterLocalServiceUrl(published.replace(/\/+$/, ''))
      : this.getWorkloadServiceUrl();
  }

  /**
   * The published URL outside the cluster — the route on the models Gateway
   * — when there is one; `undefined` while the router has published nothing,
   * or only a cluster-local address.
   */
  getExternalUrl(): string | undefined {
    const url = this.getUrl();
    const host = urlHostname(url);
    return url && host && !isClusterLocalHostname(host) ? url : undefined;
  }

  /**
   * Every hostname this served model answers on, lower-cased and
   * de-duplicated: the workload Service's in-cluster DNS names (fully
   * qualified and the shorter `<svc>.<ns>` forms), plus the hostnames of every
   * URL in the status — the models Gateway's among them, which every routed
   * model shares (a client on it is told apart by the route's path,
   * `/<namespace>/<name>`).
   */
  getEndpointHosts(): string[] {
    const hosts = new Set<string>();
    const namespace = this.getNamespace();
    if (namespace) {
      const service = this.getWorkloadServiceName();
      hosts.add(`${service}.${namespace}.svc.cluster.local`);
      hosts.add(`${service}.${namespace}.svc`);
      hosts.add(`${service}.${namespace}`);
    }
    for (const url of [
      this.getUrl(),
      ...this.getAddresses().map(address => address.url),
    ]) {
      const host = urlHostname(url);
      if (host) {
        hosts.add(host);
      }
    }
    return Array.from(hosts);
  }
}
