import { ConfigApi } from '@backstage/core-plugin-api';
import { ErrorReporterApi } from '@giantswarm/backstage-plugin-error-reporter-react';
import * as Sentry from '@sentry/react';
import { useEffect } from 'react';
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';

export interface SentryErrorReporterConfig {
  dsn: string;
  environment: string;
  tracePropagationTargets: string[];
  releaseVersion: string;
  tracesSampleRate: number;
}

/**
 * A singleton error reporter that sends errors to Sentry.
 */
export class SentryErrorReporter implements ErrorReporterApi {
  /**
   * Singleton instance.
   */
  private static _instance: SentryErrorReporter | null = null;

  /**
   * Whether Sentry has been initialized.
   */
  private initialized = false;

  /**
   * Get current instance of the reporter or
   * create a new one, if it doesn't exist.
   */
  public static getInstance(): SentryErrorReporter {
    if (!SentryErrorReporter._instance) {
      SentryErrorReporter._instance = new SentryErrorReporter();
    }

    return SentryErrorReporter._instance;
  }

  /**
   * Create and configure a SentryErrorReporter instance from app config.
   * Initializes Sentry if configured in app.errorReporter.sentry.
   */
  public static fromConfig(configApi: ConfigApi): SentryErrorReporter {
    const errorReporter = SentryErrorReporter.getInstance();

    const errorReporterConfig =
      configApi.getOptionalConfig('app.errorReporter');
    if (errorReporterConfig && !errorReporter.initialized) {
      const backendBaseUrl = configApi.getString('backend.baseUrl');
      const sentryConfig = errorReporterConfig.getConfig('sentry');
      errorReporter.initialize({
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
   * Initialize Sentry with the given configuration.
   */
  private initialize(config: SentryErrorReporterConfig): void {
    if (this.initialized) {
      return;
    }

    Sentry.init({
      dsn: config.dsn,
      release: config.releaseVersion,
      environment: config.environment,
      integrations: [
        Sentry.reactRouterV6BrowserTracingIntegration({
          useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes,
        }),
      ],
      tracesSampleRate: config.tracesSampleRate,
      tracePropagationTargets: config.tracePropagationTargets,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
    });

    this.initialized = true;
  }

  /**
   * Report an error to Sentry.
   */
  // eslint-disable-next-line class-methods-use-this
  public async notify(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    error: Error | string | Record<string, any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extraInfo?: Record<string, any>,
  ): Promise<void> {
    // Handle warning level separately using captureMessage
    if (extraInfo?.level === 'warning') {
      const { level, ...restExtraInfo } = extraInfo;
      let message: string;
      if (error instanceof Error) {
        message = error.message;
      } else if (typeof error === 'string') {
        message = error;
      } else {
        message = JSON.stringify(error);
      }

      Sentry.captureMessage(message, {
        level: 'warning',
        extra: restExtraInfo,
      });
      return Promise.resolve();
    }

    switch (true) {
      case error instanceof Error:
        Sentry.captureException(error, { extra: extraInfo });
        break;

      case typeof error === 'string':
        Sentry.captureException(new Error(error as string), {
          extra: extraInfo,
        });
        break;

      default:
        Sentry.captureException(error, { extra: extraInfo });
        break;
    }

    return Promise.resolve();
  }
}
