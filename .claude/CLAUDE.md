# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## About This Project

Giant Swarm's customized Backstage application for both internal use and customer portals.

## Development Commands

### Running Locally

Either method works:

```bash
# Start frontend and backend together:
yarn start
```

```bash
# Start frontend and backend separately:
yarn start backend
yarn start app
```

### Testing

Use the test-runner subagent for testing.

```bash
# Run tests
yarn test

# Run tests with coverage
yarn test:all

# Run Playwright E2E tests
yarn test:e2e
```

### Code Quality

```bash
# Lint changed files since origin/main
yarn lint

# Lint all files
yarn lint:all

# Auto-fix linting issues
yarn fix

# Format code (run before committing)
yarn prettier:fix > /dev/null

# Check formatting
yarn prettier:check

# Type checking
yarn tsc                # With incremental mode
yarn tsc:full           # Full check without skipping lib checks
```

### Building

```bash
# Build all packages
yarn build:all

# Build backend only
yarn build:backend

# Build headless service
yarn build:backend-headless-service

# Build Docker image
yarn build-image

# Clean build artifacts
yarn clean
```

### Development Setup

- **Devcontainer**: Optional development environment (VS Code devcontainer support)
- **Environment Variables**: Requires `.env` file (not checked in), secrets in 1Password, uses `env-cmd` for loading
- **Local Config**: Copy `app-config.local.yaml.example` to `app-config.local.yaml`
- **Database**: Uses in-memory SQLite by default. Run PostgreSQL via Docker (see `docs/development.md`) to test with Postgres
- **HTTPS**: Configure via `certificate.yaml` (see `certificate.yaml.example`)
- **Ports**: Frontend on 3000, Backend on 7007

## Architecture Overview

### Monorepo Structure

This is a Yarn workspaces monorepo with:

- **`packages/`** - Core application packages
  - `app` - React frontend application
  - `backend` - Main backend service
  - `backend-headless-service` - Headless backend service
  - `backend-common` - Shared backend utilities and root logger

- **`plugins/`** - Custom Backstage plugins

### Key Custom Plugins

#### Frontend Plugins

- **`gs`** - Main Giant Swarm plugin (largest plugin, 375+ files)
  - Contains all core GS pages: Clusters, Deployments, Installations, Kratix
  - Custom scaffolder field extensions (ClusterPicker, ChartPicker, etc.)
  - Custom APIs: gsAuth, containerRegistry, kubernetes, scaffolder
  - Custom catalog page and entity cards

- **`flux`** & **`flux-react`** - Flux CD GitOps integration
  - Flux resources visualization and management

- **`kubernetes-react`** - Kubernetes utilities and custom React hooks
  - Reusable Kubernetes components and hooks

- **`ui-react`** - Shared UI component library
  - Reusable components like tables, charts, date formatting
  - Utilities: `useTableColumns`, `isTableColumnHidden`, `sortAndFilterOptions`, `semverCompareSort`

- **`gs-common`** - Shared constants and utilities

- **`ai-chat`** - AI chat interface

#### Backend Plugins

- **`gs-backend`** - Backend services for GS functionality

- **`auth-backend-module-gs`** - Custom authentication module

- **`scaffolder-backend-module-gs`** - Custom scaffolder actions

- **`techdocs-backend-module-gs`** - Custom TechDocs backend functionality

- **`ai-chat-backend`** - AI chat backend service

### Backend Architecture

The backend uses the **new Backstage backend system** (not legacy). Entry point is `packages/backend/src/index.ts` which:

1. Creates backend with `createBackend()` from `@backstage/backend-defaults`
2. Adds plugins via dynamic imports: `backend.add(import('@backstage/plugin-*'))`
3. No manual router setup - plugins self-register

Key backend plugins registered:

- App, proxy, scaffolder, techdocs, auth, catalog, search, kubernetes
- Notifications, signals, events, permission
- Custom GS plugins and modules

### Frontend Architecture

Entry point: `packages/app/src/App.tsx`

- React 18 with Material-UI v4 components
- Backstage frontend plugin system

### Scaffolder Field Extensions

Custom field components for Backstage templates (in `plugins/gs`):

- `ClusterPicker` - Select GS clusters
- `ChartPicker` - Select Helm charts
- `ChartTagPicker` - Select chart versions
- `InstallationPicker` - Select installations
- `ProviderConfigPicker` - Select provider configs
- `YamlValuesEditor` - Edit YAML values
- And more...

