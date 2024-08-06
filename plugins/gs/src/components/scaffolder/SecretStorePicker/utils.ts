import { get } from 'lodash';
import { SecretStorePickerUIOptions } from './schema';

export function getInstallationName(
  options: SecretStorePickerUIOptions = {},
  formData: any = {},
) {
  const formDataPath = options.installationNameFormDataPath ?? '';
  const valueFromFormData = get(formData, formDataPath) as string | undefined;
  const valueFromOptions = options.installationName;

  return valueFromOptions ?? valueFromFormData;
}

export function getClusterNamespace(
  options: SecretStorePickerUIOptions = {},
  formData: any = {},
) {
  const formDataPath = options.clusterNamespaceFormDataPath ?? '';
  const valueFromFormData = get(formData, formDataPath) as string | undefined;
  const valueFromOptions = options.clusterNamespace;

  return valueFromOptions ?? valueFromFormData;
}
