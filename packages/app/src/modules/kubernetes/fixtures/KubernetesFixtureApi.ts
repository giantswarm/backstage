import type { KubernetesApi } from '@backstage/plugin-kubernetes-react';
import * as kubernetesReact from '@giantswarm/backstage-plugin-kubernetes-react';
import { sortVersions } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  FIXTURE_INSTALLATIONS,
  isFixtureInstallation,
} from '@giantswarm/backstage-plugin-gs-common';
import type { KubeObjectInterface } from '@giantswarm/backstage-plugin-kubernetes-react';
import { MCPServer, MusterWorkflow } from '@giantswarm/backstage-plugin-muster';
import { musterKubernetesObjectsOf } from '@giantswarm/backstage-plugin-muster/fixtures';
import { agentPlatformKubernetesObjectsOf } from '@giantswarm/backstage-plugin-agent-platform/fixtures';

/**
 * The objects of an installation one plugin's fixtures hold, as its
 * Kubernetes API would list them. A source answers the same array while its
 * objects stay the same, and a new one once a fixture write changed them.
 */
export type FixtureObjectsSource = (
  installation: string,
) => readonly KubeObjectInterface[];

/**
 * The plugins' objects fixture mode serves: muster's MCP servers and
 * workflows, and agent-platform's Agents, their carriers, models and
 * Harnesses.
 */
const FIXTURE_OBJECTS: readonly FixtureObjectsSource[] = [
  musterKubernetesObjectsOf,
  agentPlatformKubernetesObjectsOf,
];

/**
 * The API groups the fixture installation serves beyond the ones every
 * resource class reads: the Agent Platform's (kagent, muster). Groups that
 * turn on other platform components in the installation inventory, model
 * hosting (`serving.kserve.io`) and cluster management (`cluster.x-k8s.io`),
 * are left out until fixtures serve them.
 */
const LEFT_OUT_GROUPS = new Set(['serving.kserve.io', 'cluster.x-k8s.io']);

type Resource = {
  group: string;
  plural: string;
  kind: string;
  isCore: boolean;
  versions: readonly string[];
};

type ObjectsByEntityResponse = Awaited<
  ReturnType<KubernetesApi['getObjectsByEntity']>
>;

type ResourceClass = {
  getGVK(): {
    group: string;
    plural: string;
    isCore: boolean;
    supportedVersions: readonly string[];
  };
  kind?: string;
};

function isResourceClass(value: unknown): value is ResourceClass {
  return (
    typeof value === 'function' &&
    typeof (value as Partial<ResourceClass>).getGVK === 'function' &&
    typeof (value as { plural?: unknown }).plural === 'string'
  );
}

