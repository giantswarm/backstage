import { InputError } from '@backstage/errors';
import { MIMIR_OUTSIDE_MATCHERS_REASON } from '@giantswarm/backstage-plugin-gs-common';

/**
 * The 400 {@link MimirService} answers a query about series the
 * installation's `mimir.matchers` exclude (another cluster than the
 * installation's): never sent, since its answer could only be empty. An
 * `InputError` by name, so every route answers it 400; `reason` lets the
 * frontend tell it from a real failure and show the page's no-data state.
 */
export class MimirQueryRefusedError extends InputError {
  readonly reason = MIMIR_OUTSIDE_MATCHERS_REASON;
}
