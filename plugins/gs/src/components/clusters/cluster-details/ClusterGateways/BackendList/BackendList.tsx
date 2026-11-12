import { Flex, Text } from '@backstage/ui';
import {
  HttpRouteBackend,
  HttpRouteBackends,
} from '../../../../utils/gatewayTopology';

/**
 * `app:8080`, `other/app:8080` when the backend is in another namespace than
 * the route, and the kind in front when it is not a Service.
 */
export function backendLabel(
  backend: HttpRouteBackend,
  routeNamespace: string,
): string {
  const name =
    backend.namespace === routeNamespace
      ? backend.name
      : `${backend.namespace}/${backend.name}`;
  const address = backend.port ? `${name}:${backend.port}` : name;
  return backend.kind === 'Service' ? address : `${backend.kind} ${address}`;
}

/** The backends of one route, one per line, with the weight of a split. */
export const BackendList = ({
  backends,
  routeNamespace,
}: {
  backends: HttpRouteBackends | undefined;
  routeNamespace: string;
}) => {
  if (!backends) return <>—</>;
  if (backends.status === 'not-available') {
    return (
      <Text variant="body-medium" color="secondary">
        Not available
      </Text>
    );
  }
  if (backends.status === 'not-reported') {
    return (
      <Text variant="body-medium" color="secondary">
        Not reported
      </Text>
    );
  }
  if (backends.backends.length === 0) {
    return (
      <Text variant="body-medium" color="secondary">
        None
      </Text>
    );
  }
  return (
    <Flex direction="column" gap="1">
      {backends.backends.map(backend => {
        const label = backendLabel(backend, routeNamespace);
        return (
          <Text key={label} variant="body-medium">
            {backend.weight ? `${label} · weight ${backend.weight}` : label}
          </Text>
        );
      })}
      {backends.mayHaveMore ? (
        <Text variant="body-small" color="secondary">
          Only the first three backends of each rule are shown.
        </Text>
      ) : null}
    </Flex>
  );
};
