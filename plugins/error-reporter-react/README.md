# Error Reporter React

A minimal Backstage package that provides a shared error reporting API interface. This allows plugins to report errors to a centralized error reporting service (like Sentry) without coupling to specific implementations.

## Installation

```bash
yarn add @giantswarm/backstage-plugin-error-reporter-react
```

## Usage

### Using the API in a plugin

The error reporter API is optional. Use `useApiHolder()` to safely access it:

```typescript
import { useApiHolder } from '@backstage/core-plugin-api';
import { errorReporterApiRef } from '@giantswarm/backstage-plugin-error-reporter-react';

function MyComponent() {
  const apiHolder = useApiHolder();
  const errorReporter = apiHolder.get(errorReporterApiRef);

  const handleError = (error: Error) => {
    // Report to error service if available
    errorReporter?.notify(error, {
      context: 'MyComponent',
      userId: 'user123',
    });
  };

  // ...
}
```

### Implementing the API

Create your own implementation of the `ErrorReporterApi` interface:

```typescript
import { ErrorReporterApi } from '@giantswarm/backstage-plugin-error-reporter-react';
import * as Sentry from '@sentry/react';

export class SentryErrorReporter implements ErrorReporterApi {
  constructor(dsn: string) {
    Sentry.init({ dsn });
  }

  async notify(
    error: Error | string | Record<string, any>,
    extraInfo?: Record<string, any>,
  ): Promise<void> {
    if (error instanceof Error) {
      Sentry.captureException(error, { extra: extraInfo });
    } else {
      Sentry.captureMessage(
        typeof error === 'string' ? error : JSON.stringify(error),
        { extra: extraInfo },
      );
    }
  }
}
```

### Registering the API in your app

Register your implementation in `packages/app/src/apis.ts`:

```typescript
import { createApiFactory, configApiRef } from '@backstage/core-plugin-api';
import { errorReporterApiRef } from '@giantswarm/backstage-plugin-error-reporter-react';
import { SentryErrorReporter } from './apis/SentryErrorReporter';

export const apis = [
  createApiFactory({
    api: errorReporterApiRef,
    deps: { configApi: configApiRef },
    factory: ({ configApi }) => {
      const dsn = configApi.getOptionalString('app.errorReporter.sentry.dsn');
      if (!dsn) {
        // Return undefined or a no-op implementation
        return undefined;
      }
      return new SentryErrorReporter(dsn);
    },
  }),
  // ... other APIs
];
```

## API Reference

### `ErrorReporterApi`

```typescript
interface ErrorReporterApi {
  notify(
    error: Error | string | Record<string, any>,
    extraInfo?: Record<string, any>,
  ): Promise<void>;
}
```

### `errorReporterApiRef`

The API reference to use with `useApi()` or `useApiHolder().get()`.

## Design Philosophy

This package intentionally provides only the interface and API reference, not an implementation. This allows:

1. **Optional error reporting** - Plugins can use the API without requiring it to be registered
2. **Flexible implementations** - Apps can provide any error reporting service (Sentry, Datadog, custom, etc.)
3. **No unnecessary dependencies** - The package has minimal dependencies
4. **Decoupled plugins** - Plugins don't need to depend on specific error reporting libraries
