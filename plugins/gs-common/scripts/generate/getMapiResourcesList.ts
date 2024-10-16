import yaml from 'js-yaml';
import fs from 'fs/promises';
import path from 'path';

const filePath = path.resolve('scripts', 'generate', 'mapi-resources.yaml');

export interface IResourceInfo {
  /**
   * name of the resource - this will be used as the name
   * for the generated TS interface.
   * Important: this should be give in PascalCase, e.g. `MachinePool`.
   */
  name: string;
  /**
   * apiVersion is the resource's apiVersion, e.g. `cluster.x-k8s.io/v1beta1`.
   */
  apiVersion: string;
  /**
   * crdURL is the URL at which the .yaml file of the CRD can be found.
   */
  crdURL: string;
}

export interface IApiGroupInfo {
  /**
   * apiGroup is the folder name for the api group, e.g. `capi`, `capa`.
   */
  apiGroup: string;
  /**
   * apiVersion is the folder name for the api version, e.g. `v1beta1`, `v1beta2`.
   */
  apiVersion: string;
  /**
   * resources specifies a list of resources for this API group and version.
   */
  resources: IResourceInfo[];
}

export interface IMapiResource {
  /**
   * name of the name of the resource - this will be used as the name
   * for the generated TS interface.
   * Important: this should be give in PascalCase, e.g. `MachinePool`.
   */
  name: string;
  /**
   * crdURL is the URL at which the .yaml file of the CRD can be found.
   */
  crdURL: string;
  /**
   * versions is the resource's apiVersions, e.g. `v1beta1`, `v1beta2`.
   */
  versions: string[];
}

export interface IMapiResourceInfo {
  /**
   * group is the folder name for the api group, e.g. `capi`, `capa`.
   */
  group: string;
  /**
   * resources specifies a list of resources for this API group and version.
   */
  resources: IMapiResource[];
}

export async function getMapiResourcesList(): Promise<IApiGroupInfo[]> {
  const contents = await fs.readFile(filePath);
  const data = yaml.load(contents.toString()) as IMapiResourceInfo[];

  const result: {
    [group: string]: {
      [version: string]: IResourceInfo[];
    };
  } = {};
  data.forEach(({ group, resources }) => {
    resources.forEach(resource => {
      resource.versions.forEach(version => {
        if (!result[group]) {
          result[group] = {};
        }

        if (!result[group][version]) {
          result[group][version] = [];
        }

        result[group][version].push({
          name: resource.name,
          crdURL: resource.crdURL,
          apiVersion: version,
        });
      });
    });
  });

  const mapiResources: IApiGroupInfo[] = Object.entries(result).flatMap(
    ([groupName, group]) => {
      return Object.entries(group).flatMap(([versionName, resources]) => {
        return {
          apiGroup: groupName,
          apiVersion: versionName,
          resources,
        };
      });
    },
  );

  return mapiResources;
}
