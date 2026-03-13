import { MimirQueryResponse } from '../../apis/mimir/types';
import {
  KubeDeploymentSpecReplicas,
  KubeDeploymentStatusReplicasReady,
  KubeStatefulsetReplicas,
  KubeStatefulsetStatusReplicasReady,
  KubeDaemonsetStatusDesiredNumberScheduled,
  KubeDaemonsetStatusNumberReady,
} from '../../apis/mimir/metrics';
import { buildWorkloads, buildOrQuery } from './useMimirWorkloadStatus';

function makeSample(
  metricName: string,
  nameLabel: string,
  nameValue: string,
  value: string,
) {
  return {
    metric: { __name__: metricName, [nameLabel]: nameValue },
    value: [1234567890, value] as [number, string],
  };
}

function makeResponse(
  ...samples: ReturnType<typeof makeSample>[]
): MimirQueryResponse {
  return {
    status: 'success',
    data: { resultType: 'vector', result: samples },
  };
}

describe('buildWorkloads', () => {
  it('returns empty array when both responses are undefined', () => {
    expect(buildWorkloads(undefined, undefined)).toEqual([]);
  });

  it('returns empty array when desired response has no results', () => {
    const empty = makeResponse();
    expect(buildWorkloads(empty, empty)).toEqual([]);
  });

  it('parses a single deployment with matching ready count', () => {
    const desired = makeResponse(
      makeSample(KubeDeploymentSpecReplicas.name, 'deployment', 'my-app', '3'),
    );
    const ready = makeResponse(
      makeSample(
        KubeDeploymentStatusReplicasReady.name,
        'deployment',
        'my-app',
        '2',
      ),
    );

    expect(buildWorkloads(desired, ready)).toEqual([
      {
        kind: 'Deployment',
        name: 'my-app',
        desiredReplicas: 3,
        readyReplicas: 2,
      },
    ]);
  });

  it('defaults readyReplicas to 0 when no matching ready data', () => {
    const desired = makeResponse(
      makeSample(KubeDeploymentSpecReplicas.name, 'deployment', 'my-app', '1'),
    );

    expect(buildWorkloads(desired, undefined)).toEqual([
      {
        kind: 'Deployment',
        name: 'my-app',
        desiredReplicas: 1,
        readyReplicas: 0,
      },
    ]);
  });

  it('parses mixed workload kinds from a combined response', () => {
    const desired = makeResponse(
      makeSample(
        KubeDeploymentSpecReplicas.name,
        'deployment',
        'cert-manager-app',
        '1',
      ),
      makeSample(
        KubeDeploymentSpecReplicas.name,
        'deployment',
        'cert-manager-app-webhook',
        '1',
      ),
      makeSample(
        KubeStatefulsetReplicas.name,
        'statefulset',
        'mimir-ingester',
        '3',
      ),
      makeSample(
        KubeDaemonsetStatusDesiredNumberScheduled.name,
        'daemonset',
        'alloy-logs',
        '5',
      ),
    );
    const ready = makeResponse(
      makeSample(
        KubeDeploymentStatusReplicasReady.name,
        'deployment',
        'cert-manager-app',
        '1',
      ),
      makeSample(
        KubeDeploymentStatusReplicasReady.name,
        'deployment',
        'cert-manager-app-webhook',
        '1',
      ),
      makeSample(
        KubeStatefulsetStatusReplicasReady.name,
        'statefulset',
        'mimir-ingester',
        '3',
      ),
      makeSample(
        KubeDaemonsetStatusNumberReady.name,
        'daemonset',
        'alloy-logs',
        '4',
      ),
    );

    const result = buildWorkloads(desired, ready);

    expect(result).toEqual([
      {
        kind: 'Deployment',
        name: 'cert-manager-app',
        desiredReplicas: 1,
        readyReplicas: 1,
      },
      {
        kind: 'Deployment',
        name: 'cert-manager-app-webhook',
        desiredReplicas: 1,
        readyReplicas: 1,
      },
      {
        kind: 'StatefulSet',
        name: 'mimir-ingester',
        desiredReplicas: 3,
        readyReplicas: 3,
      },
      {
        kind: 'DaemonSet',
        name: 'alloy-logs',
        desiredReplicas: 5,
        readyReplicas: 4,
      },
    ]);
  });

  it('skips samples with unknown metric names', () => {
    const desired = makeResponse({
      metric: { __name__: 'unknown_metric', deployment: 'foo' },
      value: [1234567890, '1'],
    });

    expect(buildWorkloads(desired, undefined)).toEqual([]);
  });

  it('skips samples with missing name label', () => {
    const desired = makeResponse({
      metric: { __name__: KubeDeploymentSpecReplicas.name },
      value: [1234567890, '1'],
    });

    expect(buildWorkloads(desired, undefined)).toEqual([]);
  });

  it('handles NaN values as 0', () => {
    const desired = makeResponse(
      makeSample(
        KubeDeploymentSpecReplicas.name,
        'deployment',
        'my-app',
        'NaN',
      ),
    );
    const ready = makeResponse(
      makeSample(
        KubeDeploymentStatusReplicasReady.name,
        'deployment',
        'my-app',
        'invalid',
      ),
    );

    expect(buildWorkloads(desired, ready)).toEqual([
      {
        kind: 'Deployment',
        name: 'my-app',
        desiredReplicas: 0,
        readyReplicas: 0,
      },
    ]);
  });
});

describe('buildOrQuery', () => {
  it('builds a desired query with or clauses for each workload kind', () => {
    const query = buildOrQuery(
      'cluster_id="test",namespace="default"',
      'my-app',
      'desiredMetric',
    );

    expect(query).toBe(
      `${KubeDeploymentSpecReplicas.name}{cluster_id="test",namespace="default",deployment=~"my-app.*"}` +
        ` or ${KubeStatefulsetReplicas.name}{cluster_id="test",namespace="default",statefulset=~"my-app.*"}` +
        ` or ${KubeDaemonsetStatusDesiredNumberScheduled.name}{cluster_id="test",namespace="default",daemonset=~"my-app.*"}`,
    );
  });

  it('builds a ready query with or clauses for each workload kind', () => {
    const query = buildOrQuery(
      'cluster_id="test",namespace="ns"',
      'prefix',
      'readyMetric',
    );

    expect(query).toBe(
      `${KubeDeploymentStatusReplicasReady.name}{cluster_id="test",namespace="ns",deployment=~"prefix.*"}` +
        ` or ${KubeStatefulsetStatusReplicasReady.name}{cluster_id="test",namespace="ns",statefulset=~"prefix.*"}` +
        ` or ${KubeDaemonsetStatusNumberReady.name}{cluster_id="test",namespace="ns",daemonset=~"prefix.*"}`,
    );
  });
});
