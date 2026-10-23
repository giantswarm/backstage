import { chromium } from '@playwright/test';
import type { LaunchOptions } from '@playwright/test';
import { accessSync, constants, existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

/**
 * How the suite launches Chromium: on Linux, in a network namespace of its
 * own (`netns-chromium.sh`).
 *
 * Chromium aborts every in-flight request with `net::ERR_NETWORK_CHANGED`
 * when an address on the host changes, and a lab machine changes them all the
 * time: every docker or kind container that starts or stops adds or removes
 * one. In its own namespace the browser sees one interface that never
 * changes, and still reaches the lab through `pasta`.
 *
 * `AGENTLAB_E2E_NETNS=0` launches the browser as Playwright does; so does a
 * host without `unshare` and `pasta` (passt), with a warning.
 *
 * Without the Chromium this Playwright version needs, the run stops here with
 * one message instead of failing every spec at launch.
 */
export function chromiumLaunchOptions(): LaunchOptions {
  assertChromiumInstalled();
  if (process.env.AGENTLAB_E2E_NETNS === '0') {
    return {};
  }
  const missing = ['unshare', 'pasta'].filter(tool => !onPath(tool));
  if (process.platform !== 'linux' || missing.length > 0) {
    if (process.platform === 'linux') {
      // eslint-disable-next-line no-console
      console.warn(
        `agentlab e2e: ${missing.join(' and ')} not found, so the browser shares the host's network — a container starting during the run can fail a spec with net::ERR_NETWORK_CHANGED. Install passt for pasta, or set AGENTLAB_E2E_NETNS=0 to silence this.`,
      );
    }
    return {};
  }
  // The wrapper execs the browser Playwright would have launched; the
  // workers inherit the variable.
  process.env.AGENTLAB_E2E_BROWSER ??= chromium.executablePath();
  return { executablePath: join(__dirname, 'netns-chromium.sh') };
}

// `yarn test:e2e:agentlab` installs the browser before the run; a run started
// otherwise (`yarn playwright test --config …`) may come without it.
function assertChromiumInstalled() {
  const executable = chromium.executablePath();
  if (!existsSync(executable)) {
    // eslint-disable-next-line no-console
    console.error(
      `agentlab e2e: the Chromium this Playwright version needs is not installed (${executable}). Run \`yarn playwright install chromium\`, or the suite through \`yarn test:e2e:agentlab\`, which installs it first.`,
    );
    // An error thrown from the config is printed with its stack; this is
    // the whole message.
    process.exit(1);
  }
}

function onPath(tool: string): boolean {
  return (process.env.PATH ?? '').split(delimiter).some(dir => {
    try {
      accessSync(join(dir, tool), constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}
