import { useEffect, useRef } from 'react';
import {
  ConfigMap,
  Secret,
  useResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useTemplateSecrets } from '@backstage/plugin-scaffolder-react';
import { DeploymentPickerProps } from './schema';
import { useValueFromOptions } from '../hooks/useValueFromOptions';

/**
 * Hidden scaffolder field extension that fetches deployment data from Kubernetes.
 * Renders nothing — purely a data-loading field.
 *
 * Fetches:
 * - ConfigMap `{name}-user-values` for current values (stored in formData)
 * - Secret `{name}-user-secrets` for current secret values (stored via setSecrets, never in formData)
 *
 * Outputs an object with currentValues, hasExistingValues, hasExistingSecrets.
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

  const { resource: configMap } = useResource(
    cluster,
    ConfigMap,
    { name: `${name}-user-values`, namespace },
    { enabled },
  );

  const { resource: secret } = useResource(
    cluster,
    Secret,
    { name: `${name}-user-secrets`, namespace },
    { enabled },
  );

  // Extract raw values — use these as stable dependency signals
  const currentValues = configMap?.getData()?.values ?? '';
  const encodedSecretValues = secret?.getData()?.values ?? '';

  // Track what we last emitted to avoid redundant onChange calls
  const lastEmittedRef = useRef<string>('');

  // Update formData when configMap/secret data changes
  useEffect(() => {
    if (!enabled) return;

    const result = {
      currentValues: currentValues || undefined,
      hasExistingValues: Boolean(currentValues),
      hasExistingSecrets: Boolean(encodedSecretValues),
    };

    const serialized = JSON.stringify(result);
    if (serialized !== lastEmittedRef.current) {
      lastEmittedRef.current = serialized;
      onChange(result);
    }
  }, [enabled, currentValues, encodedSecretValues, onChange]);

  // Store secret values in the scaffolder secrets context (never in formData).
  // Re-runs whenever the raw encoded value changes (cache → fresh data).
  const lastStoredSecretRef = useRef<string>('');

  useEffect(() => {
    if (!secretValuesKey || !encodedSecretValues) return;

    // Only update if the encoded value actually changed
    if (encodedSecretValues === lastStoredSecretRef.current) return;

    const decoded = decodeBase64(encodedSecretValues);
    if (decoded) {
      lastStoredSecretRef.current = encodedSecretValues;
      setSecrets({ [secretValuesKey]: decoded });
    }
  }, [encodedSecretValues, secretValuesKey, setSecrets]);

  // Hidden field - renders nothing
  return null;
};

function decodeBase64(value: string): string {
  try {
    return atob(value);
  } catch {
    return value;
  }
}
