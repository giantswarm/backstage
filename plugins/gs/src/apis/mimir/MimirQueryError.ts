import {
  isMimirUnavailableReason,
  MimirUnavailableReason,
} from '@giantswarm/backstage-plugin-gs-common';

/**
 * A Mimir query the gs backend did not answer with data. `reason` is the
 * backend's `error.reason` when it is one the frontend has words for (see
 * `MIMIR_UNAVAILABLE_REASONS`); `describeMimirFailure` picks them.
 */
export class MimirQueryError extends Error {
  readonly status: number;
  readonly reason?: MimirUnavailableReason;

  constructor(message: string, options: { status: number; reason?: unknown }) {
    super(message);
    this.name = 'MimirQueryError';
    this.status = options.status;
    if (isMimirUnavailableReason(options.reason)) {
      this.reason = options.reason;
    }
  }
}