/** Every resource the portal's resource classes read, from the classes. */
function knownResources(): Resource[] {
  return (
    [...Object.values(kubernetesReact), MCPServer, MusterWorkflow] as unknown[]
  )
    .filter(isResourceClass)
    .map(resourceClass => {
      const gvk = resourceClass.getGVK();
      return {
        group: gvk.isCore ? '' : gvk.group,
        plural: gvk.plural,
        kind: resourceClass.kind ?? gvk.plural,
        isCore: gvk.isCore,
        versions: gvk.supportedVersions,
      };
    })
    .filter(resource => !LEFT_OUT_GROUPS.has(resource.group));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function statusResponse(
  code: number,
  reason: string,
  message: string,
): Response {
  return json(
    {
      kind: 'Status',
      apiVersion: 'v1',
      status: 'Failure',
      reason,
      message,
      code,
    },
    code,
  );
}

/**
 * The error of a Kubernetes request fixture mode does not answer. It logs,
 * and the request fails with a 501, so the page shows an error rather than
 * made-up emptiness: extend the fixtures (docs/fixtures.md).
 */
function unhandled(method: string, path: string): Response {
  const message = `Fixture mode does not answer the Kubernetes request ${method} ${path}: extend the fixtures (docs/fixtures.md).`;
  // eslint-disable-next-line no-console
  console.error(message);
  return statusResponse(501, 'NotImplemented', message);
}

/**
 * The Kubernetes API in fixture mode (`gs.fixtures: true`): the fixture
 * installations (`FIXTURE_INSTALLATIONS`), each reachable, serving the API
 * groups of the portal's resource classes (kagent's and muster's among them,
 * not kserve's or Cluster API's) and holding the objects of the plugins'
 * fixtures (`FIXTURE_OBJECTS`). Discovery answers what the classes support, a
 * list or a read answers those objects, and the person may do anything an
 * access review asks about. Any other request fails with a 501 and a console
 * error.
 */
export class KubernetesFixtureApi implements KubernetesApi {
  private readonly resources = knownResources();

  constructor(
    private readonly sources: readonly FixtureObjectsSource[] = FIXTURE_OBJECTS,
  ) {}

  /**
   * Each installation's objects by `<group>/<kind>`, with the arrays the
   * sources answered: gathered again only when a source answers another one.
   */
  private readonly objectsByInstallation = new Map<
    string,
    {
      answers: readonly (readonly KubeObjectInterface[])[];
      index: Map<string, KubeObjectInterface[]>;
    }
  >();

  private indexOf(installation: string): Map<string, KubeObjectInterface[]> {
    const answers = this.sources.map(source => source(installation));
    const cached = this.objectsByInstallation.get(installation);
    if (cached && answers.every((answer, i) => answer === cached.answers[i])) {
      return cached.index;
    }
    const index = new Map<string, KubeObjectInterface[]>();
    for (const object of answers.flat()) {
      const group = object.apiVersion.includes('/')
        ? object.apiVersion.split('/')[0]
        : '';
      const key = `${group}/${object.kind}`;
      index.set(key, [...(index.get(key) ?? []), object]);
    }
    this.objectsByInstallation.set(installation, { answers, index });
    return index;
  }

  /** The installation's objects of one resource, in one namespace or all. */
  private objects(
    installation: string,
    resource: Resource,
    namespace: string | undefined,
  ): KubeObjectInterface[] {
    return (
      this.indexOf(installation).get(`${resource.group}/${resource.kind}`) ?? []
    ).filter(object => {
      const version = object.apiVersion.split('/').pop() ?? '';
      return (
        resource.versions.includes(version) &&
        (namespace === undefined || object.metadata.namespace === namespace)
      );
    });
  }

  async getClusters(): Promise<
    Awaited<ReturnType<KubernetesApi['getClusters']>>
  > {
    return FIXTURE_INSTALLATIONS.map(name => ({
      name,
      authProvider: 'serviceAccount',
    }));
  }

  async getCluster(
    clusterName: string,
  ): Promise<Awaited<ReturnType<KubernetesApi['getCluster']>>> {
    return isFixtureInstallation(clusterName)
      ? { name: clusterName, authProvider: 'serviceAccount' }
      : undefined;
  }

  async getObjectsByEntity(
    _request: Parameters<KubernetesApi['getObjectsByEntity']>[0],
  ): Promise<ObjectsByEntityResponse> {
    return { items: [] };
  }

  async getWorkloadsByEntity(
    _request: Parameters<KubernetesApi['getWorkloadsByEntity']>[0],
  ): Promise<ObjectsByEntityResponse> {
    return { items: [] };
  }

  async getCustomObjectsByEntity(
    _request: Parameters<KubernetesApi['getCustomObjectsByEntity']>[0],
  ): Promise<ObjectsByEntityResponse> {
    return { items: [] };
  }

  async proxy(options: {
    clusterName: string;
    path: string;
    init?: RequestInit;
  }): Promise<Response> {
    const method = (options.init?.method ?? 'GET').toUpperCase();
    const path = options.path.split('?')[0].replace(/\/+$/, '');
    if (!isFixtureInstallation(options.clusterName)) {
      return statusResponse(
        404,
        'NotFound',
        `Fixture mode serves no installation ${options.clusterName}.`,
      );
    }
    if (method === 'POST' && path.endsWith('/selfsubjectaccessreviews')) {
      return this.accessReview(options.init?.body);
    }
    if (method !== 'GET') {
      return unhandled(method, options.path);
    }
    return (
      this.read(options.clusterName, path) ?? unhandled(method, options.path)
    );
  }

  private accessReview(body: BodyInit | null | undefined): Response {
    const review = typeof body === 'string' ? JSON.parse(body) : {};
    return json(
      {
        ...review,
        apiVersion: 'authorization.k8s.io/v1',
        kind: 'SelfSubjectAccessReview',
        status: { allowed: true },
      },
      201,
    );
  }

  /**
   * The API groups the resources belong to, each with every version a class
   * supports, newest first and preferred, as an API server prefers its
   * newest.
   */
  private readonly groups = (() => {
    const versions = new Map<string, Set<string>>();
    for (const resource of this.resources.filter(r => !r.isCore)) {
      const set = versions.get(resource.group) ?? new Set<string>();
      resource.versions.forEach(version => set.add(version));
      versions.set(resource.group, set);
    }
    return [...versions].map(([name, set]) => {
      const groupVersions = sortVersions([...set])
        .reverse()
        .map(version => ({ groupVersion: `${name}/${version}`, version }));
      return {
        name,
        versions: groupVersions,
        preferredVersion: groupVersions[0],
      };
    });
  })();

  private resourceList(group: string, version: string) {
    const resources = this.resources.filter(
      r => r.group === group && r.versions.includes(version),
    );
    if (resources.length === 0) {
      return undefined;
    }
    return {
      kind: 'APIResourceList',
      groupVersion: group ? `${group}/${version}` : version,
      resources: resources.map(r => ({
        name: r.plural,
        singularName: r.kind.toLowerCase(),
        // No `namespaced`: the classes do not say their scope, and nothing
        // in the portal reads it from discovery.
        kind: r.kind,
        verbs: ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'],
      })),
    };
  }

  /** A GET the fixtures answer, or undefined. */
  private read(installation: string, path: string): Response | undefined {
    const segments = path.split('/').filter(Boolean);
    if (path === '/version') {
      return json({
        major: '1',
        minor: '33',
        gitVersion: 'v1.33.0',
        platform: 'linux/amd64',
      });
    }
    if (path === '/apis') {
      return json({
        kind: 'APIGroupList',
        apiVersion: 'v1',
        groups: this.groups,
      });
    }
    let group: string;
    let version: string;
    let rest: string[];
    if (segments[0] === 'api' && segments.length >= 2) {
      [group, version, rest] = ['', segments[1], segments.slice(2)];
    } else if (segments[0] === 'apis' && segments.length >= 2) {
      if (segments.length === 2) {
        const found = this.groups.find(g => g.name === segments[1]);
        return found
          ? json({ kind: 'APIGroup', apiVersion: 'v1', ...found })
          : statusResponse(404, 'NotFound', `No API group ${segments[1]}.`);
      }
      [group, version, rest] = [segments[1], segments[2], segments.slice(3)];
    } else {
      return undefined;
    }
    if (rest.length === 0) {
      const list = this.resourceList(group, version);
      return list
        ? json(list)
        : statusResponse(404, 'NotFound', `No API ${group}/${version}.`);
    }
    // `namespaces/<ns>/<plural>[/<name>]`, `<plural>[/<name>]`, and the
    // namespace `namespaces/<name>` itself.
    const namespaced = rest[0] === 'namespaces' && rest.length >= 3;
    const [plural, name] = namespaced ? rest.slice(2) : rest;
    const resource = this.resources.find(
      r => r.group === group && r.plural === plural,
    );
    if (!resource) {
      return undefined;
    }
    if (!resource.versions.includes(version)) {
      return statusResponse(404, 'NotFound', `No API ${group}/${version}.`);
    }
    const objects = this.objects(
      installation,
      resource,
      namespaced ? rest[1] : undefined,
    );
    if (name) {
      const object = objects.find(o => o.metadata.name === name);
      return object
        ? json(object)
        : statusResponse(404, 'NotFound', `${plural} "${name}" not found`);
    }
    return json({
      apiVersion: group ? `${group}/${version}` : version,
      kind: 'List',
      metadata: { resourceVersion: '1' },
      items: objects,
    });
  }
}
