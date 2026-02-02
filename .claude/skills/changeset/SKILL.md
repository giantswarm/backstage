---
name: changeset
description: Create a changeset file for versioning packages. Use when the user wants to document changes for release, create a changelog entry, or bump package versions.
allowed-tools: Read, Write, Glob, Grep, AskUserQuestion
---

# Changeset Creation Skill

Create changeset files for projects using @changesets/cli.

## Context

- Existing changesets: !`ls .changeset/*.md 2>/dev/null | head -5`
- Package name: !`cat package.json 2>/dev/null | jq -r '.name // "unknown"'`
- Workspaces: !`cat package.json 2>/dev/null | jq -r '.workspaces // empty'`

## Instructions

### Step 1: Detect Packages

1. Check if monorepo or single-package:
   - Look for `workspaces` in `package.json`
   - Look for `pnpm-workspace.yaml`

2. For monorepos: Find all `package.json` files in workspace directories and extract names
3. For single-package: Use the `name` from root `package.json`

### Step 2: Gather Information

Use AskUserQuestion tool to ask:

1. **Package Selection** (if multiple packages): Which packages should be included? Use multiSelect: true to allow selecting multiple packages.
2. **Version Bump Type**: For each selected package - patch, minor, or major?
3. **Summary**: Brief description of changes for the changelog

### Step 3: Generate Unique Filename

Generate human-readable ID: `{adjective}-{noun}-{verb}`

**Word lists:**

Adjectives: ancient, bright, calm, deep, eager, fair, gentle, happy, icy, jolly, kind, light, mild, noble, odd, plain, quick, rare, soft, tall, unique, vast, warm, young, zesty, bold, clean, dark, empty, fresh, grand, humble, ideal, keen, loud, merry, neat, open, proud, quiet, rich, sharp, sweet, tidy, vivid, wise, witty, brave, clever

Nouns: apple, beach, cloud, eagle, flame, grape, heart, island, jewel, kite, lemon, maple, night, ocean, pearl, river, stone, tiger, violet, water, bamboo, canyon, desert, ember, forest, garden, harbor, jungle, kingdom, lagoon, meadow, nebula, oasis, planet, rainbow, sunset, thunder, valley, willow, bridge, castle, dolphin, falcon, glacier, horizon, lantern, mirror, orchard, phoenix

Verbs: bloom, climb, dance, explore, float, glide, hover, ignite, jump, kindle, launch, melt, nestle, orbit, ripple, shine, travel, unfold, venture, wander, adapt, blend, create, drift, emerge, flow, grow, heal, inspire, journey, learn, mingle, observe, persist, reflect, soar, thrive, twist, unite, whisper

Pick one word randomly from each list. Check if `.changeset/{id}.md` exists; if so, regenerate.

### Step 4: Write Changeset File

Create `.changeset/{id}.md`:

```
---
"package-name": patch
---

Summary description here.
```

Rules:

- Package names MUST be quoted
- End file with newline
- Create `.changeset/` directory if missing

### Step 5: Confirm

Display:

1. Path to created changeset
2. File contents
3. Remind user to commit the file
