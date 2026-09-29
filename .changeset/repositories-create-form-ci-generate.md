---
'@giantswarm/backstage-plugin-repositories': minor
---

Create repository says what it does in the order the manager writes as the
person -- the repository, one scaffold commit on its default branch (the first
release follows from that push), then the declaration as a pull request under
the person's name -- and its result names the three in that order, with the
repository and the scaffold commit linked. The dry run shows the creation as
the manager plans it (create, scaffold, then the pull request), or the
manager's refusal of the creation. The wait text after Create no longer says
the reconciler creates the repository: it sets a repository that exists up.

The form gains **Generate CircleCI config** (`gen.ci.generate`, on by
default), written out true or false the way `devctl repo create` writes it.
A configuration repository -- `language: generic`, no `app` flavour, nothing
to build -- can now be created from the page: the manager's refusal
(`gen.ci.generate: no CircleCI job … set it to false`) is rendered with its
fix as a button that turns the switch off and runs the dry run again. A Go
service and a chart-only app keep `gen.ci.generate: true`.
