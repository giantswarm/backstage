/*
 * Prunes runtime-dead files from the image's node_modules tree. Runs in the
 * Dockerfile build stage (bind-mounted, never part of a layer), so the
 * deletions never become whiteout layers — the runtime stage's single
 * COPY --from=build only ever sees the pruned tree.
 *
 * What goes:
 *   - *.map source maps under node_modules (only read by debuggers).
 *   - *.d.ts / *.d.cts / *.d.mts under node_modules (only read by compilers)
 *     EXCEPT the config schema closure described below.
 *   - isolated-vm's bundled source tarball, C++ sources, vendored V8 headers,
 *     and the prebuilt bindings for every platform other than the one the
 *     image actually loads.
 *   - node-gyp, which is only invoked while yarn install compiles native
 *     modules, never at runtime.
 *
 * What stays — the backend reads these .d.ts files at startup:
 * @backstage/config-loader resolves each installed package's package.json
 * "configSchema" field and compiles the referenced .d.ts files with the
 * `typescript` package (skipLibCheck: false). That compilation loads
 * typescript's own lib.*.d.ts default libraries and follows imports into
 * other packages' declaration files (e.g. @pagerduty/backstage-plugin's
 * config.d.ts imports types from @pagerduty/backstage-plugin-common). This
 * script builds the same TypeScript program config-loader builds at startup
 * and keeps exactly the files that program loads. After pruning it rebuilds
 * the program and fails the build if the compiler's view changed in any way,
 * then runs config-loader's real loadConfigSchema() as a final smoke test.
 */

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const appDir = path.resolve(process.argv[2] || '/app');
const appRequire = createRequire(path.join(appDir, 'noop.js'));

const prunableExts = ['.map', '.d.ts', '.d.cts', '.d.mts'];
const isPrunable = name => prunableExts.some(ext => name.endsWith(ext));

// ---------------------------------------------------------------------------
// Walk the whole /app tree once (without following symlinks), collecting the
// deletion candidates, every package.json "configSchema" .d.ts reference, and
// the node-gyp package directories.
const candidates = [];
const schemaFiles = [];
const nodeGypDirs = [];

function walk(dir, inNodeModules) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(p, inNodeModules || entry.name === 'node_modules');
    } else if (entry.isFile()) {
      if (inNodeModules && isPrunable(entry.name)) candidates.push(p);
      if (entry.name === 'package.json') visitPackageJson(p, inNodeModules);
    }
  }
}

function visitPackageJson(pkgPath, inNodeModules) {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    return;
  }
  const pkgDir = path.dirname(pkgPath);
  if (
    typeof pkg.configSchema === 'string' &&
    pkg.configSchema.endsWith('.d.ts')
  ) {
    const schemaPath = path.resolve(pkgDir, pkg.configSchema);
    if (!fs.existsSync(schemaPath)) {
      fail(
        `${pkgPath} declares configSchema ${pkg.configSchema}, but ${schemaPath} does not exist`,
      );
    }
    schemaFiles.push({ packageName: pkg.name, path: schemaPath });
  }
  if (
    inNodeModules &&
    pkg.name === 'node-gyp' &&
    path.basename(pkgDir) === 'node-gyp' &&
    path.basename(path.dirname(pkgDir)) === 'node_modules'
  ) {
    nodeGypDirs.push(pkgDir);
  }
}

function fail(message) {
  console.error(`prune-node-modules: FATAL: ${message}`);
  process.exit(1);
}

walk(appDir, false);
console.log(
  `prune-node-modules: ${candidates.length} candidate files, ` +
    `${schemaFiles.length} configSchema .d.ts references, ` +
    `${nodeGypDirs.length} node-gyp dirs`,
);

// ---------------------------------------------------------------------------
// Compute the set of files the runtime config schema compilation reads, by
// building the exact TypeScript program @backstage/config-loader builds in
// its compileTsSchemas() — same roots, same compiler options, same typescript
// installation.
const keep = new Set();
let ts;
let diagnosticsBefore;

