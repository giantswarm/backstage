---
name: release-notes
description: Improve the release notes of a giantswarm/backstage GitHub release - regroup the generated git-cliff list, sort it by module, and add a short description of what each change means, read from its pull request. Use when asked to improve, enrich, curate or rewrite release notes or a release page of this repository.
user-invocable: true
---

# Release notes

The auto-release workflow (`.github/workflows/zz_generated.auto_release.yaml`)
publishes every release with notes rendered by git-cliff (`cliff.toml`): one
line per conventional commit, grouped by type. This skill rewrites such a body
into notes a reader understands without opening each pull request. It is phase
one of the release communication; the weekly digest for Slack (phase two) is
built from the notes it produces.

## Which releases

- Only final releases (`vX.Y.Z`). Skip pre-releases (`-rc.N` tags,
  `isPrerelease: true`): their notes are cumulative and get replaced by the
  final release.
- Releases on every line: main (v2.x) and the backport lines (v0.24x).
- A body that ends with the marker `<!-- release-notes: curated -->` has been
  done already. Redo it only when asked.

## Collect

Work in the session scratchpad. Save the original body before changing
anything:

```bash
gh release view v2.92.2 -R giantswarm/backstage --json tagName,isPrerelease,body \
  --jq .body > v2.92.2.orig.md
```

Read the full description of every pull request in the release, in parallel
(`gh pr view <n> -R giantswarm/backstage --json title,body,files`). The
"What is the effect of this change to users?" section is the best starting
point, when there is one.

A line without a PR link and author comes from a backport line, where
git-cliff resolves neither. The squash commit's subject still ends in the PR
number:

```bash
gh api repos/giantswarm/backstage/compare/v0.246.2...v0.246.3 \
  --jq '.commits[] | .commit.message | split("\n")[0]'
```

Link the title to that PR and add its author. A backport describes the same
change as its main-line PR, which the backport PR names.

## Structure

Groups, in this order, each left out when empty:

1. `### Added` - `feat`
2. `### Changed` - `refactor`, `perf`, `chore`, `test`, `build`
3. `### Fixed` - `fix`
4. `### Security` - `security`
5. `### Development and CI/CD` - changes to how the portal is developed,
   tested, built and deployed rather than to what the portal does, whatever
   their type: `ci`, dependency updates (`(deps)`), the Helm chart
   (`(chart)`, `(helm)`), CI and repository configuration (the generated
   align-files PRs), e2e suites and local tooling (`(e2e)`, a `fix` to
   `yarn tsc`), and changes to comments and docs only (module `docs`).

A PR that changes the portal and touches the chart on the side (a backend fix
that adds a probe) goes by its main change, not to Development and CI/CD.

Within a group, sort by module, alphabetically. The module is the commit's
scope. A line without one gets a module from what the PR changes: the plugin
or package (`muster`), up to three of them (`agent-platform,
platform-capabilities, repositories`), `several plugins` for more, or `ci`
for CI and repository configuration. Several modules are separated by a comma
and a space (git-cliff's `ui-react,gs` becomes `ui-react, gs`). Lines of one
module keep their original order. `several plugins` goes last.

Each line starts with the module in plain parentheses (git-cliff's italics
dropped), then the original title as a link to its PR (replacing git-cliff's
`in [#N](...)`), then the author as git-cliff wrote it. The link makes the
title stand out without emphasis, and the line can still be matched to its
commit:

```markdown
- (agent-platform, platform-capabilities, repositories) [Hold every busy dialog open through dialogDismissLock](https://github.com/giantswarm/backstage/pull/2782) by [@teemow](https://github.com/teemow)
```

A line without a PR keeps its title as plain text.

Keep the `**Full Changelog**` link at the end.

## Descriptions

Every line except dependency updates gets a description, appended after the
author with an em dash (` — `, U+2014; GitHub renders `--` as two hyphens):

```markdown
- (gs) [Pre-fill the edit template's custom version range](https://github.com/giantswarm/backstage/pull/2801) by [@teemow](https://github.com/teemow) — On a deployment's page, `Edit` keeps a custom automatic-upgrade range such as `>=1.0.0 <3.0.0` instead of replacing it with `^`, `~` or `>=` plus the current version.
```

- One or two sentences, about 15 to 45 words: what a person now sees, can do
  or no longer runs into.
- Say where in the portal: the page, tab, card or dialog.
- Text the portal shows verbatim goes in backticks, spelled as the code
  renders it (grep the plugin; PRs paraphrase it): labels of buttons, fields
  and rows (`` `Edit` ``, `` `Auto-upgrade` ``), and the values and messages
  a person reads (`` `Release candidates only` ``, `` `No merged plans` ``).
  Not bold and not quotes. Pages and tabs are named in
  plain words (Hive's Roadmap tab).
- Concrete, no "improved" or "better": name the change, with an example when
  it helps (an error message, a value).
- Name preconditions (e.g. "on installations with a Postgres database", a
  config key that enables it). A feature disabled by default says so.
- When a release ships a feature that a later release replaces, say so (e.g.
  "Hive replaces it in v2.92.0"), so a reader of the older page isn't sent
  looking for it.
- When a change outside Development and CI/CD is not for portal users, open
  with whom it is for: "For operators:" (backend configuration, logs,
  telemetry), "For template authors:" (scaffolder actions and field options
  that only matter when writing a template).
- Dependency updates get no description, even when the PR changed code to
  follow the update.
- Leave out implementation detail (component, hook and helper names), unless
  it is the setting an operator has to know (a chart value, a config key).
- The repository is public: no installation or customer names.

## Publish

Write the new body to a file and show it, with what changed against the
original, before publishing. Publishing edits a public page, so do it only
after the user approved these notes, one release or a batch. Before
publishing, check:

- Every PR of the original is in the new body (compare the `pull/<n>` links).
- No installation or customer names (PRs sometimes name them).
- The live body still equals the saved original, so nobody's edit is lost.

End the body with the marker, then:

```bash
gh release edit v2.92.2 -R giantswarm/backstage --notes-file v2.92.2.md
```

Read the body back afterwards and compare it with the file.
