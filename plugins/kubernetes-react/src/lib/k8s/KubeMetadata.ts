import { KubeManagedFieldsEntry } from './KubeManagedFieldsEntry';
import { KubeOwnerReference } from './KubeOwnerReference';
import { StringDict } from './StringDict';

export interface KubeMetadata {
  annotations?: StringDict;
  creationTimestamp: string;
  deletionGracePeriodSeconds?: number;
  deletionTimestamp?: string;
  finalizers?: string[];
  generateName?: string;
  generation?: number;
  labels?: StringDict;
  managedFields?: KubeManagedFieldsEntry[];
  name: string;
  namespace?: string;
  ownerReferences?: KubeOwnerReference[];
  resourceVersion?: string;
  selfLink?: string;
  uid: string;
  apiVersion?: any;
}
