import { useEffect, useMemo, useRef } from 'react';
import * as yaml from 'js-yaml';
import { Typography } from '@material-ui/core';
import { WarningPanel } from '@backstage/core-components';
import {
  HelmRelease,
  useResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useQueries } from '@tanstack/react-query';
import { useTemplateSecrets } from '@backstage/plugin-scaffolder-react';
import { MultiSourceDeploymentPickerProps } from './schema';
import { useValueFromOptions } from '../hooks/useValueFromOptions';

interface ValuesFromEntry {
  kind: string;
  name: string;
  valuesKey?: string;
  targetPath?: string;
}

/**
 * Scaffolder field extension that fetches deployment data from Kubernetes.
 *
 * When visible, renders a read-only summary showing installation, cluster,
 * and deployment names. When used with `ui:widget: hidden`, renders nothing.
 *
 * Fetches the HelmRelease first, then inspects its `valuesFrom` to determine
 * which ConfigMaps/Secrets to fetch. Supports both single and multiple value
 * sources.
 *
 * Outputs an object with:
 * - currentValues: string (for inline mode or single-source backward compat)
 * - currentValueSources: array of value source objects (for valuesFrom mode)
 * - currentValuesMode: 'inline' | 'valuesFrom'
 *
 * Secret values are stored in the scaffolder secrets context under the key
 * specified by the `secretValuesKey` ui:option.
 */
