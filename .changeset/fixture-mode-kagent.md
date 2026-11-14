---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-agent-platform-common': patch
'@giantswarm/backstage-plugin-gs-common': patch
---

Fixture mode serves kagent, outside production builds only: the session lists, Usage · Your sessions, a session's page and the New session dialog show sessions without a cluster, with conversations recast from the recorded kagent answers, newest turns in every state (completed with an attachment, running, waiting on an approval or on answers, failed, canceled, runtime lost), and a session started from the dialog opens and replays its first turn from a recorded stream. Answers, cancels, renames and deletes are kept in memory until the page reloads. The data set of `@giantswarm/backstage-plugin-gs-common/fixtures` gives each session the state of its newest turn and each installation a session per turn state; `@giantswarm/backstage-plugin-agent-platform-common/testFixtures` exports the recorded approval, canceled and stream answers.
