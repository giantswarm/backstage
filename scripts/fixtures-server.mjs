/*
 * Runs the portal in fixture mode (docs/fixtures.md): app-config.yaml and
 * app-config.fixtures.yaml, signed in as the guest, on two free ports of this
 * checkout's own, so several checkouts run it at the same time.
 *
 *   yarn fixtures start [--config <file>]...
 *                          start, or reuse the one running in this checkout;
 *                          prints the portal's URL once it answers. Each
 *                          --config adds a config file on top of fixture
 *                          mode's (a running server keeps its own)
 *   yarn fixtures status   the running server's state, as JSON
 *   yarn fixtures stop     stop it
 *
 * The state is in `.fixtures-server.json` at the checkout's root: the URLs,
 * the ports, the process ids and a token. Only the supervisor writes it when
 * it starts, and a process counts as this checkout's server only while its
 * command line carries the token, so a stale state never makes `stop` signal
 * a process the operating system has given the same id. `start` and `stop`
 * take a lock (`.fixtures-server/lock`), so concurrent starts in one checkout
 * spawn one server. The server stops on its own once no `start` has asked for
 * it for FIXTURES_IDLE_MINUTES (default 60), and at once when the state no
 * longer names it, so it is never left running untracked.
 *
 * The ports come from the operating system, never 3000 or 7007 (another
 * portal's); FIXTURES_APP_PORT and FIXTURES_BACKEND_PORT pick them instead.
 * Both bind 127.0.0.1: a browser in an IPv4-only network namespace cannot
 * reach the frontend on `::1` (e2e/agentlab/README.md, "Against a dev server").
 */

import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const stateFile = path.join(root, '.fixtures-server.json');
const workDir = path.join(root, '.fixtures-server');
const portsConfig = path.join(workDir, 'app-config.ports.yaml');
const logFile = path.join(workDir, 'server.log');
const lockFile = path.join(workDir, 'lock');

const HOST = '127.0.0.1';
const TAKEN_PORTS = new Set([3000, 7007]);
const START_TIMEOUT_MS = 10 * 60 * 1000;
const IDLE_CHECK_MS = 30 * 1000;
const STOP_TIMEOUT_MS = 30 * 1000;
const LOCK_TIMEOUT_MS = 60 * 1000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function idleMinutes() {
  const value = process.env.FIXTURES_IDLE_MINUTES;
  if (value === undefined || value === '') {
    return 60;
  }
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error(
      `FIXTURES_IDLE_MINUTES=${value} is not a number of minutes greater than 0.`,
    );
  }
  return minutes;
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    return undefined;
  }
}

function writeState(state) {
  const temporary = `${stateFile}.${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(temporary, stateFile);
}

/** The command line of a process, or undefined when there is none. */
function commandLine(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return undefined;
  }
  try {
    return execFileSync('ps', ['-o', 'command=', '-p', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

/** Whether `pid` is the supervisor the state names, by its token. */
function isSupervisor(state) {
  return Boolean(state?.token && commandLine(state.pid)?.includes(state.token));
}

/** Whether `pid` is this checkout's dev server, by its ports config path. */
function isDevServer(pid) {
  return Boolean(commandLine(pid)?.includes(portsConfig));
}

/** Holds the checkout's lock while `fn` runs; a dead holder's lock is taken over. */
async function withLock(fn) {
  fs.mkdirSync(workDir, { recursive: true });
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      fs.writeFileSync(lockFile, String(process.pid), { flag: 'wx' });
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
      const holder = Number(fs.readFileSync(lockFile, 'utf8'));
      // Yarn runs the script by a relative path: match its name.
      const holderAlive = commandLine(holder)?.includes('fixtures-server.mjs');
      if (!holderAlive) {
        fs.rmSync(lockFile, { force: true });
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error(
          `Another \`yarn fixtures\` (process ${holder}) holds ${path.relative(root, lockFile)}.`,
        );
      }
      await sleep(250);
    }
  }
  try {
    return await fn();
  } finally {
    fs.rmSync(lockFile, { force: true });
  }
}

async function answers(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch {
    return false;
  }
}

function portIsFree(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, HOST, () => server.close(() => resolve(true)));
  });
}

/** A port the operating system hands out, other than the reserved ones. */
async function freePort(exclude) {
  for (;;) {
    const port = await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once('error', reject);
      server.listen(0, HOST, () => {
        const { port: assigned } = server.address();
        server.close(() => resolve(assigned));
      });
    });
    if (!TAKEN_PORTS.has(port) && !exclude.has(port)) {
      return port;
    }
  }
}