export const MultiSourceDeploymentPicker = ({
  onChange,
  formContext,
  uiSchema,
}: MultiSourceDeploymentPickerProps) => {
  const {
    installationNameField,
    clusterNameField,
    clusterNamespaceField,
    deploymentNameField,
    deploymentNamespaceField,
    secretValuesKey,
  } = uiSchema?.['ui:options'] ?? {};

  const installationName = useValueFromOptions<string>(
    formContext,
    undefined,
    installationNameField,
  );

  const clusterName = useValueFromOptions<string>(
    formContext,
    undefined,
    clusterNameField,
  );

  const clusterNamespace = useValueFromOptions<string>(
    formContext,
    undefined,
    clusterNamespaceField,
  );

  const deploymentName = useValueFromOptions<string>(
    formContext,
    undefined,
    deploymentNameField,
  );

  const deploymentNamespace = useValueFromOptions<string>(
    formContext,
    undefined,
    deploymentNamespaceField,
  );

  const { setSecrets } = useTemplateSecrets();
  const kubernetesApi = useApi(kubernetesApiRef);

  const cluster = installationName ?? '';
  const namespace = deploymentNamespace ?? clusterNamespace ?? '';
  const name = deploymentName ?? '';

  const enabled = Boolean(cluster) && Boolean(namespace) && Boolean(name);

  const noCacheOptions = { staleTime: 0, gcTime: 0 };

  // Fetch HelmRelease first to inspect valuesFrom
  const { resource: helmRelease } = useResource(
    cluster,
    HelmRelease,
    { name, namespace },
    { enabled, ...noCacheOptions },
  );

  // Determine the configuration mode and extract valuesFrom entries
  const { valuesMode, valuesFrom, warnings } = useMemo(() => {
    const w: string[] = [];

    if (!helmRelease) {
      return {
        valuesMode: undefined,
        valuesFrom: [] as ValuesFromEntry[],
        warnings: w,
      };
    }

    const hasInline = helmRelease.hasInlineValues();
    const entries: ValuesFromEntry[] = helmRelease.getValuesFrom() ?? [];

    if (hasInline && entries.length > 0) {
      w.push(
        'HelmRelease has both inline spec.values and valuesFrom references. Only valuesFrom sources will be loaded for editing.',
      );
    }

    const mode = hasInline && entries.length === 0 ? 'inline' : 'valuesFrom';

    return {
      valuesMode: mode as 'inline' | 'valuesFrom',
      valuesFrom: entries,
      warnings: w,
    };
  }, [helmRelease]);

  // For inline mode, extract the values from spec.values
  const inlineValues = useMemo(() => {
    if (valuesMode !== 'inline' || !helmRelease) return '';
    const values = helmRelease.getValues();
    if (!values || Object.keys(values).length === 0) return '';
    try {
      return yaml.dump(values, { lineWidth: -1 }).trimEnd();
    } catch {
      return '';
    }
  }, [valuesMode, helmRelease]);

  // Fetch all valuesFrom resources (ConfigMaps and Secrets) in parallel
  const resourceQueries = useQueries({
    queries: valuesFrom.map((entry, index) => {
      const resourceKind = entry.kind === 'Secret' ? 'secrets' : 'configmaps';
      const path = `/api/v1/namespaces/${namespace}/${resourceKind}/${entry.name}`;

      return {
        queryKey: [
          'deployment-picker',
          cluster,
          'get',
          resourceKind,
          namespace,
          entry.name,
          index,
        ],
        queryFn: async () => {
          const response = await kubernetesApi.proxy({
            clusterName: cluster,
            path,
          });

          if (!response.ok) {
            throw new Error(
              `Failed to fetch ${entry.kind} ${entry.name}: ${response.statusText}`,
            );
          }

          return response.json();
        },
        enabled:
          enabled && valuesMode === 'valuesFrom' && valuesFrom.length > 0,
        staleTime: 0,
        gcTime: 0,
      };
    }),
  });

  // Build currentValueSources from fetched resources
  const { currentValueSources, secretValuesMap } = useMemo(() => {
    if (valuesMode !== 'valuesFrom' || valuesFrom.length === 0) {
      return { currentValueSources: undefined, secretValuesMap: undefined };
    }

    const sources: Array<{
      kind: 'ConfigMap' | 'Secret';
      name: string;
      valuesKey: string;
      values?: string;
    }> = [];
    const secretMap: Record<string, string> = {};

    valuesFrom.forEach((entry, index) => {
      const query = resourceQueries[index];
      const valuesKey = entry.valuesKey ?? 'values';
      const kind = entry.kind as 'ConfigMap' | 'Secret';

      if (!query?.data) {
        sources.push({ kind, name: entry.name, valuesKey });
        return;
      }

      const resourceData = query.data as Record<string, any>;

      if (kind === 'ConfigMap') {
        const value = resourceData.data?.[valuesKey] ?? '';
        sources.push({ kind, name: entry.name, valuesKey, values: value });
      } else {
        // Secret: data is base64-encoded, stringData is plain text
        const encodedValue = resourceData.data?.[valuesKey] ?? '';
        const decodedValue = encodedValue ? decodeBase64(encodedValue) : '';
        // ConfigMap-like values go in formData, Secret values go in secrets context
        sources.push({ kind, name: entry.name, valuesKey });
        if (decodedValue) {
          secretMap[entry.name] = decodedValue;
        }
      }
    });

    return {
      currentValueSources: sources,
      secretValuesMap:
        Object.keys(secretMap).length > 0 ? secretMap : undefined,
    };
  }, [valuesMode, valuesFrom, resourceQueries]);

  // Track what we last emitted to avoid redundant onChange calls
  const lastEmittedRef = useRef<string>('');

  // Update formData when data changes
  useEffect(() => {
    if (!enabled || !valuesMode) return;

    const result: Record<string, any> = {};

    if (valuesMode === 'inline') {
      result.currentValues = inlineValues || undefined;
    } else if (currentValueSources) {
      result.currentValueSources = currentValueSources;
    }

    const serialized = JSON.stringify(result);
    if (serialized !== lastEmittedRef.current) {
      lastEmittedRef.current = serialized;
      onChange(result);
    }
  }, [enabled, valuesMode, inlineValues, currentValueSources, onChange]);

  // Store secret values in the scaffolder secrets context
  const lastStoredSecretRef = useRef<string>('');

  useEffect(() => {
    if (!secretValuesKey || !secretValuesMap) return;

    const serialized = JSON.stringify(secretValuesMap);
    if (serialized === lastStoredSecretRef.current) return;

    lastStoredSecretRef.current = serialized;
    setSecrets({ [secretValuesKey]: serialized });
  }, [secretValuesMap, secretValuesKey, setSecrets]);

  const showSummary =
    Boolean(installationName) || Boolean(clusterName) || Boolean(name);

  if (!showSummary) {
    return (
      <WarningPanel title="No deployment selected">
        Please select an installation, cluster, and deployment to continue.
      </WarningPanel>
    );
  }

  return (
    <>
      <Typography variant="body2">
        You are editing the configuration for the{' '}
        <strong>
          <code>{name}</code>
        </strong>{' '}
        deployment on{' '}
        <strong>
          <code>
            {installationName}/{clusterName}
          </code>
        </strong>{' '}
        cluster.
      </Typography>
      {warnings.length > 0 && (
        <WarningPanel title="Note" message="The following may affect editing:">
          <ul>
            {warnings.map(warning => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </WarningPanel>
      )}
    </>
  );
};

function decodeBase64(value: string): string {
  try {
    return atob(value);
  } catch {
    return value;
  }
}
