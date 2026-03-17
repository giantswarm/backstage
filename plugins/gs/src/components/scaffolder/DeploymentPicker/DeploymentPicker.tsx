import { useEffect, useMemo, useRef } from 'react';
import { Typography } from '@material-ui/core';
import { WarningPanel } from '@backstage/core-components';
import {
  ConfigMap,
  HelmRelease,
  Secret,
  useResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useTemplateSecrets } from '@backstage/plugin-scaffolder-react';
import { DeploymentPickerProps } from './schema';
import { useValueFromOptions } from '../hooks/useValueFromOptions';

/**
 * Scaffolder field extension that fetches deployment data from Kubernetes.
 *
 * When visible, renders a read-only summary showing installation, cluster,
 * and deployment names. When used with `ui:widget: hidden`, renders nothing.
 *
 * Fetches the HelmRelease first, then inspects its `valuesFrom` to determine
 * which ConfigMap/Secret to fetch. Blocks editing when:
 * - Multiple ConfigMaps or Secrets are referenced
 * - Inline `spec.values` are set
 *
 * Outputs an object with currentValues.
 * Secret values are stored in the scaffolder secrets context under the key
 * specified by the `secretValuesKey` ui:option.
 */
export const DeploymentPicker = ({
  onChange,
  formContext,
  uiSchema,
}: DeploymentPickerProps) => {
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

  // Analyze valuesFrom to determine what to fetch and whether editing is allowed
  const valuesFromAnalysis = useMemo(() => {
    const warnings: string[] = [];

    if (!helmRelease) {
      return {
        canEdit: false,
        warnings,
        configMapName: undefined,
        secretName: undefined,
        configMapValuesKey: 'values.yaml',
        secretValuesKey: 'values.yaml',
      };
    }

    const valuesFrom = helmRelease.getValuesFrom() ?? [];
    const configMaps = valuesFrom.filter(v => v.kind === 'ConfigMap');
    const secrets = valuesFrom.filter(v => v.kind === 'Secret');

    if (configMaps.length > 1) {
      warnings.push(
        `HelmRelease references ${configMaps.length} ConfigMaps in valuesFrom. Only single ConfigMap editing is supported.`,
      );
    }
    if (secrets.length > 1) {
      warnings.push(
        `HelmRelease references ${secrets.length} Secrets in valuesFrom. Only single Secret editing is supported.`,
      );
    }
    if (helmRelease.hasInlineValues()) {
      warnings.push(
        'HelmRelease has inline spec.values set. Editing valuesFrom resources could cause conflicts.',
      );
    }

    const canEdit = warnings.length === 0;

    return {
      canEdit,
      warnings,
      configMapName: configMaps.length === 1 ? configMaps[0].name : undefined,
      secretName: secrets.length === 1 ? secrets[0].name : undefined,
      configMapValuesKey: configMaps[0]?.valuesKey ?? 'values.yaml',
      secretValuesKey: secrets[0]?.valuesKey ?? 'values.yaml',
    };
  }, [helmRelease]);

  const {
    canEdit,
    warnings,
    configMapName,
    secretName,
    configMapValuesKey,
    secretValuesKey: secretDataKey,
  } = valuesFromAnalysis;

  const { resource: configMap } = useResource(
    cluster,
    ConfigMap,
    { name: configMapName ?? '', namespace },
    {
      enabled: enabled && canEdit && Boolean(configMapName),
      ...noCacheOptions,
    },
  );

  const { resource: secret } = useResource(
    cluster,
    Secret,
    { name: secretName ?? '', namespace },
    { enabled: enabled && canEdit && Boolean(secretName), ...noCacheOptions },
  );

  // Extract raw values using the valuesKey from the HelmRelease's valuesFrom entry
  const currentValues = configMap?.getData()?.[configMapValuesKey] ?? '';
  const encodedSecretValues = secret?.getData()?.[secretDataKey] ?? '';

  // Track what we last emitted to avoid redundant onChange calls
  const lastEmittedRef = useRef<string>('');

  // Update formData when configMap/secret data changes
  useEffect(() => {
    if (!enabled || !canEdit) return;

    const result = {
      currentValues: currentValues || undefined,
    };

    const serialized = JSON.stringify(result);
    if (serialized !== lastEmittedRef.current) {
      lastEmittedRef.current = serialized;
      onChange(result);
    }
  }, [enabled, canEdit, currentValues, onChange]);

  // Store secret values in the scaffolder secrets context (never in formData).
  // Re-runs whenever the raw encoded value changes (cache → fresh data).
  const lastStoredSecretRef = useRef<string>('');

  useEffect(() => {
    if (!canEdit || !secretValuesKey || !encodedSecretValues) return;

    // Only update if the encoded value actually changed
    if (encodedSecretValues === lastStoredSecretRef.current) return;

    const decoded = decodeBase64(encodedSecretValues);
    if (decoded) {
      lastStoredSecretRef.current = encodedSecretValues;
      setSecrets({ [secretValuesKey]: decoded });
    }
  }, [canEdit, encodedSecretValues, secretValuesKey, setSecrets]);

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
        <WarningPanel
          title="Deployment editing is not available"
          message="The following issues prevent editing this deployment's values:"
        >
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
