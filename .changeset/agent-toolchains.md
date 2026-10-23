---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-analytics-react': minor
---

Customize gains a Toolchains tab, where an installation runs the
toolchain-manager: the toolchains its sources publish, each with its versions
and its newest version's tools, and the sources with Add source. A
toolchain's page shows, per version, its tools, Harnesses, pinned packages
and binaries, egress and Dockerfile; New toolchain writes a Dockerfile from
picked Alpine packages and opens it as the person's pull request in a source,
following its build to the published image. The New session dialog offers
the session's toolchains beside the workspace, preset to the agent's
defaults: a toolchain added, removed or set to another version reaches
`start_session`.
