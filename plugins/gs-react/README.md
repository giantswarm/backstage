# gs-react

Web library shared by the Giant Swarm frontend plugins.

## The signed-in config

The Dev Portal ships two tiers of configuration to the browser:

- The **public config** in the unauthenticated `index.html`: every path a
  `config.d.ts` marks `@visibility frontend`. Anyone who can reach the portal
  reads it, signed in or not, so it holds only what the sign-in page needs
  (`app.baseUrl`, `backend.baseUrl`, `auth.*`, `gs.authProvider`, the sign-in
  cards, the app shell).
- The **signed-in config** served by the authenticated `GET /api/gs/config`:
  the allowlisted paths of the gs-backend plugin's `SIGNED_IN_CONFIG_PATHS`,
  in app-config shape. Everything else a Giant Swarm plugin reads in the
  browser comes from here, after the main sign-in.

This package is the frontend side of the second tier: a module-level source
the gs plugin's `SignedInConfigLoader` publishes into once after sign-in, read
by React components through `useSignedInConfig()` and by the utility APIs
built at app boot through `getSignedInConfig()`.

```tsx
import { useSignedInConfig } from '@giantswarm/backstage-plugin-gs-react';

function FriendlyLabels() {
  const { config, isLoading } = useSignedInConfig();
  const labels = config?.getOptionalConfigArray('gs.friendlyLabels');
  // ...
}
```

```ts
import { getSignedInConfig } from '@giantswarm/backstage-plugin-gs-react';

// In a utility API constructed before sign-in: resolves once the config
// has loaded, so call it only on paths that run after sign-in.
const config = await getSignedInConfig();
```

To read a new key in the browser: leave its `config.d.ts` entry at the
default (backend) visibility, add the path to `SIGNED_IN_CONFIG_PATHS` and read
it through this package. `@visibility frontend` is reserved for what the
sign-in page itself needs.