async function choosePort(variable, exclude) {
  const requested = process.env[variable];
  if (!requested) {
    return freePort(exclude);
  }
  const port = Number(requested);
  if (!Number.isInteger(port) || TAKEN_PORTS.has(port) || exclude.has(port)) {
    throw new Error(
      `${variable}=${requested} is not a port fixture mode can use.`,
    );
  }
  if (!(await portIsFree(port))) {
    throw new Error(`${variable}=${requested}: the port is in use.`);
  }
  return port;
}

function portsYaml(appPort, backendPort) {
  const appUrl = `http://${HOST}:${appPort}`;
  const backendUrl = `http://${HOST}:${backendPort}`;
  return `# Written by scripts/fixtures-server.mjs for this checkout's fixture server.
app:
  baseUrl: ${appUrl}
  listen:
    host: ${HOST}
    port: ${appPort}
backend:
  baseUrl: ${backendUrl}
  listen:
    host: ${HOST}
    port: ${backendPort}
  cors:
    origin: ${appUrl}
`;
}

/** The running server of this checkout, or undefined; clears a stale state. */
function running() {
  const state = readState();
  if (!state) {
    return undefined;
  }
  if (isSupervisor(state)) {
    return state;
  }
  fs.rmSync(stateFile, { force: true });
  return undefined;
}

/** Whether the dev server's log says its backend gave up starting. */
function logShowsFailedStart() {
  try {
    return fs.readFileSync(logFile, 'utf8').includes('Backend failed to start');
  } catch {
    return false;
  }
}

/** Resolves once the server answers; rejects with the reason it will not. */
async function waitUntilAnswering(state) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (logShowsFailedStart()) {
      throw new Error(`its backend failed to start; see ${state.log}`);
    }
    if (!isSupervisor(state)) {
      throw new Error(`it exited while starting; see ${state.log}`);
    }
    if (
      (await answers(state.url)) &&
      (await answers(`${state.backendUrl}/.backstage/health/v1/readiness`))
    ) {
      return;
    }
    await sleep(2000);
  }
  throw new Error(
    `it did not answer within ${START_TIMEOUT_MS / 60000} minutes; see ${state.log}`,
  );
}

/** The `--config <file>` arguments of `start`, as absolute paths. */
function extraConfigs(args) {
  // Yarn runs the script from the checkout's root; a relative path means the
  // directory the person ran `yarn fixtures` in.
  const base = process.env.INIT_CWD ?? process.cwd();
  const configs = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] !== '--config' || !args[i + 1]) {
      throw new Error(`Unknown argument ${args[i]}: only --config <file>.`);
    }
    const file = path.resolve(base, args[i + 1]);
    if (!fs.existsSync(file)) {
      throw new Error(`No config file ${file}.`);
    }
    configs.push(file);
    i += 1;
  }
  return configs;
}

/** Spawns the supervisor and waits for it to write the state; under the lock. */
async function spawnServer(configs) {
  const appPort = await choosePort('FIXTURES_APP_PORT', new Set());
  const backendPort = await choosePort(
    'FIXTURES_BACKEND_PORT',
    new Set([appPort]),
  );
  fs.writeFileSync(portsConfig, portsYaml(appPort, backendPort));
  fs.writeFileSync(logFile, '');

  const token = randomBytes(12).toString('hex');
  const planned = {
    url: `http://${HOST}:${appPort}`,
    backendUrl: `http://${HOST}:${backendPort}`,
    appPort,
    backendPort,
    log: path.relative(root, logFile),
    idleMinutes: idleMinutes(),
    configs,
  };
  const log = fs.openSync(logFile, 'a');
  const supervisor = spawn(
    process.execPath,
    [
      import.meta.filename,
      'run',
      '--token',
      token,
      '--plan',
      JSON.stringify(planned),
    ],
    { cwd: root, detached: true, stdio: ['ignore', log, log] },
  );
  supervisor.unref();

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const state = readState();
    if (state?.token === token) {
      return state;
    }
    if (supervisor.exitCode !== null) {
      break;
    }
    await sleep(200);
  }
  throw new Error(`The fixture server did not start; see ${planned.log}.`);
}

