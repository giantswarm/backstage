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

/** One backend per line, cut with an ellipsis, the whole line on hover. */
const line = {
  display: 'block',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

/** The backends of one route, one per line, with the weight of a split. */
export const BackendList = ({
  backends,
  routeNamespace,
}: {
  backends: HttpRouteBackends;
  routeNamespace: string;
}) => {
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
        No backends
      </Text>
    );
  }
  return (
    <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
      {backends.backends.map(backend => {
        const label = backendLabel(backend, routeNamespace);
        const text = backend.weight
          ? `${label} · weight ${backend.weight}`
          : label;
        return (
          <Text key={label} variant="body-medium" style={line} title={text}>
            {text}
          </Text>
        );
      })}
      {backends.mayHaveMore ? (
        <Text variant="body-small" color="secondary">
          This route may have more backends than shown.
        </Text>
      ) : null}
    </Flex>
  );
};
