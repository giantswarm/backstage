---
name: backstage-frontend-plugin
description: 'Build Backstage frontend plugins with the new Frontend System: createFrontendPlugin, blueprints, routes, Utility APIs, testing. Use for pages, nav, entity content, or cards.'
version: 1.0.0
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# Backstage Frontend Plugin (New Frontend System)

## Context

- Skills repo dir: !`echo $BACKSTAGE_AGENT_SKILLS_DIR`

## Instructions

Check the context above. If the skills repo dir is not empty, follow the **Full Mode** instructions. Otherwise, **STOP** and follow the **Setup Required** instructions.

---

## Full Mode (skills repo available)

The full skill with detailed reference documentation is available externally.

1. **Read the full SKILL.md** from the external repo:

   Read file: `${BACKSTAGE_AGENT_SKILLS_DIR}/backstage-frontend-plugin/SKILL.md`

2. **Follow all instructions** in that file exactly as written.

3. **Resolve reference links** against the external repo directory. When the external SKILL.md references `./reference/blueprints.md`, `./reference/utility_apis.md`, or `./reference/testing.md`, read them from:

   `${BACKSTAGE_AGENT_SKILLS_DIR}/backstage-frontend-plugin/reference/<filename>`

4. **Use the local cleanup script** from this project (not the external one):

   `node .claude/skills/backstage-frontend-plugin/scripts/cleanup-scaffolding.js <plugin-path>`

---

## Setup Required (skills repo not available)

**STOP. Do not attempt to build a frontend plugin without the skills repo.**

The `BACKSTAGE_AGENT_SKILLS_DIR` environment variable is not configured. This skill requires the external reference documentation to work correctly.

**Tell the user:**

To use this skill, clone the skills repo and set the environment variable:

```bash
git clone git@github.com:rothenbergt/backstage-agent-skills.git
```

Then add to your `~/.zshrc` or `~/.bashrc`:

```bash
export BACKSTAGE_AGENT_SKILLS_DIR="/path/to/backstage-agent-skills"
```

Restart your shell (or run `source ~/.zshrc`) and try again.
