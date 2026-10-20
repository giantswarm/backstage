import { chromium } from '@playwright/test';
import type { LaunchOptions } from '@playwright/test';
import { accessSync, constants } from 'node:fs';
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
 */
export function chromiumLaunchOptions(): LaunchOptions {
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