All registered as extensions via `createScaffolderFieldExtension` in `plugins/gs/src/plugin.ts`.

## Code Patterns & Conventions

### Component Structure

Components must be in their own directory with:

- `ComponentName.tsx` - Implementation
- `index.ts` - Named export: `export { ComponentName } from './ComponentName'`

```
MyComponent/
  MyComponent.tsx
  index.ts
  columns.tsx     (optional - for table column definitions)
  helpers.ts      (optional)
```

Never use default exports. Always import from directory: `import { MyComponent } from '../MyComponent'`

### Table Components

Use `@backstage/core-components` Table with the following patterns:

1. **Column Definitions** - Separate into `columns.tsx`:

   ```tsx
   export function getInitialColumns(visibleColumns): TableColumn<T>[] {
     return columns.map(col => ({
       ...col,
       hidden: isTableColumnHidden(col.field, {
         defaultValue: Boolean(col.hidden),
         visibleColumns,
       }),
     }));
   }
   ```

2. **Column Visibility** - Use `useTableColumns(TABLE_ID)` hook to persist to localStorage

3. **Sorting/Filtering**:
   - Version columns: `customSort: semverCompareSort(row => row.version)`
   - Custom data: `sortAndFilterOptions(row => row.customField)`
   - Dates: `type: 'datetime'`

4. **Common Utilities** from `ui-react`:
   - `isTableColumnHidden()` - Column visibility logic
   - `semverCompareSort()` - Version sorting
   - `sortAndFilterOptions()` - Custom sort and filter

### Kubernetes Resource Classes

Resource classes in `plugins/kubernetes-react/src/lib/k8s/` wrap Kubernetes CRDs.

#### New Resources: Use Latest Version Only

When creating a new resource class, use only the latest available API version:

```typescript
import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from './KubeObject';

type MyResourceInterface = crds.mygroup.v1.MyResource;

export class MyResource extends KubeObject<MyResourceInterface> {
  static readonly supportedVersions = ['v1'] as const;
  static readonly group = 'mygroup.example.io';
  static readonly kind = 'MyResource' as const;
  static readonly plural = 'myresources';
}
```

#### Multi-Version Resources (when backward compatibility needed)

For resources that must support multiple API versions:

```typescript
// 1. Define version-specific types - ONLY versions in @giantswarm/k8s-types
type MyResourceV1Beta1 = crds.mygroup.v1beta1.MyResource;
type MyResourceV1Beta2 = crds.mygroup.v1beta2.MyResource;

// 2. Version map (source of truth)
type MyResourceVersions = {
  'v1beta1': MyResourceV1Beta1;
  'v1beta2': MyResourceV1Beta2;
};

// 3. Interface is union
type MyResourceInterface = MyResourceVersions[keyof MyResourceVersions];

export class MyResource extends KubeObject<MyResourceInterface> {
  // 4. satisfies provides compile-time enforcement
  static readonly supportedVersions = ['v1beta1', 'v1beta2'] as const
    satisfies readonly (keyof MyResourceVersions)[];

  // 5. REQUIRED: Type guards for each supported version
  isV1Beta1(): this is MyResource & { jsonData: MyResourceV1Beta1 } {
    return this.getApiVersionSuffix() === 'v1beta1';
  }

  isV1Beta2(): this is MyResource & { jsonData: MyResourceV1Beta2 } {
    return this.getApiVersionSuffix() === 'v1beta2';
  }
}
```

**Rules:**

- For NEW resources: Use only the latest available API version
- NEVER add a version to `supportedVersions` without a corresponding type in `@giantswarm/k8s-types`
- Multi-version resources MUST use a version map with `satisfies` for compile-time safety
- Multi-version resources MUST have type guard methods (`isV1Beta1()`, etc.) for each version
- Check available types: `node_modules/@giantswarm/k8s-types/dist/types/crds/`
- Reference: `plugins/kubernetes-react/src/lib/k8s/capi/Cluster.ts`

### Naming Conventions

