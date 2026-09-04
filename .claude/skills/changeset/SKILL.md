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

- **`"private": true`.** Every `packages/*` and `plugins/*` package in this repo
  is private, and they all still receive changesets, because here changesets
  produce per-package CHANGELOGs rather than npm publishes.
- **An entry in the root `CHANGELOG.md`.** That is a different artefact — see
  below.

## The two release axes, and what a changeset actually does

**The app** (image + Helm chart) releases on every push to `main`:
`.github/workflows/zz_generated.auto_release.yaml` runs git-cliff over
conventional-commit PR titles, tags `vX.Y.Z` and creates the GitHub Release,
which triggers the CircleCI architect pipeline. No release PR and no approval
step. That axis reads PR titles and the root `CHANGELOG.md`; it never looks at
`.changeset/`. Note it does not bump `package.json` either, which is why the
root `version` reads 0.138.0 against `v0.220.x` tags.

**The plugin packages** are changeset-managed, but that axis is currently
dormant:

- every `packages/*` and `plugins/*` package is `"private": true`, and
  `.changeset/config.json` sets `access: "restricted"` with no
  `privatePackages` override
- nothing in `.github/workflows` or `.circleci` runs `changeset version` or
  `changeset publish`
- so nothing is published to npm, and **pending changesets are consumed by
  nothing**. The newest per-package CHANGELOG entry on `main` is `v0.137.1`
  (2026-06-18), from the last PR-based `chore(release)` that ran
  `changeset version` before the push-based git-cliff tagger replaced it;
  `docs/releases/` likewise stops at v0.138.0. Changesets have been
  accumulating since (141 at the time of writing, oldest from early August)
- the wiring that would switch it on — dropping `private`, `access: public`, a
  changesets/action "Version Packages" PR — exists on an unmerged branch;
  issue **#1772 step 4** is the durable pointer

**So why still write one?** Because it is the queued release note. It produces
no CHANGELOG entry today, but it is what the entry gets generated from once the
axis is switched back on, and nobody reconstructs a release note from a diff
months later. Writing one costs a minute; recovering one after the fact costs an
archaeology session.

Whether to revive the axis, or to stop accumulating, is #1772's question — not
something to decide while writing a changeset.

## Checking your work

`yarn changeset status` does **not** work as a check in this repo: it prints an
empty "Packages to be bumped" list even with every pending changeset present, so
it reports the same thing whether or not you remembered one. Look for the file
in `.changeset/` instead. For the same reason, CI enforcement would have to be a
file-existence check rather than `changeset status`.

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
