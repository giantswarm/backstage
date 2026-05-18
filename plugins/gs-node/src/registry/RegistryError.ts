import { CustomErrorBase } from '@backstage/errors';

/**
 * Custom error for container registry HTTP responses that don't map
 * to standard Backstage error classes.
 *
 * This preserves the original HTTP status code from the registry API
 * and includes the response body for debugging.
 */
export class RegistryError extends CustomErrorBase {
  /**
   * The HTTP status code from the registry response
   */
  readonly statusCode: number;

  /**
   * The response body from the registry (if available)
   */
  readonly responseBody?: string;

  constructor(
    message: string,
    statusCode: number,
    responseBody?: string,
    cause?: Error,
  ) {
    super(message, cause);
    this.statusCode = statusCode;
    this.responseBody = responseBody;
    this.name = 'RegistryError';
  }
}