async function start() {
  const configs = extraConfigs(process.argv.slice(3));
  const { state, fresh } = await withLock(async () => {
    const existing = running();
    if (existing) {
      const touched = { ...existing, touchedAt: new Date().toISOString() };
      writeState(touched);
      return { state: touched, fresh: false };
    }
    return { state: await spawnServer(configs), fresh: true };
  });
  if (fresh) {
    console.error(`Starting the fixture server (log: ${state.log}) …`);
  }
  try {
    await waitUntilAnswering(state);
  } catch (error) {
    if (fresh) {
      await stopServer({ quiet: true });
      throw new Error(
        `The fixture server did not start: ${error.message}. It is stopped.`,
      );
    }
    throw new Error(
      `The running fixture server does not answer: ${error.message}. Stop it with \`yarn fixtures stop\`.`,
    );
  }
  console.log(state.url);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] : undefined;
}

/**
 * The detached supervisor: writes the state, runs the dev server in a process
 * group of its own, and stops it when stopped itself, once idle, or once the
 * state no longer names it.
 */
function run() {
  const token = argument('--token');
  const plan = JSON.parse(argument('--plan'));
  const child = spawn(
    'yarn',
    [
      'backstage-cli',
      'repo',
      'start',
      '--config',
      path.join(root, 'app-config.yaml'),
      '--config',
      path.join(root, 'app-config.fixtures.yaml'),
      '--config',
      portsConfig,
      ...plan.configs.flatMap(file => ['--config', file]),
    ],
    {
      cwd: root,
      detached: true,
      stdio: 'inherit',
      env: { ...process.env, ENABLE_GUEST_AUTH: '1', BROWSER: 'none' },
    },
  );
  const now = new Date().toISOString();
  writeState({
    ...plan,
    pid: process.pid,
    devServerPid: child.pid,
    token,
    startedAt: now,
    touchedAt: now,
  });

  let stopping = false;
  const stop = reason => {
    if (stopping) return;
    stopping = true;
    console.log(`Stopping the fixture server: ${reason}.`);
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // Already gone.
    }
    setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // Gone.
      }
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => stop('stopped'));
  process.on('SIGINT', () => stop('stopped'));

  const idleCheck = setInterval(() => {
    const state = readState();
    if (state?.token !== token) {
      stop('.fixtures-server.json no longer names it');
      return;
    }
    const touched = Date.parse(state.touchedAt ?? '');
    if (!Number.isFinite(touched)) {
      stop('its state has no readable touchedAt');
    } else if (Date.now() - touched > plan.idleMinutes * 60_000) {
      stop(`idle for ${plan.idleMinutes} minutes`);
    }
  }, IDLE_CHECK_MS);

  child.on('exit', code => {
    clearInterval(idleCheck);
    if (readState()?.token === token) {
      fs.rmSync(stateFile, { force: true });
    }
    process.exit(code ?? 0);
  });
}

/** Stops this checkout's server, never another process; under the lock. */
async function stopServer({ quiet = false } = {}) {
  const outcome = await withLock(async () => {
    const state = running();
    if (!state) {
      return 'none';
    }
    process.kill(state.pid, 'SIGTERM');
    const deadline = Date.now() + STOP_TIMEOUT_MS;
    while (isSupervisor(state) && Date.now() < deadline) {
      await sleep(500);
    }
    if (isSupervisor(state)) {
      process.kill(state.pid, 'SIGKILL');
    }
    if (isDevServer(state.devServerPid)) {
      try {
        process.kill(-state.devServerPid, 'SIGKILL');
      } catch {
        // Gone in the meantime.
      }
    }
    await sleep(500);
    if (isSupervisor(state) || isDevServer(state.devServerPid)) {
      throw new Error(
        `The fixture server (processes ${state.pid}, ${state.devServerPid}) did not stop.`,
      );
    }
    fs.rmSync(stateFile, { force: true });
    return state.url;
  });
  if (!quiet) {
    console.log(
      outcome === 'none'
        ? 'No fixture server runs in this checkout.'
        : `Stopped the fixture server on ${outcome}.`,
    );
  }
}

function status() {
  const state = running();
  if (!state) {
    console.log('No fixture server runs in this checkout.');
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(state, null, 2));
}

const command = process.argv[2] ?? 'start';
const commands = { start, stop: () => stopServer(), status, run };
if (!commands[command]) {
  console.error(`Usage: yarn fixtures [start|status|stop]`);
  process.exit(2);
}
try {
  await commands[command]();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
