import fs from 'fs/promises';
import path from 'path';
import { ICRDForResource } from './getCRD';
import {
  formatGeneratedFileExport,
  formatFileHeader,
  formatTypesFileHeader,
} from './templates';

export interface IResourceNames {
  kind: string;
  listKind: string;
  plural: string;
}

export const typesFileName = 'types';
export const constantsFileName = 'key';

const baseDirectory = path.resolve('src', 'model');

function getDirPath(apiVersionAlias: string) {
  return path.resolve(baseDirectory, apiVersionAlias);
}

export async function ensureFolder(dir: string): Promise<string> {
  const dirPath = getDirPath(dir);

  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch {
    return Promise.resolve(dirPath);
  }

  return dirPath;
}

export function getResourceNames(
  crdForResource: ICRDForResource,
): IResourceNames {
  return {
    kind: crdForResource.resource.name,
    listKind:
      crdForResource.crd.spec?.names?.listKind ||
      `${crdForResource.resource.name}List`,
    plural:
      crdForResource.crd.spec?.names?.plural ||
      `${crdForResource.resource.name.toLocaleLowerCase()}s`,
  };
}

export async function writeTypes(apiVersionDirPath: string, data: string) {
  const header = formatTypesFileHeader();

  return fs.writeFile(
    path.resolve(apiVersionDirPath, `${typesFileName}.ts`),
    header + data,
  );
}

export async function writeConstants(apiVersionDirPath: string, data: string) {
  const header = formatFileHeader();

  return fs.writeFile(
    path.resolve(apiVersionDirPath, `${constantsFileName}.ts`),
    header + data,
  );
}

export async function writeExports(apiVersionDirPath: string) {
  const header = formatFileHeader();
  let fileContents = '';

  // export constants
  fileContents += formatGeneratedFileExport(constantsFileName);

  // export types
  fileContents += formatGeneratedFileExport(typesFileName);

  await fs.writeFile(
    path.resolve(apiVersionDirPath, 'index.ts'),
    header + fileContents,
  );
}