function loadTypescript() {
  const configLoaderPkg = appRequire.resolve(
    '@backstage/config-loader/package.json',
  );
  const configLoaderRequire = createRequire(configLoaderPkg);
  return configLoaderRequire('typescript');
}

function compilerOptions() {
  // Mirrors @backstage/config-loader dist/schema/collect.cjs.js compileTsSchemas.
  return {
    incremental: false,
    jsx: ts.JsxEmit.Preserve,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    noResolve: false,
    skipDefaultLibCheck: true,
    skipLibCheck: false,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    types: [],
  };
}

function schemaProgram() {
  const rootNames = schemaFiles.map(f => f.path);
  const program = ts.createProgram(rootNames, compilerOptions());
  const diagnostics = [
    ...program.getOptionsDiagnostics(),
    ...program.getGlobalDiagnostics(),
    ...rootNames.flatMap(rootName => {
      const sourceFile = program.getSourceFile(rootName);
      return sourceFile
        ? [
            ...program.getSyntacticDiagnostics(sourceFile),
            ...program.getSemanticDiagnostics(sourceFile),
          ]
        : [];
    }),
  ];
  return {
    files: program
      .getSourceFiles()
      .map(f => path.resolve(f.fileName))
      .sort(),
    diagnostics: diagnostics.map(d =>
      ts.flattenDiagnosticMessageText(d.messageText, '\n'),
    ),
  };
}

if (schemaFiles.length > 0) {
  ts = loadTypescript();
  const before = schemaProgram();
  diagnosticsBefore = before.diagnostics;
  for (const file of before.files) keep.add(file);
  console.log(
    `prune-node-modules: schema compilation loads ${before.files.length} files ` +
      `(${before.diagnostics.length} pre-existing diagnostics)`,
  );

  // Insurance beyond the computed closure, a few MB in total: keep all of
  // typescript's own default libraries (in case a config-loader upgrade
  // changes its compilation target) and anything named config.d.ts (the
  // conventional schema file name).
  const tsLibDir = path.dirname(
    createRequire(
      appRequire.resolve('@backstage/config-loader/package.json'),
    ).resolve('typescript/package.json'),
  );
  for (const name of fs.readdirSync(path.join(tsLibDir, 'lib'))) {
    if (name.endsWith('.d.ts')) keep.add(path.join(tsLibDir, 'lib', name));
  }
}
for (const file of candidates) {
  if (path.basename(file) === 'config.d.ts') keep.add(file);
}

// ---------------------------------------------------------------------------
// isolated-vm: resolve the binding it actually loads (via its own
// node-gyp-build, exactly like its entry point does), then drop the bundled
// npm-pack tarball, the C++ sources, and every other platform's prebuilds.
let isolatedVmFreed = 0;
const isolatedVmDir = path.join(appDir, 'node_modules', 'isolated-vm');
if (fs.existsSync(isolatedVmDir)) {
  const ivmRequire = createRequire(path.join(isolatedVmDir, 'noop.js'));
  const binding = ivmRequire('node-gyp-build').path(isolatedVmDir);
  console.log(`prune-node-modules: isolated-vm binding is ${binding}`);
  const extras = fs
    .readdirSync(isolatedVmDir)
    .filter(
      name =>
        (name.startsWith('isolated-vm-') && name.endsWith('.tgz')) ||
        ['src', 'vendor', 'native-example'].includes(name),
    )
    .map(name => path.join(isolatedVmDir, name));
  const prebuildsDir = path.join(isolatedVmDir, 'prebuilds');
  if (fs.existsSync(prebuildsDir)) {
    for (const name of fs.readdirSync(prebuildsDir)) {
      const platformDir = path.join(prebuildsDir, name);
      if (!binding.startsWith(platformDir + path.sep)) {
        extras.push(platformDir);
      }
    }
  }
  for (const extra of extras) {
    if (binding.startsWith(extra + path.sep) || binding === extra) {
      fail(
        `refusing to delete ${extra}, it contains the loaded binding ${binding}`,
      );
    }
    isolatedVmFreed += treeSize(extra);
    fs.rmSync(extra, { recursive: true, force: true });
  }
  if (!fs.existsSync(binding)) {
    fail(`isolated-vm binding ${binding} vanished during pruning`);
  }
}

