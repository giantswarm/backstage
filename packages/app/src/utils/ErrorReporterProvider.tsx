import * as React from 'react';
import ErrorReporter from './ErrorReporter';
import { SentryErrorNotifier } from './SentryErrorNotifier';
import { configApiRef, useApi } from '@backstage/core-plugin-api';

const ErrorReporterContext = React.createContext(ErrorReporter.getInstance());

const ErrorReporterProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const config = useApi(configApiRef);

  const errorReporter = ErrorReporter.getInstance();

  const errorReporterConfig = config.getOptionalConfig('app.errorReporter');
  if (errorReporterConfig && !errorReporter.notifier) {
    const backendBaseUrl = config.getString('backend.baseUrl');
    const sentryErrorNotifierConfig = errorReporterConfig.getConfig('sentry');
    errorReporter.notifier = new SentryErrorNotifier({
      dsn: sentryErrorNotifierConfig.getString('dsn'),
      environment: sentryErrorNotifierConfig.getString('environment'),
      releaseVersion: sentryErrorNotifierConfig.getString('releaseVersion'),
      tracesSampleRate: sentryErrorNotifierConfig.getNumber('tracesSampleRate'),
      tracePropagationTargets: [`${backendBaseUrl}/api`],
    });
  }

  return <ErrorReporterContext.Provider value={errorReporter}>{children}</ErrorReporterContext.Provider>;
}

function useErrorReporter() {
  const context = React.useContext(ErrorReporterContext);
  if (context === undefined) {
    throw new Error('useErrorReporter must be used within an ErrorReporterProvider');
  }
  return context;
}

export { ErrorReporterProvider, useErrorReporter }
