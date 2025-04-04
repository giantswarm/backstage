export const autoGeneratedWarningMessage = `/**
 * This file was automatically generated, PLEASE DO NOT MODIFY IT BY HAND.
 */`;

export function formatGeneratedFileExport(fileName: string) {
  return `export * from './${fileName}';
`;
}

export function formatInterfaceName(resourceName: string): string {
  return `I${resourceName[0].toLocaleUpperCase()}${resourceName.slice(1)}`;
}

export function formatTypesFileHeader(): string {
  return `${autoGeneratedWarningMessage}
  
  import * as metav1 from '../../metav1';
  `;
}

export function formatFileHeader(): string {
  return `${autoGeneratedWarningMessage}
`;
}

export function formatResourceKindExport({
  resourceName,
  kind,
}: {
  resourceName: string;
  kind: string;
}) {
  return `export const ${resourceName}Kind = '${kind}';
  `;
}

export function formatResourceApiVersionExport({
  resourceName,
  version,
  group,
}: {
  resourceName: string;
  version: string;
  group: string;
}) {
  return `export const ${resourceName}ApiVersion = '${group}/${version}';
  `;
}

export function formatResourceGVKExport({
  resourceName,
  version,
  group,
  plural,
}: {
  resourceName: string;
  version: string;
  group: string;
  plural: string;
}) {
  return `export const ${resourceName}GVK = {
    apiVersion: '${version}',
    group: '${group}',
    plural: '${plural}',
  };
  `;
}
