export const formDataRegexp = /^[a-z0-9]+\/[a-z]([-a-z0-9]*[a-z0-9])?$/;

export function serializeClusterPickerFormData(
  installationName: string,
  clusterName: string,
) {
  return `${installationName}/${clusterName}`;
}

export function parseClusterPickerFormData(formData?: string) {
  if (typeof formData === 'undefined' || !formData.match(formDataRegexp)) {
    return { installationName: undefined, clusterName: undefined };
  }

  const [installationName, clusterName] = formData.split('/');

  return {
    installationName,
    clusterName,
  };
}
