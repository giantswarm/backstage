import type { KubernetesApi } from '@backstage/plugin-kubernetes-react';
import * as kubernetesReact from '@giantswarm/backstage-plugin-kubernetes-react';
import { MCPServer, MusterWorkflow } from '@giantswarm/backstage-plugin-muster';

/** The one installation fixture mode serves, as in `app-config.fixtures.yaml`. */
export const FIXTURE_INSTALLATION = 'meadow';

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
 * The Kubernetes API in fixture mode (`gs.fixtures: true`): one installation,
 * `meadow`, reachable, that serves the API groups of the portal's resource
 * classes (kagent's and muster's among them, not kserve's or Cluster API's)
 * and holds no objects yet. Discovery answers what the classes support, every
 * list is empty, a read of one object is not found, and the person may do
 * anything an access review asks about. Any other request fails with a 501
 * and a console error.
 */
export class KubernetesFixtureApi implements KubernetesApi {
  private readonly resources = knownResources();

  async getClusters(): Promise<
    Awaited<ReturnType<KubernetesApi['getClusters']>>
  > {
    return [{ name: FIXTURE_INSTALLATION, authProvider: 'serviceAccount' }];
  }

  async getCluster(
    clusterName: string,
  ): Promise<Awaited<ReturnType<KubernetesApi['getCluster']>>> {
    return clusterName === FIXTURE_INSTALLATION
      ? { name: FIXTURE_INSTALLATION, authProvider: 'serviceAccount' }
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
    if (options.clusterName !== FIXTURE_INSTALLATION) {
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
    return this.read(path) ?? unhandled(method, options.path);
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

  private groups() {
    const versions = new Map<string, Set<string>>();
    for (const resource of this.resources.filter(r => !r.isCore)) {
      const set = versions.get(resource.group) ?? new Set<string>();
      resource.versions.forEach(version => set.add(version));
      versions.set(resource.group, set);
    }
    return [...versions].map(([name, set]) => {
      const groupVersions = [...set].map(version => ({
        groupVersion: `${name}/${version}`,
        version,
      }));
      return {
        name,
        versions: groupVersions,
        preferredVersion: groupVersions[0],
      };
    });
  }

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
        namespaced: true,
        kind: r.kind,
        verbs: ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'],
      })),
    };
  }

  /** A GET the fixtures answer, or undefined. */
  private read(path: string): Response | undefined {
    const segments = path.split('/').filter(Boolean);
    if (path === '/apis') {
      return json({
        kind: 'APIGroupList',
        apiVersion: 'v1',
        groups: this.groups(),
      });
    }
    let group: string;
    let version: string;
    let rest: string[];
    if (segments[0] === 'api' && segments.length >= 2) {
      [group, version, rest] = ['', segments[1], segments.slice(2)];
    } else if (segments[0] === 'apis' && segments.length >= 2) {
      if (segments.length === 2) {
        const found = this.groups().find(g => g.name === segments[1]);
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
    if (!this.resources.some(r => r.group === group && r.plural === plural)) {
      return undefined;
    }
    if (name) {
      return statusResponse(404, 'NotFound', `${plural} "${name}" not found`);
    }
    return json({
      apiVersion: group ? `${group}/${version}` : version,
      kind: 'List',
      metadata: { resourceVersion: '1' },
      items: [],
    });
  }
}
