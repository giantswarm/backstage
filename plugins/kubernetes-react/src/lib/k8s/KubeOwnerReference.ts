export interface KubeOwnerReference {
  apiVersion: string;
  blockOwnerDeletion: boolean;
  controller: boolean;
  kind: string;
  name: string;
  uid: string;
}
