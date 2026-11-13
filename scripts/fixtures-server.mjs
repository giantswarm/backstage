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
 * the ports and the process id. The server stops on its own once no `start`
 * has asked for it for FIXTURES_IDLE_MINUTES (default 60).
 *
 * The ports come from the operating system, never 3000 or 7007 (another
 * portal's); FIXTURES_APP_PORT and FIXTURES_BACKEND_PORT pick them instead.
 * Both bind 127.0.0.1: a browser in an IPv4-only network namespace cannot
 * reach the frontend on `::1` (e2e/agentlab/README.md, "Against a dev server").
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const stateFile = path.join(root, '.fixtures-server.json');
const workDir = path.join(root, '.fixtures-server');
const portsConfig = path.join(workDir, 'app-config.ports.yaml');
const logFile = path.join(workDir, 'server.log');

const HOST = '127.0.0.1';
const TAKEN_PORTS = new Set([3000, 7007]);
const IDLE_MINUTES = Number(process.env.FIXTURES_IDLE_MINUTES ?? 60);
const START_TIMEOUT_MS = 10 * 60 * 1000;
const IDLE_CHECK_MS = 30 * 1000;

function readState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    return undefined;
  }
}

function writeState(state) {
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
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
  if (isAlive(state.pid)) {
    return state;
  }
  fs.rmSync(stateFile, { force: true });
  return undefined;
}

async function waitUntilAnswering(state) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!isAlive(state.pid)) {
      throw new Error(
        `The fixture server exited while starting; see ${state.log}.`,
      );
    }
    if (
      (await answers(state.url)) &&
      (await answers(`${state.backendUrl}/.backstage/health/v1/readiness`))
    ) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error(
    `The fixture server did not answer within ${START_TIMEOUT_MS / 60000} minutes; see ${state.log}.`,
  );
}

/** The `--config <file>` arguments of `start`, as absolute paths. */
function extraConfigs(args) {
  const configs = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] !== '--config' || !args[i + 1]) {
      throw new Error(`Unknown argument ${args[i]}: only --config <file>.`);
    }
    const file = path.resolve(args[i + 1]);
    if (!fs.existsSync(file)) {
      throw new Error(`No config file ${args[i + 1]}.`);
    }
    configs.push(file);
    i += 1;
  }
  return configs;
}

async function start() {
  const configs = extraConfigs(process.argv.slice(3));
  const existing = running();
  if (existing) {
    writeState({ ...existing, touchedAt: new Date().toISOString() });
    await waitUntilAnswering(existing);
    console.log(existing.url);
    return;
  }

  const appPort = await choosePort('FIXTURES_APP_PORT', new Set());
  const backendPort = await choosePort(
    'FIXTURES_BACKEND_PORT',
    new Set([appPort]),
  );
  fs.mkdirSync(workDir, { recursive: true });
  fs.writeFileSync(portsConfig, portsYaml(appPort, backendPort));
  fs.writeFileSync(logFile, '');

  const log = fs.openSync(logFile, 'a');
  const supervisor = spawn(
    process.execPath,
    [import.meta.filename, 'run', ...configs],
    {
      cwd: root,
      detached: true,
      stdio: ['ignore', log, log],
    },
  );
  supervisor.unref();

  const state = {
    url: `http://${HOST}:${appPort}`,
    backendUrl: `http://${HOST}:${backendPort}`,
    appPort,
    backendPort,
    pid: supervisor.pid,
    log: path.relative(root, logFile),
    startedAt: new Date().toISOString(),
    touchedAt: new Date().toISOString(),
    idleMinutes: IDLE_MINUTES,
  };
  writeState(state);
  console.error(`Starting the fixture server (log: ${state.log}) …`);
  await waitUntilAnswering(state);
  console.log(state.url);
}

/**
 * The detached supervisor: runs the dev server in a process group of its own,
 * stops it when stopped itself or once idle, and clears the state.
 */
function run() {
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
      ...process.argv.slice(3).flatMap(file => ['--config', file]),
    ],
    {
      cwd: root,
      detached: true,
      stdio: 'inherit',
      env: { ...process.env, ENABLE_GUEST_AUTH: '1', BROWSER: 'none' },
    },
  );

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
    const touched = Date.parse(state?.touchedAt ?? '');
    if (
      Number.isFinite(touched) &&
      Date.now() - touched > IDLE_MINUTES * 60_000
    ) {
      stop(`idle for ${IDLE_MINUTES} minutes`);
    }
  }, IDLE_CHECK_MS);

  child.on('exit', code => {
    clearInterval(idleCheck);
    if (readState()?.pid === process.pid) {
      fs.rmSync(stateFile, { force: true });
    }
    process.exit(code ?? 0);
  });
}

async function stopServer() {
  const state = running();
  if (!state) {
    console.log('No fixture server runs in this checkout.');
    return;
  }
  process.kill(state.pid, 'SIGTERM');
  const deadline = Date.now() + 30_000;
  while (isAlive(state.pid) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  fs.rmSync(stateFile, { force: true });
  console.log(`Stopped the fixture server on ${state.url}.`);
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
const commands = { start, stop: stopServer, status, run };
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