- Components: PascalCase (e.g., `GSClustersPage`, `EntityGSDeploymentsContent`)
- Hooks: camelCase with `use` prefix (e.g., `useDeploymentStatusDetails`)
- Utilities: camelCase (e.g., `generateUID`, `parseDate`)
- Plugins: lowercase-with-hyphens (e.g., `gs`, `flux-react`)
- Exports: Components prefixed with `GS` for Giant Swarm customizations
- File organization: Hooks in `hooks/` subdirectories, utilities in `utils/` subdirectories

## Configuration Files

- **`app-config.yaml`** - Base configuration (checked in)
- **`app-config.local.yaml`** - Local overrides (gitignored)
- **`app-config.production.yaml`** - Production config (empty, settings in env)
- **`app-config.headless-service.yaml`** - Headless service config
- **`.env`** - Environment variables (gitignored, template in `.env.example`)
- **`github-app-*-credentials.yaml`** - GitHub OAuth credentials (gitignored)
- **`certificate.yaml`** - HTTPS certificate for local HTTPS (gitignored)

## Technology Stack

- **Runtime**: Node.js (see `package.json` for supported versions)
- **Package Manager**: Yarn (modern version with traditional node_modules)
- **Language**: TypeScript
- **Frontend**: React, Material-UI v4, React Router
- **Backend**: Express, Backstage backend framework
- **Database**: PostgreSQL (production), SQLite (local dev default)
- **Testing**: Jest, Playwright, Testing Library
- **Build**: Backstage CLI

## Important Notes

### Build & Deployment

- **Docker**: Backend Dockerfile in `packages/backend/Dockerfile`
- **Helm**: Charts in `helm/backstage/` directory
- **CI/CD**: CircleCI (see `.circleci/config.yml`)
- **Release Process**: Uses Changesets (`yarn release` command)

### Dependencies

- Backstage packages use `backstage:^` version specifier (managed by Backstage CLI)
- Uses `patch-package` for dependency patches (applied in postinstall)
- Custom resolutions for React types and CodeMirror versions in root `package.json`
- Dependency updates: Renovate configured with grouped updates for Backstage packages

### Secrets

Never commit:

- `.env` file
- `*-credentials.yaml` files
- `certificate.yaml`
- `app-config.local.yaml`

### Code Quality

- Run `yarn prettier:fix` before committing
- Check types with `yarn tsc` before committing
- Pre-commit: lint-staged configured for automatic linting/formatting

### Key Features & Integrations

- **Authentication**: GitHub OAuth, custom GS auth module
- **Kubernetes**: Full integration with custom React hooks and components
- **Flux**: Flux CD integration for GitOps workflows
- **Scaffolder**: Custom templates and field extensions
- **TechDocs**: Custom TechDocs backend module
- **Monitoring**: Sentry integration, TelemetryDeck integration

### Upstream Reference

This project customizes [Backstage](https://github.com/backstage/backstage). Two upstream repos serve as reference for idiomatic patterns:

- **Backstage monorepo** — core packages, plugins, and APIs
- **Community plugins** — additional plugins maintained by the community

Use the `/upstream-search` skill to search these repos for implementation patterns, API usage examples, and reference code. Claude should proactively check upstream when implementing features that likely exist in the Backstage ecosystem (NFS patterns, backend plugins, scaffolder extensions, catalog entities, etc.).

**Developer setup** — clone the repos and set env vars in `~/.zshrc` or `~/.bashrc`:

```bash
export BACKSTAGE_UPSTREAM_DIR="/path/to/backstage/backstage"
export COMMUNITY_PLUGINS_DIR="/path/to/backstage/community-plugins"
```

### Backstage Plugin Skills

Two Claude Code skills provide guided workflows for building new Backstage plugins:

- **`/backstage-frontend-plugin`** — New Frontend System: `createFrontendPlugin`, blueprints, routes, Utility APIs, testing. Use when creating pages, nav items, entity content, or cards.
- **`/backstage-backend-plugin`** — New Backend System: `createBackendPlugin`, core services, DI, httpRouter, secure-by-default auth, Knex DB, testing. Use when creating APIs or background jobs.

These skills require the external skills repo. Clone it and set the env var:

```bash
git clone git@github.com:rothenbergt/backstage-agent-skills.git

# In ~/.zshrc or ~/.bashrc
export BACKSTAGE_AGENT_SKILLS_DIR="/path/to/backstage-agent-skills"
```

Without the env var, the skills will hard-stop and ask you to configure it.

### Ownership

- Code Owners: Team Honeybadger (@giantswarm/team-honeybadger)
