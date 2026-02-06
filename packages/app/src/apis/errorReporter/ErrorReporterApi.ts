import { ConfigApi } from '@backstage/core-plugin-api';
import { SentryErrorNotifier } from './SentryErrorNotifier';

export interface IErrorReporterNotifier {
  notify(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    error: Error | string | Record<string, any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extraInfo?: Record<string, any>,
  ): Promise<void>;
}

/**
 * A singleton helper to report errors to a
 * 3rd party provider.
 */
export class ErrorReporterApi {
  /**
   * Singleton instance.
   */
  private static _instance: ErrorReporterApi | null = null;

  /**
   * Get current instance of the reporter or
   * create a new one, if it doesn't exist.
   */
  public static getInstance(): ErrorReporterApi {
    if (!ErrorReporterApi._instance) {
      ErrorReporterApi._instance = new ErrorReporterApi();
    }

    return ErrorReporterApi._instance;
  }

  /**
   * Create and configure an ErrorReporterApi instance from app config.
   * Initializes Sentry if configured in app.errorReporter.sentry.
   */
  public static fromConfig(configApi: ConfigApi): ErrorReporterApi {
    const errorReporter = ErrorReporterApi.getInstance();

    const errorReporterConfig =
      configApi.getOptionalConfig('app.errorReporter');
    if (errorReporterConfig && !errorReporter.notifier) {
      const backendBaseUrl = configApi.getString('backend.baseUrl');
      const sentryConfig = errorReporterConfig.getConfig('sentry');
      errorReporter.notifier = new SentryErrorNotifier({
        dsn: sentryConfig.getString('dsn'),
        environment: sentryConfig.getString('environment'),
        releaseVersion: sentryConfig.getString('releaseVersion'),
        tracesSampleRate: sentryConfig.getNumber('tracesSampleRate'),
        tracePropagationTargets: [`${backendBaseUrl}/api`],
      });
    }

    return errorReporter;
  }

  /**
   * The 3rd party error reporter.
   */
  notifier: IErrorReporterNotifier | null = null;

  /**
   * Report an error.
   * error - The error to report.
   */
  async notify(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    error: Error | string | Record<string, any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extraInfo?: Record<string, any>,
  ): Promise<void> {
    await this.notifier?.notify(error, extraInfo);
  }
}
