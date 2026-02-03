import {
  App,
  HelmRelease,
  OCIRepository,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { findHelmChartName } from './findHelmChartName';

// Helper to create mock App instances
function createMockApp(spec: { name?: string } | undefined): App {
  const json = {
    apiVersion: 'application.giantswarm.io/v1alpha1',
    kind: 'App',
    metadata: {
      name: 'test-app',
      namespace: 'default',
    },
    spec,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new App(json as any, 'test-installation');
}

// Helper to create mock HelmRelease instances
function createMockHelmRelease(options: {
  chart?: { spec?: { chart?: string } };
  chartRef?: {
    apiVersion?: string;
    kind?: 'OCIRepository' | 'HelmChart' | 'ExternalArtifact';
    name?: string;
    namespace?: string;
  };
}): HelmRelease {
  const json = {
    apiVersion: 'helm.toolkit.fluxcd.io/v2',
    kind: 'HelmRelease',
    metadata: {
      name: 'test-helmrelease',
      namespace: 'default',
    },
    spec: {
      chart: options.chart,
      chartRef: options.chartRef,
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new HelmRelease(json as any, 'test-installation');
}

// Helper to create mock OCIRepository instances
function createMockOCIRepository(url: string | undefined): OCIRepository {
  const json = {
    apiVersion: 'source.toolkit.fluxcd.io/v1beta2',
    kind: 'OCIRepository',
    metadata: {
      name: 'test-ocirepository',
      namespace: 'default',
    },
    spec: {
      url,
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new OCIRepository(json as any, 'test-installation');
}

describe('findHelmChartName', () => {
  describe('App resources', () => {
    it('returns spec.name when available', () => {
      const app = createMockApp({ name: 'my-chart' });

      const result = findHelmChartName(app);

      expect(result).toBe('my-chart');
    });

    it('returns undefined when spec.name is missing', () => {
      const app = createMockApp({});

      const result = findHelmChartName(app);

      expect(result).toBeUndefined();
    });

    it('returns undefined when spec is missing', () => {
      const app = createMockApp(undefined);

      const result = findHelmChartName(app);

      expect(result).toBeUndefined();
    });
  });

  describe('HelmRelease with inline chart', () => {
    it('returns spec.chart.spec.chart when chart is defined', () => {
      const helmRelease = createMockHelmRelease({
        chart: { spec: { chart: 'inline-chart' } },
      });

      const result = findHelmChartName(helmRelease);

      expect(result).toBe('inline-chart');
    });

    it('returns undefined when chart spec is missing', () => {
      const helmRelease = createMockHelmRelease({
        chart: { spec: {} },
      });

      const result = findHelmChartName(helmRelease);

      expect(result).toBeUndefined();
    });

    it('returns undefined when chart is empty', () => {
      const helmRelease = createMockHelmRelease({
        chart: {},
      });

      const result = findHelmChartName(helmRelease);

      expect(result).toBeUndefined();
    });
  });

  describe('HelmRelease with OCIRepository', () => {
    it('extracts chart name from standard URL', () => {
      const helmRelease = createMockHelmRelease({
        chartRef: {
          kind: 'OCIRepository',
          name: 'my-oci-repo',
          namespace: 'default',
        },
      });
      const ociRepository = createMockOCIRepository(
        'oci://ghcr.io/org/charts/podinfo',
      );

      const result = findHelmChartName(helmRelease, ociRepository);

      expect(result).toBe('podinfo');
    });

    it('handles URL with trailing slash', () => {
      const helmRelease = createMockHelmRelease({
        chartRef: {
          kind: 'OCIRepository',
          name: 'my-oci-repo',
          namespace: 'default',
        },
      });
      const ociRepository = createMockOCIRepository(
        'oci://ghcr.io/org/charts/podinfo/',
      );

      const result = findHelmChartName(helmRelease, ociRepository);

      expect(result).toBe('podinfo');
    });

    it('handles URL with query parameters', () => {
      const helmRelease = createMockHelmRelease({
        chartRef: {
          kind: 'OCIRepository',
          name: 'my-oci-repo',
          namespace: 'default',
        },
      });
      const ociRepository = createMockOCIRepository(
        'oci://ghcr.io/org/charts/podinfo?version=1.0.0',
      );

      const result = findHelmChartName(helmRelease, ociRepository);

      expect(result).toBe('podinfo');
    });

    it('handles URL with trailing slash and query parameters', () => {
      const helmRelease = createMockHelmRelease({
        chartRef: {
          kind: 'OCIRepository',
          name: 'my-oci-repo',
          namespace: 'default',
        },
      });
      const ociRepository = createMockOCIRepository(
        'oci://ghcr.io/org/charts/podinfo/?version=1.0.0',
      );

      const result = findHelmChartName(helmRelease, ociRepository);

      expect(result).toBe('podinfo');
    });

    it('returns undefined when sourceRepository is null', () => {
      const helmRelease = createMockHelmRelease({
        chartRef: {
          kind: 'OCIRepository',
          name: 'my-oci-repo',
          namespace: 'default',
        },
      });

      const result = findHelmChartName(helmRelease, null);

      expect(result).toBeUndefined();
    });

    it('returns undefined when URL is empty', () => {
      const helmRelease = createMockHelmRelease({
        chartRef: {
          kind: 'OCIRepository',
          name: 'my-oci-repo',
          namespace: 'default',
        },
      });
      const ociRepository = createMockOCIRepository('');

      const result = findHelmChartName(helmRelease, ociRepository);

      expect(result).toBeUndefined();
    });

    it('returns undefined when URL is undefined', () => {
      const helmRelease = createMockHelmRelease({
        chartRef: {
          kind: 'OCIRepository',
          name: 'my-oci-repo',
          namespace: 'default',
        },
      });
      const ociRepository = createMockOCIRepository(undefined);

      const result = findHelmChartName(helmRelease, ociRepository);

      expect(result).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('returns undefined for HelmRelease with no chart or chartRef', () => {
      const helmRelease = createMockHelmRelease({});

      const result = findHelmChartName(helmRelease);

      expect(result).toBeUndefined();
    });

    it('prefers inline chart over OCIRepository when both are present', () => {
      const helmRelease = createMockHelmRelease({
        chart: { spec: { chart: 'inline-chart' } },
        chartRef: {
          kind: 'OCIRepository',
          name: 'my-oci-repo',
          namespace: 'default',
        },
      });
      const ociRepository = createMockOCIRepository(
        'oci://ghcr.io/org/charts/oci-chart',
      );

      const result = findHelmChartName(helmRelease, ociRepository);

      expect(result).toBe('inline-chart');
    });
  });
});
