# User Interface

When working with the Backstage user interface, e. g. in order to create new components, some resources will be helpful.

## Component libraries

There are three UI layers in this repo, in order of preference for new work:

- **bui** (`@backstage/ui`, aka "Backstage UI") — the new Backstage design
  system and the direction we are migrating toward. **Prefer it for new work.**
  The global stylesheet is imported once in `packages/app/src/index.tsx`.

- **core-components** (`@backstage/core-components`) — the classic Backstage
  components. Legacy, but still required where bui has no equivalent yet (e.g.
  the feature-rich `Table`, the `Page`/`Header`/`Content` scaffolding, and
  `Link` with route refs).

- [Material UI version 4](https://v4.mui.com/) (`@material-ui/core`) — legacy
  primitives and `makeStyles`, used for styling and gaps the above don't cover.

Mixing all three in one file is normal during the migration. Reach for bui
first and fall back only when a piece is missing.

## Storybook

The [Backstage Storybook](https://backstage.io/storybook/) allows to explore the
existing UI components in a number of different states. It renders stories from
the upstream `backstage/backstage` monorepo; we do not run a local storybook.

To read the source behind a story (to learn a pattern or a component's props),
use the `index.json` → `importPath` → GitHub raw technique described in the
`ui` Claude Code skill (`.claude/skills/ui/SKILL.md`).
