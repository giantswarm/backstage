/**
 * Starts the backend and exits the process when the start fails. The backend
 * catches its own unhandled rejections and only logs them, so a plugin that
 * fails to boot (`onPluginBootFailure: abort`) would otherwise leave a process
 * that serves liveness but never turns ready.
 */
export async function startBackend(
  backend: { start(): Promise<unknown> },
  exit: (code: number) => void = code => process.exit(code),
): Promise<void> {
  try {
    await backend.start();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Backend failed to start, exiting', error);
    exit(1);
  }
}
