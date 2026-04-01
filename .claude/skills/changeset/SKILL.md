---
name: changeset
description: Create a changeset file for versioning packages. Use when the user wants to document changes for release, create a changelog entry, or bump package versions.
user-invocable: true
allowed-tools: Read, Write, Glob, Grep, AskUserQuestion
---

# Changeset Creation Skill

Create changeset files for projects using @changesets/cli.

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
