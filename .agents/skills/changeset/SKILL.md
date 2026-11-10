---
name: changeset
description: Create a changeset file for versioning packages, and decide whether a change needs one. Use when the user wants to document changes for release, create a changelog entry or bump package versions, and when asking whether a PR needs a changeset or what happens to one after it is merged.
user-invocable: true
allowed-tools: Read, Write, Glob, Grep, AskUserQuestion
---

# Changeset Creation Skill

Create changeset files for projects using @changesets/cli.

## When a change needs one

Add a changeset for **any user-facing change to a `packages/*` or `plugins/*`
package** — a new feature, a new export, a behaviour change, a fix somebody
would want to read about. `minor` for a new feature or export, `patch` for a
fix.

Skip it for changes with no consumer-visible effect: refactors that keep the
same behaviour and API, test-only changes, comments, and documentation.

Two things that are *not* reasons to skip:

- **`"private": true`.** The `packages/*` packages (`app`, `backend`,
  `backend-headless-service`, `@internal/backend-common`) are private and still
  receive changesets: `privatePackages.version` in `.changeset/config.json`
  gives them version bumps and CHANGELOG entries, only the npm publish is
  skipped.
- **An entry in the root `CHANGELOG.md`.** That is a different artefact — see
  below.

## The two release axes, and what a changeset actually does

**The app** (image + Helm chart) releases on every push to `main`:
`.github/workflows/zz_generated.auto_release.yaml` runs git-cliff over
conventional-commit PR titles, tags `vX.Y.Z` and creates the GitHub Release,
which triggers the CircleCI architect pipeline. No release PR and no approval
step. That axis reads PR titles and the root `CHANGELOG.md`; it never looks at
`.changeset/`. Note it does not bump `package.json` either, which is why the
root `version` (0.138.0) has nothing to do with the `vX.Y.Z` tags.

**The plugin packages** are changeset-managed and published to npm:

- every `plugins/*` package is public (`@giantswarm/backstage-plugin-*`,
  `publishConfig.access: public`); the `packages/*` packages stay private and
  are versioned but never published
- `.github/workflows/release-plugins.yaml` runs on every push to `main`. With
  pending changesets it pushes `changeset-release/main` and opens or refreshes
  the pull request `chore(release): version packages` (`yarn release:version`:
  versions, CHANGELOGs, lockfile). Once that pull request merges no changesets
  are left, and the same workflow builds the plugins and publishes every public
  package whose version is not on npm yet (`yarn release:publish`). A merge
  without a changeset publishes nothing
- the plugins get no git tags and no GitHub Releases: git-cliff has no
  `tag_pattern` and would take a plugin tag as the app's last release. The npm
  registry and the per-package `CHANGELOG.md` are the record
- merging the Version Packages pull request is a `chore` commit on `main`,
  which git-cliff releases as an app patch: that image carries the new plugin
  versions

**So a changeset is the release note and the version bump of the package.** A
pull request without one changes nothing on npm, and nobody reconstructs a
release note from a diff months later.

## Checking your work

`yarn changeset status` compares the branch with `main` (`baseBranch`): on a
branch that adds a changeset it lists the packages and bump levels, on a branch
that changes a package without one it exits 1 and says so, and on `main` itself
it prints an empty list. Under `.changeset/config.json` this works for every
package; a private package is only skipped when `privatePackages.version` is
off, which is what made the list empty for the whole repository before the
plugin axis went live.

## Context

- Existing changesets: !`ls .changeset/*.md 2>/dev/null | head -5`
- Workspace packages: !`find packages plugins -maxdepth 2 -name package.json -exec jq -r .name {} \; 2>/dev/null | sort`

## Instructions

### Step 1: Detect Packages

1. This is a monorepo with workspaces in `packages/*` and `plugins/*`
2. Find all `package.json` files in workspace directories and extract names
3. **IMPORTANT**: Never use the root package name ("root") - only use actual workspace package names
4. Common packages for app-wide changes: `app`, `backend`

### Step 2: Gather Information

Use AskUserQuestion tool to ask:

1. **Package Selection** (if multiple packages): Which packages should be included? Use multiSelect: true to allow selecting multiple packages.
2. **Version Bump Type**: For each selected package - patch, minor, or major?
3. **Summary**: Brief description of changes for the changelog

### Step 3: Generate Unique Filename

Generate a unique file name for the changeset by running the script `.claude/skills/changeset/generate-file-name.sh`.

### Step 4: Write Changeset File

Create the file with the name obtained in step 3 with the following content:

```markdown
---
'package-name': patch
---

Summary description here.
```

Rules:

- Package names MUST be quoted
- Only use actual workspace package names (e.g., `app`, `backend`, `@giantswarm/backstage-plugin-gs`)
- NEVER use the root package name ("root") - it will break `yarn changeset version`
- End file with newline
- Create `.changeset/` directory if missing

### Step 5: Confirm

Display:

1. Path to created changeset
2. File contents
3. Remind user to commit the file
