import yaml from 'js-yaml';
import fetch from 'node-fetch';
import { JSONSchema4 } from 'schema-utils/declarations/validate';
import { IResourceInfo } from './getMapiResourcesList';

/**
 * Partial interface of CustomResourceDefinition
 */
interface ICRDPartial {
  kind: 'CustomResourceDefinition';
  spec: {
    group: string;
    versions: { name: string; schema: { openAPIV3Schema: JSONSchema4 } }[];
    names: { kind: string; listKind: string; plural: string; singular: string };
    scope: 'Namespaced' | 'Cluster';
  };
}

/**
 * Partial interface of Kratix Promise
 */
export interface IPromisePartial {
  kind: 'Promise';
  apiVersion: 'platform.kratix.io/v1alpha1';
  spec: {
    api: ICRD;
  };
}

export interface ICRD extends ICRDPartial {}

export interface IPromise extends IPromisePartial {}

export interface ICRDForResource {
  resource: IResourceInfo;
  crd: ICRD;
}

export async function fetchCRD(URL: string): Promise<ICRD> {
  const response = await fetch(URL);
  const data = await response.text();
  const parsedData = yaml.load(data) as ICRD | IPromise;

  if (parsedData.kind === 'Promise') {
    return parsedData.spec.api;
  }

  return parsedData;
}
