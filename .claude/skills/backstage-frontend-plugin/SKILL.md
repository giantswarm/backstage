---
name: backstage-frontend-plugin
description: 'Build Backstage frontend plugins with the new Frontend System: createFrontendPlugin, blueprints, routes, Utility APIs, testing. Use for pages, nav, entity content, or cards.'
version: 1.0.0
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# Backstage Frontend Plugin (New Frontend System)

## Context

- Skills repo dir: !`echo $BACKSTAGE_AGENT_SKILLS_DIR`

## Instructions

Check the context above. If the skills repo dir is not empty, follow the **Full Mode** instructions. Otherwise, follow **Standalone Mode**.

---

## Full Mode (skills repo available)

The full skill with detailed reference documentation is available externally.

1. **Read the full SKILL.md** from the external repo:

   Read file: `${BACKSTAGE_AGENT_SKILLS_DIR}/backstage-frontend-plugin/SKILL.md`

2. **Follow all instructions** in that file exactly as written.

3. **Resolve reference links** against the external repo directory. When the external SKILL.md references `./reference/blueprints.md`, `./reference/utility_apis.md`, or `./reference/testing.md`, read them from:

   `${BACKSTAGE_AGENT_SKILLS_DIR}/backstage-frontend-plugin/reference/<filename>`

4. **Use the local cleanup script** from this project (not the external one):

   `node .claude/skills/backstage-frontend-plugin/scripts/cleanup-scaffolding.js <plugin-path>`

---

## Standalone Mode (skills repo not available)

> **For the full experience** with detailed API reference docs (blueprints, Utility APIs, testing patterns), clone the skills repo and set the env var:
>
> ```bash
> # In ~/.zshrc or ~/.bashrc
> export BACKSTAGE_AGENT_SKILLS_DIR="/path/to/backstage-agent-skills"
> ```

### Quick Facts

- Scaffold with `yarn new` -> select `frontend-plugin`. Creates `plugins/<pluginId>/`.
- **CRITICAL**: `yarn new` generates LEGACY code. You MUST convert to the New Frontend System.
- Plugin instance: `createFrontendPlugin` from `@backstage/frontend-plugin-api`. Export as default from `src/index.ts`.
- Extensions: `PageBlueprint`, `NavItemBlueprint`, `EntityContentBlueprint` — lazy-loaded via dynamic imports.
- Route refs: `createRouteRef` from `@backstage/frontend-plugin-api` (NOT `@backstage/core-plugin-api`). No `id` parameter.
- Utility APIs: `createApiRef` + `ApiBlueprint`, consumed via `useApi`.

### Golden Path

#### 1) Scaffold

```bash
yarn new --select frontend-plugin --option pluginId=example --option owner=""
```

Then clean up scaffolding junk:

```bash
node .claude/skills/backstage-frontend-plugin/scripts/cleanup-scaffolding.js plugins/example
```

#### 2) Convert Routes (`src/routes.ts`)

```ts
import { createRouteRef } from '@backstage/frontend-plugin-api';

export const rootRouteRef = createRouteRef();
```

#### 3) Convert Plugin (`src/plugin.ts`)

**COMPLETELY REPLACE** generated legacy code:

```tsx
import {
  createFrontendPlugin,
  PageBlueprint,
  NavItemBlueprint,
} from '@backstage/frontend-plugin-api';
import { rootRouteRef } from './routes';
import ExampleIcon from '@material-ui/icons/Extension';

const examplePage = PageBlueprint.make({
  params: {
    routeRef: rootRouteRef,
    path: '/example',
    loader: () =>
      import('./components/ExampleComponent').then(m => <m.ExampleComponent />),
  },
});

const exampleNavItem = NavItemBlueprint.make({
  params: {
    routeRef: rootRouteRef,
    title: 'Example',
    icon: ExampleIcon,
  },
});

export const examplePlugin = createFrontendPlugin({
  pluginId: 'example',
  extensions: [examplePage, exampleNavItem],
  routes: { root: rootRouteRef },
});
```

#### 4) Convert Index (`src/index.ts`)

```ts
export { examplePlugin as default } from './plugin';
```

#### 5) Utility API (optional)

```ts
// src/api.ts
import { createApiRef } from '@backstage/frontend-plugin-api';

export interface ExampleApi {
  getExample(): { example: string };
}

export const exampleApiRef = createApiRef<ExampleApi>({ id: 'plugin.example' });
```

Register with `ApiBlueprint.make` using callback syntax:

```ts
const exampleApi = ApiBlueprint.make({
  name: 'example',
  params: define =>
    define({
      api: exampleApiRef,
      deps: {},
      factory: () => new DefaultExampleApi(),
    }),
});
```

#### 6) Entity Integration (optional)

```tsx
import { EntityContentBlueprint } from '@backstage/plugin-catalog-react/alpha';

const exampleEntityContent = EntityContentBlueprint.make({
  params: {
    path: 'example',
    title: 'Example',
    loader: () =>
      import('./components/ExampleEntityContent').then(m => (
        <m.ExampleEntityContent />
      )),
  },
});
```

### Common Pitfalls

| Problem                             | Solution                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Extensions don't render**         | Ensure they're in the plugin's `extensions` array; components must be lazy-loaded                   |
| **Navigation/links break**          | Keep `routeRef`s in `src/routes.ts`; use `useRouteRef` for links                                    |
| **Consumers can't install**         | Export the plugin as default from `src/index.ts`                                                    |
| **`createRouteRef` errors**         | Import from `@backstage/frontend-plugin-api`, NOT `core-plugin-api`. No `id` param.                 |
| **`ApiBlueprint.make` type errors** | Use callback syntax: `params: define => define({...})`                                              |
| **`PageBlueprint` loader fails**    | Loader uses JSX — plugin file must be `.tsx` not `.ts`                                              |
| **Sidebar nav items missing**       | In hybrid/legacy mode, `NavItemBlueprint` items aren't consumed. Keep manual `SidebarItem` entries. |

### Production Best Practices

- Keep `routeRef`s in `src/routes.ts` to avoid circular imports
- Use dynamic imports in blueprint loaders for lazy loading
- Wrap lazy components in `<Suspense>` and `<ErrorBoundary>`
- Keep API interfaces small and stable
- Use `usePermission` to hide/show content based on permissions
- Keep presentational components separate from data hooks
- Test with `renderInTestApp` and `createExtensionTester`
