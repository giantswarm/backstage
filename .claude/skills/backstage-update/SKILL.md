---
name: backstage-update
description: |
  Update Backstage dependencies to the latest version. Use when the user wants to
  update backstage, upgrade backstage packages, bump backstage version, or keep
  backstage up to date.
allowed-tools: Read, Bash, AskUserQuestion
---

# Backstage Update Skill

Update all @backstage packages to the latest release version.

## Context

- Current Backstage version: !`cat backstage.json 2>/dev/null | jq -r '.version'`
- Yarn plugin installed: !`grep -q "plugin-backstage" .yarnrc.yml 2>/dev/null && echo "Yes" || echo "No"`

## Instructions

### Step 1: Check Current Version

Read `backstage.json` to get the current Backstage release version.

### Step 2: Check for Available Updates

Run the versions check command to see what updates are available:

```bash
yarn backstage-cli versions:check
```

If the command returns no output or indicates packages are up to date, inform the user
and ask if they want to check for next (weekly) releases instead.

### Step 3: Choose Release Channel

Use AskUserQuestion to ask the user which release channel to use:

1. **Latest stable release** (Recommended) - Monthly releases, most stable
2. **Next release** - Weekly releases with newer features but potentially less stable

### Step 4: Run Version Bump

Execute the appropriate command based on user selection:

**For stable release:**

```bash
yarn backstage-cli versions:bump
```

**For next release:**

```bash
yarn backstage-cli versions:bump --release next
```

### Step 5: Install Dependencies

After bumping versions, install the new dependencies:

```bash
yarn install
```

### Step 6: Review Migration Notes

Provide the user with resources to check for breaking changes:

1. **Changelog**: https://github.com/backstage/backstage/blob/master/packages/create-app/CHANGELOG.md
2. **Upgrade Helper**: https://backstage.github.io/upgrade-helper/?from={old_version}&to={new_version}
   (Replace {old_version} and {new_version} with actual version numbers)

Ask the user if they want you to fetch and summarize the changelog for relevant versions.

### Step 7: Verify Update

Run verification commands to ensure no breaking changes:

```bash
yarn tsc
```

If type checking passes, run linting:

```bash
yarn lint
```

### Step 8: Summary

Display:

1. Version change (from → to)
2. List of key packages updated
3. Any warnings or errors from verification
4. Remind user to:
   - Test the application locally with `yarn start`
   - Review the Upgrade Helper for template changes
   - Commit the changes with a descriptive message

### Troubleshooting

**If yarn install fails:**

- Try running `yarn dedupe` to resolve duplicate packages
- Check for conflicting peer dependencies

**If type checking fails:**

- Check the changelog for breaking API changes
- Look for deprecated imports that need updating

**If the backstage yarn plugin is not installed:**

```bash
yarn plugin import https://versions.backstage.io/v1/tags/main/yarn-plugin
```
