export const secretStoreApiVersion = 'external-secrets.io/v1beta1';
export const clusterSecretStoreApiVersion = 'external-secrets.io/v1beta1';

export const secretStoreGVK = {
  apiVersion: 'v1beta1',
  group: 'external-secrets.io',
  plural: 'secretstores',
};

export const clusterSecretStoreGVK = {
  apiVersion: 'v1beta1',
  group: 'external-secrets.io',
  plural: 'clustersecretstores',
};
