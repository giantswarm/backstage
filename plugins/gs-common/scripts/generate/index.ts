import { error, log } from '../utils';
import { fetchCRD, ICRDForResource } from './getCRD';
import { getMapiResourcesList, IApiGroupInfo } from './getMapiResourcesList';
import { getTypesForResource } from './getTypes';
import {
  formatResourceApiVersionExport,
  formatResourceGVKExport,
} from './templates';
import {
  writeTypes,
  ensureFolder,
  writeExports,
  writeConstants,
} from './write';

async function readMapiResourcesListFile(): Promise<IApiGroupInfo[]> {
  log('Reading MAPI resources list from file... ', false);

  const mapiResources = await getMapiResourcesList();

  log('done.');

  return mapiResources;
}

async function ensureDirs(apiVersionAlias: string): Promise<string> {
  log('  Ensuring directories... ', false);

  const apiDirPath = await ensureFolder(apiVersionAlias);

  log('done.');

  return apiDirPath;
}

async function fetchCRDs(group: IApiGroupInfo): Promise<ICRDForResource[]> {
  log(`  Fetching CRDs...`, false);

  const responses = await Promise.allSettled(
    group.resources.map(r => fetchCRD(r.crdURL)),
  );

  const crdsForResources: ICRDForResource[] = [];
  for (let i = 0; i < responses.length; i++) {
    const resource = group.resources[i];
    const response = responses[i];

    if (response.status === 'rejected') {
      error(
        `Could not fetch CRD for resource ${resource.name}: ${response.reason}`,
      );

      continue;
    }

    crdsForResources.push({ resource: resource, crd: response.value });
  }

  log(`  done.`);

  return crdsForResources;
}

async function generateTypes(
  crdsForResources: ICRDForResource[],
): Promise<string> {
  log(`  Generating TS types...`, false);

  const responses = await Promise.allSettled(
    crdsForResources.map(r =>
      getTypesForResource(r.resource.apiVersion, r.resource.name, r.crd),
    ),
  );

  let data = '';
  for (let i = 0; i < responses.length; i++) {
    const crdForResource = crdsForResources[i];
    const response = responses[i];

    if (response.status === 'rejected') {
      error(
        `Could not generate types for resource ${crdForResource.resource.name}: ${response.reason}`,
      );

      continue;
    }

    data += `\n${response.value}`;
  }

  log(`  done.`);

  return data;
}

function generateConstants(crdsForResources: ICRDForResource[]): string {
  log(`  Generating constants...`, false);

  let data = '';
  for (let i = 0; i < crdsForResources.length; i++) {
    const { resource, crd } = crdsForResources[i];

    const apiVersionExport = formatResourceApiVersionExport({
      resourceName: resource.name,
      version: resource.apiVersion,
      group: crd.spec.group,
    });

    const gvkExport = formatResourceGVKExport({
      resourceName: resource.name,
      version: resource.apiVersion,
      group: crd.spec.group,
      plural: crd.spec.names.plural,
    });

    data += `\n${apiVersionExport}` + `\n${gvkExport}`;
  }

  log(`  done.`);

  return data;
}

async function generate(group: IApiGroupInfo): Promise<void> {
  try {
    log(`${group.apiGroup} ${group.apiVersion}:`);

    const crdsForResources = await fetchCRDs(group);

    const typesData = await generateTypes(crdsForResources);
    const constantsData = generateConstants(crdsForResources);

    const apiVersionDirPath = await ensureDirs(
      `${group.apiGroup}/${group.apiVersion}`,
    );

    log(`  Writing TS types and constants...`);

    await writeTypes(apiVersionDirPath, typesData);
    await writeConstants(apiVersionDirPath, constantsData);

    await writeExports(apiVersionDirPath);

    log(`  done.`);
  } catch (err) {
    error((err as Error).toString());

    return Promise.resolve();
  }

  return Promise.resolve();
}

async function main() {
  try {
    const mapiResources = await readMapiResourcesListFile();

    const generateTasks = mapiResources.map(
      apiGroup => () => generate(apiGroup),
    );

    // Generate TS types and client functions for each API group sequentially
    // eslint-disable-next-line no-inner-declarations
    async function generateNext() {
      const task = generateTasks.shift();
      if (!task) return;

      await task();
      await generateNext();
    }
    await generateNext();
  } catch (err) {
    error((err as Error).toString());
  }
}

main();