function treeSize(p) {
  let stat;
  try {
    stat = fs.lstatSync(p);
  } catch {
    return 0;
  }
  if (stat.isDirectory()) {
    return fs
      .readdirSync(p)
      .reduce((sum, name) => sum + treeSize(path.join(p, name)), 0);
  }
  return stat.size;
}

// ---------------------------------------------------------------------------
// node-gyp is install-time-only (yarn runs it to compile native modules);
// nothing requires it at runtime.
let nodeGypFreed = 0;
for (const dir of nodeGypDirs) {
  nodeGypFreed += treeSize(dir);
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Delete the declaration files and source maps, minus the keep set.
let prunedBytes = 0;
let prunedCount = 0;
let keptCount = 0;
for (const file of candidates) {
  if (keep.has(file)) {
    keptCount += 1;
    continue;
  }
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch {
    continue; // already gone with the isolated-vm/node-gyp removals above
  }
  prunedBytes += stat.size;
  fs.unlinkSync(file);
  prunedCount += 1;
}

// Drop .bin symlinks left dangling by the removals above (node-gyp's CLI).
for (const binDir of findBinDirs(appDir)) {
  for (const name of fs.readdirSync(binDir)) {
    const link = path.join(binDir, name);
    try {
      fs.realpathSync(link);
    } catch {
      fs.unlinkSync(link);
    }
  }
}

function findBinDirs(dir) {
  const result = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return result;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const p = path.join(dir, entry.name);
    if (entry.name === 'node_modules') {
      const bin = path.join(p, '.bin');
      if (fs.existsSync(bin)) result.push(bin);
    }
    result.push(...findBinDirs(p));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Verify: the compiler's view of the config schemas must be unchanged, and
// config-loader's real entry point must still work against the pruned tree.
async function verify() {
  if (schemaFiles.length === 0) return;

  const after = schemaProgram();
  const missing = after.files.filter(f => !keep.has(f));
  if (JSON.stringify(after.diagnostics) !== JSON.stringify(diagnosticsBefore)) {
    fail(
      `config schema diagnostics changed after pruning.\nBefore:\n${diagnosticsBefore.join(
        '\n',
      )}\nAfter:\n${after.diagnostics.join('\n')}`,
    );
  }
  if (missing.length > 0) {
    fail(
      `schema compilation now loads unexpected files:\n${missing.join('\n')}`,
    );
  }

  const { loadConfigSchema } = appRequire('@backstage/config-loader');
  const dependencies = [
    ...new Set(
      schemaFiles
        .map(f => f.packageName)
        .filter(name => {
          try {
            appRequire.resolve(`${name}/package.json`);
            return true;
          } catch {
            return false;
          }
        }),
    ),
  ];
  process.chdir(appDir);
  const schema = await loadConfigSchema({ dependencies });
  const serialized = schema.serialize();
  console.log(
    `prune-node-modules: loadConfigSchema compiled ${dependencies.length} packages ` +
      `after pruning (${serialized.schemas.length} schemas collected)`,
  );
}

verify()
  .then(() => {
    const mb = n => (n / (1024 * 1024)).toFixed(1);
    console.log(
      `prune-node-modules: removed ${prunedCount} declaration/map files (${mb(
        prunedBytes,
      )} MB), isolated-vm extras (${mb(isolatedVmFreed)} MB), node-gyp (${mb(
        nodeGypFreed,
      )} MB); kept ${keptCount} schema-closure files`,
    );
  })
  .catch(error => {
    fail(`post-prune verification failed: ${error.stack || error}`);
  });
