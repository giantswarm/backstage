import { crds } from '@giantswarm/k8s-types';
import { KarpenterMachinePool } from './KarpenterMachinePool';

type KarpenterMachinePoolInterface =
  crds.giantswarm.v1alpha1.KarpenterMachinePool;

function makePool(
  partial: Partial<KarpenterMachinePoolInterface> = {},
): KarpenterMachinePool {
  const json = {
    apiVersion: 'infrastructure.cluster.x-k8s.io/v1alpha1',
    kind: 'KarpenterMachinePool',
    metadata: { name: 'my-pool', namespace: 'org-giantswarm' },
    ...partial,
  } as KarpenterMachinePoolInterface;

  return new KarpenterMachinePool(json, 'installation-1');
}

describe('KarpenterMachinePool', () => {
  describe('with an empty spec', () => {
    it('returns empty arrays from list accessors', () => {
      const pool = makePool();

      expect(pool.getRequirements()).toEqual([]);
      expect(pool.getDisruptionBudgets()).toEqual([]);
      expect(pool.getTaints()).toEqual([]);
      expect(pool.getStartupTaints()).toEqual([]);
      expect(pool.getAmiSelectorTerms()).toEqual([]);
      expect(pool.getAmiAliases()).toEqual([]);
      expect(pool.getBlockDeviceMappings()).toEqual([]);
      expect(pool.getProviderIDs()).toEqual([]);
    });

    it('returns undefined from scalar and object accessors', () => {
      const pool = makePool();

      expect(pool.getNodePoolSpec()).toBeUndefined();
      expect(pool.getEC2NodeClassSpec()).toBeUndefined();
      expect(pool.getLimits()).toBeUndefined();
      expect(pool.getWeight()).toBeUndefined();
      expect(pool.getDisruption()).toBeUndefined();
      expect(pool.getConsolidationPolicy()).toBeUndefined();
      expect(pool.getConsolidateAfter()).toBeUndefined();
      expect(pool.getExpireAfter()).toBeUndefined();
      expect(pool.getTerminationGracePeriod()).toBeUndefined();
      expect(pool.getNodeLabels()).toBeUndefined();
      expect(pool.getNodeAnnotations()).toBeUndefined();
      expect(pool.getAmiFamily()).toBeUndefined();
      expect(pool.getRootVolume()).toBeUndefined();
      expect(pool.getInstanceStorePolicy()).toBeUndefined();
      expect(pool.getDetailedMonitoring()).toBeUndefined();
      expect(pool.getKubeletConfig()).toBeUndefined();
      expect(pool.getMetadataOptions()).toBeUndefined();
      expect(pool.getEc2Tags()).toBeUndefined();
      expect(pool.getIamRole()).toBeUndefined();
      expect(pool.getInstanceProfile()).toBeUndefined();
      expect(pool.getReplicas()).toBeUndefined();
      expect(pool.getStatusConditions()).toBeUndefined();
    });

    it('reports not ready', () => {
      expect(makePool().isReady()).toBe(false);
    });
  });

  describe('nodePool accessors', () => {
    const pool = makePool({
      spec: {
        providerIDList: [
          'aws:///eu-central-1a/i-1',
          'aws:///eu-central-1b/i-2',
        ],
        nodePool: {
          weight: 10,
          limits: { cpu: '1000', memory: '1000Gi' },
          disruption: {
            consolidationPolicy: 'WhenEmptyOrUnderutilized',
            consolidateAfter: '30s',
            budgets: [
              { nodes: '10%' },
              { nodes: '0', schedule: '0 0 * * sat' },
            ],
          },
          template: {
            metadata: {
              labels: { 'giantswarm.io/machine-pool': 'my-pool' },
              annotations: { 'example.com/owner': 'team-a' },
            },
            spec: {
              expireAfter: '720h',
              terminationGracePeriod: '1h',
              requirements: [
                {
                  key: 'karpenter.sh/capacity-type',
                  operator: 'In',
                  values: ['spot', 'on-demand'],
                },
                {
                  key: 'kubernetes.io/arch',
                  operator: 'In',
                  values: ['arm64'],
                },
              ],
              taints: [
                { key: 'dedicated', effect: 'NoSchedule', value: 'gpu' },
              ],
              startupTaints: [
                { key: 'node.cilium.io/agent-not-ready', effect: 'NoExecute' },
              ],
            },
          },
        },
      },
    });

    it('reads requirements verbatim', () => {
      expect(pool.getRequirements()).toHaveLength(2);
      expect(pool.getRequirements()[0]).toEqual({
        key: 'karpenter.sh/capacity-type',
        operator: 'In',
        values: ['spot', 'on-demand'],
      });
    });

    it('reads limits, weight and lifecycle durations', () => {
      expect(pool.getLimits()).toEqual({ cpu: '1000', memory: '1000Gi' });
      expect(pool.getWeight()).toBe(10);
      expect(pool.getExpireAfter()).toBe('720h');
      expect(pool.getTerminationGracePeriod()).toBe('1h');
    });

    it('reads disruption settings', () => {
      expect(pool.getConsolidationPolicy()).toBe('WhenEmptyOrUnderutilized');
      expect(pool.getConsolidateAfter()).toBe('30s');
      expect(pool.getDisruptionBudgets()).toHaveLength(2);
    });

    it('reads taints and node metadata', () => {
      expect(pool.getTaints()).toHaveLength(1);
      expect(pool.getStartupTaints()).toHaveLength(1);
      expect(pool.getNodeLabels()).toEqual({
        'giantswarm.io/machine-pool': 'my-pool',
      });
      expect(pool.getNodeAnnotations()).toEqual({
        'example.com/owner': 'team-a',
      });
    });

    it('exposes provider IDs as a node count', () => {
      expect(pool.getProviderIDs()).toHaveLength(2);
    });
  });

  describe('ec2NodeClass accessors', () => {
    it('reads image, storage and IAM fields', () => {
      const pool = makePool({
        spec: {
          ec2NodeClass: {
            amiFamily: 'AL2023',
            amiSelectorTerms: [{ alias: 'al2023@latest' }, { id: 'ami-123' }],
            instanceStorePolicy: 'RAID0',
            detailedMonitoring: true,
            role: 'my-karpenter-role',
            tags: { 'giantswarm.io/cluster': 'my-cluster' },
            kubelet: { maxPods: 110 },
            metadataOptions: { httpTokens: 'required' },
            securityGroupSelectorTerms: [{ tags: { Name: 'sg' } }],
            subnetSelectorTerms: [{ tags: { Name: 'subnet' } }],
          },
        },
      } as Partial<KarpenterMachinePoolInterface>);

      expect(pool.getAmiFamily()).toBe('AL2023');
      expect(pool.getAmiAliases()).toEqual(['al2023@latest']);
      expect(pool.getInstanceStorePolicy()).toBe('RAID0');
      expect(pool.getDetailedMonitoring()).toBe(true);
      expect(pool.getIamRole()).toBe('my-karpenter-role');
      expect(pool.getEc2Tags()).toEqual({
        'giantswarm.io/cluster': 'my-cluster',
      });
      expect(pool.getKubeletConfig()).toEqual({ maxPods: 110 });
      expect(pool.getMetadataOptions()).toEqual({ httpTokens: 'required' });
    });

    describe('getRootVolume', () => {
      function poolWithMappings(
        mappings: Array<Record<string, unknown>>,
      ): KarpenterMachinePool {
        return makePool({
          spec: {
            ec2NodeClass: {
              amiSelectorTerms: [{ alias: 'al2023@latest' }],
              securityGroupSelectorTerms: [],
              subnetSelectorTerms: [],
              blockDeviceMappings: mappings,
            },
          },
        } as unknown as Partial<KarpenterMachinePoolInterface>);
      }

      it('prefers the mapping flagged as root', () => {
        const pool = poolWithMappings([
          { deviceName: '/dev/xvdb', ebs: { volumeSize: '50Gi' } },
          {
            deviceName: '/dev/xvda',
            rootVolume: true,
            ebs: { volumeSize: '100Gi' },
          },
        ]);

        expect(pool.getRootVolume()?.deviceName).toBe('/dev/xvda');
      });

      it('returns undefined when no mapping is flagged as root', () => {
        // Karpenter resolves the root device against the AMI's root device
        // name, so list position says nothing — picking the first mapping can
        // report a data volume as the root one.
        const pool = poolWithMappings([
          { deviceName: '/dev/xvdb', ebs: { volumeSize: '500Gi' } },
          { deviceName: '/dev/xvda', ebs: { volumeSize: '20Gi' } },
        ]);

        expect(pool.getRootVolume()).toBeUndefined();
      });

      it('returns undefined when there are no mappings', () => {
        expect(poolWithMappings([]).getRootVolume()).toBeUndefined();
      });
    });
  });

  describe('status', () => {
    it('reads replicas, readiness and conditions', () => {
      const pool = makePool({
        status: {
          ready: true,
          replicas: 6,
          conditions: [
            {
              type: 'Ready',
              status: 'True',
              lastTransitionTime: '2026-09-01T00:00:00Z',
            },
          ],
        },
      });

      expect(pool.getReplicas()).toBe(6);
      expect(pool.isReady()).toBe(true);
      expect(pool.getStatusConditions()).toHaveLength(1);
    });
  });
});
