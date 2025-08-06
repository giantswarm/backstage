export interface KubeManagedFieldsEntry {
  apiVersion: string;
  fieldsType: string;
  fieldsV1: object;
  manager: string;
  operation: string;
  subresource: string;
  timestamp: string;
}
