---
name: common
description: Common rules for working with this repository
---

## General

- This is a NodeJS project
- The project mainly provides a customized version of https://github.com/backstage/backstage
- The application is deployed as Giant Swarm's developer portal both for Giant Swarm customers as well as Giant Swarm's internal use

## Project Structure

- **Monorepo**: Uses Yarn workspaces with packages in `packages/` and plugins in `plugins/`
- **Packages**:
  - `packages/app` - Frontend application (React)
  - `packages/backend` - Main backend service
  - `packages/backend-headless-service` - Headless backend service
  - `packages/backend-common` - Shared backend utilities
- **Custom Plugins**:
  - `plugins/gs` - Main Giant Swarm frontend plugin (largest plugin with 375+ files)
  - `plugins/gs-backend` - Backend plugin for GS functionality
  - `plugins/flux` & `plugins/flux-react` - Flux CD integration
  - `plugins/kubernetes-react` - Kubernetes utilities and hooks
  - `plugins/ui-react` - Shared UI component library
  - `plugins/gs-common` - Shared constants and utilities
  - Backend modules: `auth-backend-module-gs`, `scaffolder-backend-module-gs`, `techdocs-backend-module-gs`

## Technology Stack

- **Runtime**: Node.js 20, 22, or 24 (recommended: 24)
- **Package Manager**: Yarn 4.10.3
- **Language**: TypeScript ~5.9.0
- **Frontend**: React 18, Material-UI v4, React Router v6
- **Backend**: Express 5, Backstage backend framework
- **Database**: PostgreSQL (production), SQLite (local dev)
- **Testing**: Jest, Playwright (E2E), Testing Library
- **Build Tools**: Backstage CLI, TypeScript compiler

## Development Setup

- **Devcontainer**: Recommended development environment (VS Code devcontainer support)
- **Environment Variables**:
  - Requires `.env` file (not checked in)
  - Secrets stored in 1Password secure notes
  - Uses `env-cmd` for loading environment variables
  - GitHub OAuth credentials in `github-app-development-credentials.yaml` (not checked in)
- **Local Config**: Copy `app-config.local.yaml.example` to `app-config.local.yaml`
- **Database**: Run PostgreSQL via Docker (see `docs/development.md`)
- **HTTPS Support**: Configure via `certificate.yaml` (see `certificate.yaml.example`)
- **Prettier**: Run `yarn prettier:fix` before committing code changes.

## Code Organization & Naming Conventions

- **Components**: PascalCase (e.g., `GSClustersPage`, `EntityGSDeploymentsContent`)
- **Hooks**: camelCase with `use` prefix (e.g., `useDeploymentStatusDetails`, `useFluxResources`)
- **Utilities**: camelCase (e.g., `generateUID`, `parseDate`, `toTitleCase`)
- **Plugins**: lowercase with hyphens (e.g., `gs`, `flux-react`, `kubernetes-react`)
- **Exports**: Components exported with `GS` prefix for Giant Swarm customizations
- **File Structure**:
  - Components organized by feature/domain in subdirectories
  - Each component directory typically contains: component file, `index.ts`, and sometimes tests
  - Hooks in `hooks/` subdirectories
  - Utilities in `utils/` subdirectories

## Testing

- **Unit Tests**: Jest with `.test.ts` or `.test.tsx` naming convention
- **E2E Tests**: Playwright tests in `e2e-tests/` directories
- **Test Commands**:
  - `yarn test` - Run tests
  - `yarn test:all` - Run tests with coverage
  - `yarn test:e2e` - Run Playwright E2E tests
- **Coverage**: Reports generated in `coverage/` directory
- **Test Files**: Located alongside source files or in `setupTests.ts` files

## Code Quality & Linting

- **Linting**: ESLint with Backstage configuration
- **Formatting**: Prettier (Backstage config)
- **Lint Commands**:
  - `yarn lint` - Lint changed files since origin/main
  - `yarn lint:all` - Lint all files
  - `yarn fix` - Auto-fix linting issues
- **Pre-commit**: lint-staged configured for automatic linting/formatting
- **Type Checking**:
  - `yarn tsc` - Type check with incremental mode
  - `yarn tsc:full` - Full type check without skipping lib checks

## Build & Deployment

- **Build Commands**:
  - `yarn build:all` - Build all packages
  - `yarn build:backend` - Build backend only
  - `yarn build:backend-headless-service` - Build headless service
- **Docker**: Backend Dockerfile in `packages/backend/Dockerfile`
- **Helm**: Charts in `helm/backstage/` directory
- **CI/CD**: CircleCI configuration (see `.circleci/config.yml`)
- **Release Process**: Uses Changesets (`yarn release` command)

## Dependencies & Patches

- **Backstage Packages**: Uses `backstage:^` version specifier (managed by Backstage CLI)
- **Patch Package**: Uses `patch-package` for dependency patches (applied in postinstall)
- **Resolutions**: Custom resolutions for React types, CodeMirror versions, and other dependencies
- **Dependency Updates**: Renovate configured with grouped updates for Backstage packages

## Configuration Files

- **App Config**: `app-config.yaml` (base), `app-config.local.yaml` (local overrides), `app-config.production.yaml` (production)
- **TypeScript**: `tsconfig.json` extends Backstage CLI config
- **Prettier**: Uses Backstage CLI Prettier config
- **Package Manager**: Yarn 4 with PnP support

## Key Features & Integrations

- **Authentication**: GitHub OAuth, custom GS auth module
- **Kubernetes**: Full Kubernetes integration with custom React hooks and components
- **Flux**: Flux CD integration for GitOps workflows
- **Scaffolder**: Custom scaffolder templates and field extensions
- **TechDocs**: Custom TechDocs backend module
- **Catalog**: Custom catalog pages and entity cards
- **Notifications**: Backstage notifications integration
- **Search**: Backstage search with catalog and TechDocs modules
- **Monitoring**: Sentry integration, TelemetryDeck integration

## Important Notes

- **Secrets**: Never commit `.env`, `*-credentials.yaml`, or `certificate.yaml` files
- **Local Files**: `*.local.yaml` files are gitignored
- **Database**: Uses in-memory SQLite for local dev, PostgreSQL for production
- **Ports**: Frontend on 3000, Backend on 7007
- **Devcontainer**: Includes Docker support for TechDocs generation
- **Code Owners**: Team Honeybadger (@giantswarm/team-honeybadger) owns all files
