---
name: backstage-backend-plugin
description: 'Build Backstage backend plugins with createBackendPlugin and core services: DI, httpRouter, secure-by-default auth, Knex DB, routes, testing. Use for APIs and background jobs.'
version: 1.0.0
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# Backstage Backend Plugin (New Backend System)

## Context

- Skills repo dir: !`echo "${BACKSTAGE_AGENT_SKILLS_DIR:-NOT SET}"`
- Skills repo available: !`[ -d "${BACKSTAGE_AGENT_SKILLS_DIR}/backstage-backend-plugin" ] && echo "YES" || echo "NO"`

## Instructions

Check the context above. If the skills repo is available (shows "YES"), follow the **Full Mode** instructions. Otherwise, follow **Standalone Mode**.

---

## Full Mode (skills repo available)

The full skill with detailed reference documentation is available externally.

1. **Read the full SKILL.md** from the external repo:

   Read file: `${BACKSTAGE_AGENT_SKILLS_DIR}/backstage-backend-plugin/SKILL.md`

2. **Follow all instructions** in that file exactly as written.

3. **Resolve reference links** against the external repo directory. When the external SKILL.md references `./reference/core_services.md` or `./reference/testing.md`, read them from:

   `${BACKSTAGE_AGENT_SKILLS_DIR}/backstage-backend-plugin/reference/<filename>`

4. **Use the local cleanup script** from this project (not the external one):

   `node .claude/skills/backstage-backend-plugin/scripts/cleanup-scaffolding-backend.js <plugin-path>`

---

## Standalone Mode (skills repo not available)

> **For the full experience** with detailed API reference docs (core services, testing patterns), clone the skills repo and set the env var:
>
> ```bash
> # In ~/.zshrc or ~/.bashrc
> export BACKSTAGE_AGENT_SKILLS_DIR="/path/to/backstage-agent-skills"
> ```

### Quick Facts

- Scaffold with `yarn new` -> select `backend-plugin`. Creates `plugins/<pluginId>-backend/`.
- Plugin instance: `createBackendPlugin` from `@backstage/backend-plugin-api`. Dependencies via `deps`.
- Routes: attach via `coreServices.httpRouter`. Backstage prefixes with `/api/<pluginId>`.
- Secure by default: use `httpRouter.addAuthPolicy({ path, allow: 'unauthenticated' })` for open endpoints.
- Core services: `logger`, `database`, `httpRouter`, `httpAuth`, `userInfo`, `scheduler`, `cache`, `discovery`, `urlReader`.

### Golden Path

#### 1) Scaffold

```bash
yarn new --select backend-plugin --option pluginId=example --option owner=""
```

Then clean up scaffolding junk:

```bash
node .claude/skills/backstage-backend-plugin/scripts/cleanup-scaffolding-backend.js plugins/example-backend
```

#### 2) `src/plugin.ts` — plugin + DI + router

```ts
import {
  createBackendPlugin,
  coreServices,
} from '@backstage/backend-plugin-api';
import { createRouter } from './service/router';

export const examplePlugin = createBackendPlugin({
  pluginId: 'example',
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
        logger: coreServices.logger,
        database: coreServices.database, // optional
        httpAuth: coreServices.httpAuth, // optional
        userInfo: coreServices.userInfo, // optional
      },
      async init({ httpRouter, logger, database, httpAuth, userInfo }) {
        const router = await createRouter({
          logger,
          database,
          httpAuth,
          userInfo,
        });
        httpRouter.use(router);

        // Secure-by-default: open /health only
        httpRouter.addAuthPolicy({ path: '/health', allow: 'unauthenticated' });
      },
    });
  },
});

export { examplePlugin as default } from './plugin';
```

#### 3) `src/service/router.ts` — minimal Express router

```ts
import express from 'express';
import type {
  LoggerService,
  DatabaseService,
  HttpAuthService,
  UserInfoService,
} from '@backstage/backend-plugin-api';

export interface RouterOptions {
  logger: LoggerService;
  database?: DatabaseService;
  httpAuth?: HttpAuthService;
  userInfo?: UserInfoService;
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger } = options;
  const router = express.Router();

  router.get('/health', (_req, res) => {
    logger.info('health check');
    res.json({ status: 'ok' });
  });

  return router;
}
```

#### 4) Add to backend

In `packages/backend/src/index.ts`:

```ts
backend.add(import('@internal/plugin-example-backend'));
```

Test: `GET http://localhost:7007/api/example/health` -> `{ "status": "ok" }`

#### 5) Database, auth, identity (when needed)

- **Database**: `coreServices.database` -> `await database.getClient()` for Knex client. Write migrations in `.js`.
- **Auth**: `coreServices.httpAuth` -> `await httpAuth.credentials(req, { allow: ['user', 'service'] })`
- **Identity**: `coreServices.userInfo` -> `await userInfo.getUserInfo(creds)` for `userEntityRef`

### Common Pitfalls

| Problem                        | Solution                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| **404s under `/api`**          | Backstage prefixes plugin routers with `/api/<pluginId>`                                  |
| **Auth unexpectedly required** | Backends are secure by default; open endpoints with `httpRouter.addAuthPolicy`            |
| **Tight coupling**             | Never call other backend code directly; communicate over network or well-defined services |
| **In-memory state**            | Avoid — breaks horizontal scalability. Use database or cache service.                     |
| **Database migrations fail**   | Migrations must be `.js` files, exported in `package.json`                                |

### Production Best Practices

- Validate inputs at the edge with zod or similar schema validation
- Use `errorHandler()` from `@backstage/backend-common` as terminal middleware
- Keep routers small in `src/service/router.ts`; inject deps from `plugin.ts`
- Avoid in-memory state — make handlers idempotent
- Log with `logger.child({ plugin: 'example' })` for traceability
- Use `httpAuth` + `userInfo` for identity; don't parse tokens manually
- Write migrations in JavaScript (`.js`), not TypeScript
- Test with `startTestBackend` and `supertest`
