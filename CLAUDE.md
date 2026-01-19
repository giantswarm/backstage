# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## About This Project

Giant Swarm's customized Backstage application for both internal use and customer portals.

## Development Commands

### Running Locally

```bash

# Start frontend and backend separately:

yarn start backend
yarn start app
```

### Testing

```bash
# Run unit tests (changed files only)
yarn test

# Run all tests with coverage
yarn test:all

# Run E2E tests
yarn test:e2e

# Run a single test file
yarn backstage-cli repo test path/to/test.test.ts
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
yarn prettier:fix

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

### Naming Conventions

- Components: PascalCase (e.g., `GSClustersPage`, `EntityGSDeploymentsContent`)
- Hooks: camelCase with `use` prefix (e.g., `useDeploymentStatusDetails`)
- Utilities: camelCase (e.g., `generateUID`, `parseDate`)
- Plugins: lowercase-with-hyphens (e.g., `gs`, `flux-react`)
- Exports: Components prefixed with `GS` for Giant Swarm customizations

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

### Dependencies

- Backstage packages use `backstage:^` version specifier (managed by Backstage CLI)
- Uses `patch-package` for dependency patches (applied in postinstall)
- Custom resolutions for React types and CodeMirror versions in root `package.json`

### Secrets

Never commit:

- `.env` file
- `*-credentials.yaml` files
- `certificate.yaml`
- `app-config.local.yaml`

### Code Quality

- Run `yarn prettier:fix` before committing
- Check types with `yarn tsc` before committing
