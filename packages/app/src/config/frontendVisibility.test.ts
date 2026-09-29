// This test runs in Node and reads the workspace's schemas and golden file;
// nothing of it is bundled into the app.
// eslint-disable-next-line no-restricted-imports
import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
// eslint-disable-next-line no-restricted-imports
import { join, resolve } from 'path';
import { loadConfigSchema } from '@backstage/config-loader';
import { JsonObject, JsonValue } from '@backstage/types';

/**
 * The public frontend config: every config path the app-backend injects into
 * the unauthenticated `index.html`, read by anyone who can reach the portal.
 *
 * The app's config schema (this package's `config.d.ts` merged with every
 * dependency's) tags each path's visibility; this test enumerates the paths
 * whose effective visibility is `frontend` and compares them with the
 * committed golden file. A new frontend-visible path -- a new field, a new
 * plugin, a dependency bump that widens its schema -- fails here until the
 * golden file is regenerated, so the change shows up in the PR diff for a
 * conscious review. Regenerate with
 *
 *   UPDATE_GOLDEN=1 yarn workspace app test src/config
 *
 * What is public is the sign-in page's needs; everything else a Giant Swarm
 * plugin reads in the browser comes from the authenticated `GET /api/gs/config`
 * (see docs/configuration.md, "What the browser receives").
 */

const GOLDEN_FILE = resolve(__dirname, 'frontendVisiblePaths.golden.json');
const REPO_ROOT = resolve(__dirname, '../../../..');

type SerializedSchema = { packageName: string; value: JsonObject };

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Collects the paths of `schema` whose visibility resolves to `frontend`:
 * their own `visibility`, or the `deepVisibility` of an ancestor when they
 * declare none. `[]` marks an array's elements, `*` an object's dynamic keys.
 */
function collectFrontendPaths(
  schema: JsonValue | undefined,
  path: string,
  inherited: string | undefined,
  out: Set<string>,
): void {
  if (!isObject(schema)) {
    return;
  }
  const visibility = (schema.visibility as string | undefined) ?? inherited;
  const deep = (schema.deepVisibility as string | undefined) ?? inherited;
  if (path && visibility === 'frontend') {
    out.add(path);
  }
  const properties = schema.properties;
  if (isObject(properties)) {
    for (const [key, child] of Object.entries(properties)) {
      collectFrontendPaths(child, path ? `${path}.${key}` : key, deep, out);
    }
  }
  if (isObject(schema.additionalProperties)) {
    collectFrontendPaths(schema.additionalProperties, `${path}.*`, deep, out);
  }
  if (isObject(schema.items)) {
    collectFrontendPaths(schema.items, `${path}[]`, deep, out);
  }
  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    const branches = schema[key];
    if (Array.isArray(branches)) {
      for (const branch of branches) {
        collectFrontendPaths(branch, path, deep, out);
      }
    }
  }
}

/** Every `config.d.ts` of the repository's own packages. */
function ownConfigSchemaFiles(): string[] {
  const files: string[] = [];
  for (const group of ['packages', 'plugins']) {
    for (const name of readdirSync(join(REPO_ROOT, group))) {
      const file = join(REPO_ROOT, group, name, 'config.d.ts');
      try {
        if (statSync(file).isFile()) {
          files.push(file);
        }
      } catch {
        // No schema in this package.
      }
    }
  }
  return files;
}

describe('the public frontend config', () => {
  let schemas: SerializedSchema[];

  beforeAll(async () => {
    const appPackage = JSON.parse(
      readFileSync(resolve(__dirname, '../../package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> };
    // The same schema the build writes for the app-backend: this package's
    // own `config.d.ts` plus every dependency's.
    const schema = await loadConfigSchema({
      dependencies: Object.keys(appPackage.dependencies),
      packagePaths: [resolve(__dirname, '../../package.json')],
    });
    schemas = (schema.serialize() as { schemas: SerializedSchema[] }).schemas;
  }, 120_000);

  it('is exactly the set of paths in the golden file', () => {
    const paths = new Set<string>();
    for (const schema of schemas) {
      collectFrontendPaths(schema.value, '', undefined, paths);
    }
    const actual = [...paths].sort();

    if (process.env.UPDATE_GOLDEN) {
      writeFileSync(GOLDEN_FILE, `${JSON.stringify(actual, null, 2)}\n`);
    }

    const expected = JSON.parse(readFileSync(GOLDEN_FILE, 'utf8')) as string[];
    expect(actual).toEqual(expected);
  });

  it('is never widened by @deepVisibility frontend in one of our schemas', () => {
    // `@deepVisibility frontend` flips the default for a whole subtree, so the
    // next field added under it ships to every visitor unnoticed. Each public
    // field is annotated on its own.
    const offenders = ownConfigSchemaFiles().filter(file =>
      /@deepVisibility\s+frontend/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
