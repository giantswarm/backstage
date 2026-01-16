# Release Process

This command prepares a new release by analyzing changesets and updating the CHANGELOG.
When the release branch is pushed, GitHub Actions will automatically run `yarn release` to finalize versioning.

## Prerequisites

1. Ensure you're on a clean working directory
2. Have all changesets added (check `.changeset/*.md` files exist)

## Steps

### 1. Analyze Changesets

Read all `*.md` files in `.changeset/` folder (excluding `README.md`) to:

- Understand which packages are being updated
- Identify the bump level for each package (major, minor, or patch)
- Extract the description of each change

Example changeset format:

```yaml
---
'@giantswarm/backstage-plugin-name': patch
---
Description of the change.
```

**Determine the overall release level** (highest bump level wins):

- **major** (X.0.0) - Breaking changes
- **minor** (0.X.0) - New features, backwards compatible
- **patch** (0.0.X) - Bug fixes, minor changes

**If no changesets are found:**

If there are no `*.md` files in `.changeset/` (excluding `README.md`), ask the user:

1. If they still want to proceed with a release
2. If yes, ask them to provide:
   - The release level (major, minor, or patch)
   - The changelog entry describing what should be included in the release

### 2. Prepare Release Branch

```bash
# Switch to main and pull latest
git checkout main
git pull origin main

# Create release branch using determined level
git checkout -b "main#release#${level}"  # e.g., main#release#patch
```

### 3. Update CHANGELOG.md

Add a concise summary of changes to the `## [Unreleased]` section in the root `CHANGELOG.md`.

**Categorize changes** based on their descriptions:

- **Added** - New features, new functionality ("add", "implement", "introduce")
- **Changed** - Changes to existing functionality ("update", "modify", "improve", "upgrade")
- **Fixed** - Bug fixes ("fix", "resolve", "correct")
- **Removed** - Removed features ("remove", "delete")
- **Deprecated** - Soon-to-be removed features ("deprecate")
- **Security** - Security fixes ("security", "vulnerability", "CVE")

**Format:**

```markdown
## [Unreleased]

### Category

- Concise description from changeset.
- Another change if applicable.
```

**Guidelines:**

- Keep descriptions short and user-focused
- Only include categories that have changes
- Combine related changes if they're similar
- Don't add version number or date (automation will handle this)
- Don't add reference links (automation will generate these)

**Example result:**

```markdown
## [Unreleased]

### Fixed

- Fix dependency issue.

## [0.96.3] - 2026-01-15

...
```

### 4. Review Changes

Review the CHANGELOG.md update:

```bash
git diff CHANGELOG.md
```

Verify:

- Changes are under `## [Unreleased]` section only
- Descriptions are clear, concise, and user-friendly
- Categories are appropriate for the changes
- All important changes from changesets are represented
- No version numbers or dates added (automation handles this)

### 5. Commit and Push

```bash
# Stage CHANGELOG.md
git add CHANGELOG.md

# Commit with descriptive message
git commit -m "Prepare release: update CHANGELOG for ${level} release"

# Push to remote - this triggers automation
git push origin main#release#${level}
```

### 6. Monitor and Merge Release PR

When the branch is pushed, GitHub Actions automatically:

1. Runs `yarn release` to version packages and update CHANGELOGs
2. Creates a Release PR from your branch to `main`

**Next steps:**

1. Go to the GitHub Actions tab and monitor the workflow completion
2. Once the workflow completes, navigate to the automatically created Release PR
3. Review the changes in the PR (version numbers, CHANGELOG updates, etc.)
4. Merge the Release PR
