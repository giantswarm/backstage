import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The chart budgets one database pool per backend plugin
// (database.postgresql.pool.pluginsWithDatabase): every plugin opens one, for
// its service-to-service keys at least. A plugin added here without raising
// the value would let a rollout outgrow the CNPG cluster's max_connections.
const index = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');
const values = readFileSync(
  resolve(__dirname, '../../../helm/backstage/values.yaml'),
  'utf8',
);

function registeredPackages(): string[] {
  return [
    ...index.matchAll(/backend\.add\(\s*import\(\s*'([^']+)'\s*\)\s*,?\s*\)/g),
  ].map(match => match[1]);
}

// Backend plugins this package defines itself (`./branding`), as opposed to
// the service factories it takes from @internal/backend-common and to its own
// feature loaders (`./searchEngine`), which open no pool of their own.
function registeredLocalPlugins(): string[] {
  const local = new Map(
    [...index.matchAll(/import\s*\{([^}]+)\}\s*from\s*'(\.\/[^']+)'/g)].flatMap(
      match =>
        match[1].split(',').map(name => [name.trim(), match[2]] as const),
    ),
  );
  return [...index.matchAll(/backend\.add\(\s*(\w+)\s*\)/g)]
    .map(match => match[1])
    .filter(name => local.has(name) && isPlugin(name, local.get(name)!));
}

// A plugin's registration is typed `plugin-v<version>` (a module's
// `module-v<version>`); a loader has no registrations of its own.
function isPlugin(name: string, path: string): boolean {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const feature = require(path)[name];
  return (
    feature.featureType === 'registrations' &&
    feature
      .getRegistrations()
      .some((registration: { type: string }) =>
        registration.type.startsWith('plugin'),
      )
  );
}

function role(packageName: string): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(`${packageName}/package.json`).backstage?.role;
}

describe('the chart database budget', () => {
  it('counts every backend plugin the backend registers', () => {
    const plugins = [
      ...registeredPackages().filter(name => role(name) === 'backend-plugin'),
      ...registeredLocalPlugins(),
    ];
    const budgeted = Number(
      /^\s+pluginsWithDatabase: (\d+)$/m.exec(values)?.[1],
    );

    expect(plugins.length).toBeGreaterThan(0);
    expect(budgeted).toBe(plugins.length);
  });
});
