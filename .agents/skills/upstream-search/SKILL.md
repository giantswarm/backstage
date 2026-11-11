---
name: upstream-search
description: Search upstream Backstage and community-plugins repositories for implementation patterns, API usage, and reference code. Use when implementing features that may exist upstream, checking idiomatic Backstage patterns, or when explicitly asked to look at upstream code.
allowed-tools: Read, Grep, Glob
---

# Upstream Backstage Search

Search upstream Backstage repositories for reference implementations, patterns, and API usage.

## Context

- Backstage upstream repo: !`echo $BACKSTAGE_UPSTREAM_DIR`
- Community plugins repo: !`echo $COMMUNITY_PLUGINS_DIR`

## Repository Availability

Check the context above. If a repo path is empty, that repo is unavailable.

**IMPORTANT: If repos are unavailable, you MUST stop and ask the user.** Do NOT silently fall back to `node_modules` or any other source. Show the user this setup guide and ask how they want to proceed:

> To enable upstream search, clone the repos locally and set environment variables in your shell profile:
>
> ```bash
> # In ~/.zshrc or ~/.bashrc
> export BACKSTAGE_UPSTREAM_DIR="/path/to/backstage/backstage"
> export COMMUNITY_PLUGINS_DIR="/path/to/backstage/community-plugins"
> ```
>
> Clone from:
>
> - https://github.com/backstage/backstage
> - https://github.com/backstage/community-plugins

Then ask the user whether they want to:

1. Set up the repos now (recommended)
2. Use a fallback approach instead (search `node_modules/@backstage/` or `gh api`)

**Do NOT proceed with any search until the user responds.**

## Repository Structure

### Backstage Upstream (`BACKSTAGE_UPSTREAM_DIR`)

```
packages/
  app/                    # Reference app implementation
  backend/                # Reference backend implementation
  backend-defaults/       # Default backend setup
  catalog-model/          # Catalog entity types and validation
  core-components/        # Core React components (Table, etc.)
  core-plugin-api/        # Frontend plugin API
  frontend-plugin-api/    # New Frontend System plugin API
  backend-plugin-api/     # Backend plugin API
  repo-tools/             # Monorepo tooling
plugins/
  catalog/                # Catalog frontend plugin
  catalog-backend/        # Catalog backend plugin
  scaffolder/             # Scaffolder frontend
  scaffolder-backend/     # Scaffolder backend
  techdocs/               # TechDocs frontend
  kubernetes/             # Kubernetes frontend
  kubernetes-backend/     # Kubernetes backend
  search/                 # Search frontend
  auth-backend-module-*/  # Auth provider modules
  ...                     # Many more plugins
```

### Community Plugins (`COMMUNITY_PLUGINS_DIR`)

```
workspaces/
  <workspace-name>/
    plugins/
      <plugin-name>/      # Each plugin in its workspace
```

## When to Search Proactively

Search upstream **before implementing** when:

- Implementing a feature that likely exists in the Backstage ecosystem
- Using New Frontend System (NFS) patterns — blueprints, extensions, `createFrontendPlugin`
- Using new backend system patterns — `createBackendPlugin`, `createBackendModule`
- Creating scaffolder field extensions or custom actions
- Working with catalog entity types, processors, or providers
- Implementing auth providers or modules
- Adding search collators or decorators
- Building custom permission rules
- Unsure about the idiomatic way to use a Backstage API

## Tool Usage

**NEVER use Bash** (e.g., `ls`, `find`, `cat`) for file operations — only `Read`, `Glob`, and `Grep` are allowed. To list directory contents, use `Glob` with pattern `*` and the directory as `path` (e.g., `Glob: pattern="*" path=/some/dir`). This avoids permission prompts that would interrupt the user.

## Search Strategy

Use this priority order for efficiency:

### 1. Glob — Find files by name

Find plugin directories, specific files, or patterns:

```
# Find a plugin
Glob: pattern="plugins/catalog/**/*.ts" path=$BACKSTAGE_UPSTREAM_DIR

# Find NFS plugin definitions
Glob: pattern="plugins/*/src/alpha.tsx" path=$BACKSTAGE_UPSTREAM_DIR

# Find community plugin
Glob: pattern="workspaces/*/plugins/<name>/**" path=$COMMUNITY_PLUGINS_DIR
```

### 2. Grep — Search content

Find specific API usage, patterns, or implementations:

```
# Find NFS blueprint usage
Grep: pattern="PageBlueprint" path=$BACKSTAGE_UPSTREAM_DIR/plugins

# Find backend plugin creation
Grep: pattern="createBackendPlugin" path=$BACKSTAGE_UPSTREAM_DIR/plugins

# Find scaffolder extensions
Grep: pattern="createScaffolderFieldExtension" path=$COMMUNITY_PLUGINS_DIR
```

### 3. Read — Get full context

Once you've located relevant files, read them for full implementation details.

## Common Search Patterns

### Finding how a plugin is implemented

1. Glob for the plugin directory: `plugins/<name>/src/`
2. Read `plugin.ts` or `alpha.tsx` for plugin definition
3. Read `routes.ts` for route definitions
4. Read specific page/component files

### Finding NFS (New Frontend System) patterns

1. Grep for `createFrontendPlugin` in `plugins/*/src/alpha.tsx`
2. Grep for specific blueprints: `PageBlueprint`, `NavItemBlueprint`, `EntityContentBlueprint`
3. Read the matching files for full implementation

### Finding backend patterns

1. Grep for `createBackendPlugin` or `createBackendModule`
2. Look in `plugins/*-backend/src/plugin.ts`
3. Check service factories and route handlers

### Finding scaffolder extensions

1. Grep for `createScaffolderFieldExtension` in both repos
2. Check `plugins/scaffolder/src/extensions/` in upstream
3. Check community plugins for custom actions: Grep `createTemplateAction`

### Finding component examples

1. Grep for the component name (e.g., `InfoCard`, `Table`, `StructuredMetadataTable`)
2. Focus on `plugins/` directories for real usage examples
3. Read the component source in `packages/core-components/` for props and API

## Output

When reporting search results:

1. Show the file path and relevant code snippets
2. Explain how the upstream pattern relates to the current task
3. Note any differences between upstream patterns and this project's conventions
4. If the pattern has changed between Backstage versions, mention that
