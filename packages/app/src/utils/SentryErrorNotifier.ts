import * as Sentry from '@sentry/react';
import React from 'react';
import {
  RouteProps,
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';

import { IErrorReporterNotifier } from './ErrorReporter';

export interface ISentryErrorNotifierConfig {
  dsn: string;
  environment: string;
  tracePropagationTargets: string[];
  releaseVersion: string;
  tracesSampleRate: number;
}

export class SentryErrorNotifier implements IErrorReporterNotifier {
  constructor(config: ISentryErrorNotifierConfig) {
    Sentry.init({
      dsn: config.dsn,
      release: config.releaseVersion,
      environment: config.environment,
      integrations: [
        Sentry.reactRouterV6BrowserTracingIntegration({
          useEffect: React.useEffect,
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
  }

  // eslint-disable-next-line class-methods-use-this
  public async notify(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    error: Error | string | Record<string, any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extraInfo?: Record<string, any>,
  ): Promise<void> {
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

  public static decorateComponent<T>(
    component: React.FC<React.PropsWithChildren<T>>,
  ) {
    return Sentry.withProfiler(component);
  }

  public static decorateRoute<T extends RouteProps>(
    routeComponent: React.FC<React.PropsWithChildren<T>>,
  ): React.FC<React.PropsWithChildren<T>> {
    return Sentry.withSentryReactRouterV6Routing(routeComponent as never);
  }
}
