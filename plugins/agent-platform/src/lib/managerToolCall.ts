import type { MusterApi } from '@giantswarm/backstage-plugin-muster';

/** How a platform manager's client turns muster's failures into its errors. */
export type ManagerErrors = {
  /** What a muster call threw, as the manager's error. */
  classify: (error: unknown) => Error;
  /** An answer that is prose where the data was expected. */
  notJSON: (message: string) => Error;
};

/**
 * One tool of a platform manager (workspace-manager, the toolchain-manager)
 * on an installation, called through its muster as the signed-in person:
 * `musterApi.callTool()` with the person's token, the answer's data parsed.
 * The proxy parses the tool's JSON; a bare string is a JSON text it left
 * alone, or prose where the data was expected, which fails.
 */
export async function callManagerTool<T>(
  musterApi: MusterApi,
  installation: string,
  toolName: string,
  args: Record<string, unknown>,
  errors: ManagerErrors,
): Promise<T> {
  let result: unknown;
  try {
    result = await musterApi.callTool(toolName, args, installation);
  } catch (error) {
    throw errors.classify(error);
  }
  if (typeof result === 'string') {
    try {
      return JSON.parse(result) as T;
    } catch {
      throw errors.notJSON(`${toolName} answered text, not JSON: ${result}`);
    }
  }
  return result as T;
}
