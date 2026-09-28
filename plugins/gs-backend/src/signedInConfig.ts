import { RootConfigService } from '@backstage/backend-plugin-api';
import { JsonObject, JsonValue } from '@backstage/types';

/**
 * The configuration the signed-in frontend reads, as paths into app-config.
 * `[]` steps into every element of an array, so `muster.installations[].name`
 * projects the `name` of each installation and nothing else of it. A final
 * `{}` keeps only the keys of a map, so `gs.clusterTokenBroker.targets{}`
 * names the installations with a target and nothing of their credentials.
 *
 * This list is the whole allowlist: a key that is not named here never reaches
 * the browser through `GET /api/gs/config`. The unauthenticated `index.html`
 * carries only what the sign-in page needs (`@visibility frontend` in a
 * `config.d.ts`), so everything else a Giant Swarm plugin reads in the browser
 * is listed here and read through `@giantswarm/backstage-plugin-gs-react`
 * after the main sign-in. Secrets (`@visibility secret`) and the fields the
 * browser has no use for (muster endpoints and headers, broker credentials)
 * stay out.
 */
export const SIGNED_IN_CONFIG_PATHS: readonly string[] = [
  // The fleet: every installation with its base domain, region and pipeline.
  // Deanonymizes customers, which is why it left the public config first.
  'gs.installations',
  // The groups whose members the portal treats as Giant Swarm staff.
  'gs.adminGroups',
  // Its presence switches the frontend to the silent cluster-token broker
  // path; the URL names the broker host. The client id and secret next to it
  // are the backend's alone.
  'gs.clusterTokenBroker.tokenUrl',
  // The installations whose own Dex mints their cluster token: names only,
  // each target's endpoint and client stay with the backend.
  'gs.clusterTokenBroker.targets{}',
  // Link templates on the cluster, deployment and home pages: the fleet's
  // Grafana, Happa and Teleport hostnames.
  'gs.clusterDetails.resources',
  'gs.deploymentDetails.resources',
  'gs.homepage.resources',
  // Presentation of Kubernetes labels and annotations, and the Kubernetes
  // end-of-life table.
  'gs.friendlyAnnotations',
  'gs.friendlyLabels',
  'gs.kubernetesVersions',
  // Tuning knobs of the Kubernetes proxy client, read on its first request.
  'gs.kubernetes.proxyTimeoutMs',
  'gs.kubernetes.proxyMaxConcurrency',
  // The muster installations the portal proxies to: their names enumerate
  // the fleet's codenames, their auth provider names the token to forward.
  // Endpoints, headers and Prometheus servers stay with the proxy.
  'muster.serverName',
  'muster.installations[].name',
  'muster.installations[].authProvider',
  // The chat's welcome copy, the MCP server names with the auth provider that
  // signs requests to them, and the context window shown in the usage bar.
  'aiChat.welcome.title',
  'aiChat.welcome.subtitle',
  'aiChat.welcome.suggestions',
  'aiChat.mcp[].name',
  'aiChat.mcp[].authProvider',
  'aiChat.contextWindow',
  // The repositories the agent create flow discovers skills from.
  'agentPlatform.skills.repositories',
  // Link templates for the Flux sources' Git hosts.
  'flux.gitRepositoryPatterns',
];

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The subtree of `value` under one path: `undefined` when the path is not
 * set. An `[]` segment maps every element of the array, keeping an element
 * without the projected field as `{}` so elements stay aligned across paths.
 */
function project(
  value: JsonValue | undefined,
  segments: readonly string[],
): JsonValue | undefined {
  if (segments.length === 0) {
    return value;
  }
  const [head, ...rest] = segments;
  if (!isObject(value)) {
    return undefined;
  }
  if (head.endsWith('{}')) {
    const key = head.slice(0, -2);
    const map = value[key];
    if (!isObject(map)) {
      return undefined;
    }
    return { [key]: Object.fromEntries(Object.keys(map).map(k => [k, {}])) };
  }
  if (head.endsWith('[]')) {
    const key = head.slice(0, -2);
    const array = value[key];
    if (!Array.isArray(array)) {
      return undefined;
    }
    return {
      [key]: array.map(element => project(element, rest) ?? {}),
    };
  }
  const child = project(value[head], rest);
  return child === undefined ? undefined : { [head]: child };
}

/** Deep-merges two projections: objects by key, arrays element by element. */
function merge(target: JsonValue, source: JsonValue): JsonValue {
  if (Array.isArray(target) && Array.isArray(source)) {
    return target.map((element, index) =>
      index < source.length ? merge(element, source[index]) : element,
    );
  }
  if (isObject(target) && isObject(source)) {
    const merged: JsonObject = { ...target };
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined) {
        continue;
      }
      const existing = merged[key];
      merged[key] = existing === undefined ? value : merge(existing, value);
    }
    return merged;
  }
  return source;
}

/**
 * The parts of `root` named by `paths`, in the same shape. A path that is
 * not set in `root` contributes nothing.
 */
export function projectConfigPaths(
  root: JsonObject,
  paths: readonly string[],
): JsonObject {
  let result: JsonValue = {};
  for (const path of paths) {
    const projected = project(root, path.split('.'));
    if (projected !== undefined) {
      result = merge(result, projected);
    }
  }
  return result as JsonObject;
}

/**
 * The config the signed-in frontend reads, as `GET /api/gs/config` serves it:
 * the `SIGNED_IN_CONFIG_PATHS` of the backend's full configuration.
 */
export function readSignedInConfig(config: RootConfigService): JsonObject {
  return projectConfigPaths(
    config.getOptional<JsonObject>() ?? {},
    SIGNED_IN_CONFIG_PATHS,
  );
}
